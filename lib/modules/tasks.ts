import cron from 'node-cron';
import type { Database } from './database';
import type { Container } from './container';
import type { EventBus } from './events';
import type { Routine } from '../templates/routine';
import { CRON, CronMetadata } from '../decorators/cron.decorator';
import { Logger } from '../utilities/logger';

/**
 * A scheduled task, as something that can be addressed.
 *
 * The fourth kind of token, and the only one that is not about two modules
 * meeting: a contract, a slot and an event all answer "how does another module
 * reach this". A task token answers "how does anybody turn this one on and
 * off", which is why it is imported by whoever controls the schedule rather
 * than by whoever implements it.
 *
 * Declared with `token(id, 'task')`, and the class that runs on it says so in
 * its `@Cron`.
 *
 * @example
 * export const NightlyBackup = token('system.nightly-backup', 'task');
 */
export interface TaskToken {
  readonly id: string;
  /** Set by `token()`. Tells a task from the three wiring kinds. */
  readonly kind: 'task';
}

/** What `app.task(Token)` and `this.task(Token)` hand back. */
export interface TaskHandle {
  /**
   * Starts the schedule. Returns whether this call was the one that started it:
   * calling it on a task that is already scheduled does nothing and returns
   * `false`, so an endpoint can be called twice without a second clock
   * appearing.
   */
  start(): boolean;
  /**
   * Stops the schedule. `false` if it was not scheduled.
   *
   * It stops the CLOCK, not a run already in flight: a stop during a billing
   * run lets that run finish. {@link isExecuting} is how you tell.
   */
  stop(): boolean;
  /** Whether the clock is ticking — whether another run will come. */
  isScheduled(): boolean;
  /**
   * Whether a run is in flight **right now**.
   *
   * Two different questions, and conflating them is how an operator reads
   * "running" and believes the work is done. A task can be scheduled and idle,
   * scheduled and executing, or stopped while a last run finishes.
   */
  isExecuting(): boolean;
  /**
   * Runs it once, now, without touching the schedule.
   *
   * This is the "Run now" button: generate this month's charges without waiting
   * for 3am, re-apply the cut-offs after fixing the data. It goes through the
   * SAME guard, so pressing it while the scheduled run is in flight does
   * nothing and resolves to `false` — which is the whole point for a job that
   * moves money.
   *
   * It works on a stopped task too: a schedule nobody turned on can still be
   * run by hand.
   */
  runNow(): Promise<boolean>;
}

/** Thrown for a task that does not exist, or two claiming one token. */
export class TaskError extends Error {
  constructor(
    message: string,
    public taskId: string,
  ) {
    super(message);
    this.name = 'TaskError';
  }
}

interface Registration {
  moduleId: string;
  TaskClass: new () => Routine;
  expression: string;
  options: cron.ScheduleOptions;
  autostart: boolean;
  /** Built on first start and reused: one task, one instance, ever. */
  instance?: Routine;
  scheduled?: cron.ScheduledTask;
  /** The clock is ticking. */
  scheduledOn: boolean;
  /** A run is in flight. What makes the executions sequential. */
  executing: boolean;
  /** Ticks dropped because the previous run had not finished. */
  skipped: number;
}

/**
 * Holds the application's scheduled tasks and owns their lifecycle.
 *
 * One runner per application rather than node-cron's process-wide registry:
 * two applications in one process — a test suite, a worker beside a server —
 * must not be able to stop each other's clocks.
 *
 * A task is a **singleton with a lifecycle**: one instance for the life of the
 * application, built the first time it starts, kept across a stop and a second
 * start. The instance is what makes `stop()` meaningful — the schedule stops
 * ticking and whatever the task holds stays as it was.
 */
export class TaskRunner {
  private readonly registrations = new Map<string, Registration>();

  private container?: Container;

  private events?: EventBus;

  constructor(private readonly db: Database) {}

  /** Hands the runner what a task gets injected, like the container does. */
  public useWiring(container?: Container, events?: EventBus): void {
    this.container = container;
    this.events = events;
  }

  /**
   * Records a task class under its token.
   *
   * Two classes on one token is a mistake and not a composition: unlike a slot,
   * a schedule has one clock, so the second one would silently shadow the first
   * or double the work depending on load order.
   */
  public register(moduleId: string, TaskClass: new () => Routine): void {
    const metadata = Reflect.getMetadata(CRON, TaskClass) as
      CronMetadata | undefined;

    if (!metadata) {
      // Same tolerance as a provider without `@Provides`: a file being written
      // is likelier than a broken installation. But it is said out loud, because
      // the symptom otherwise is a task that simply never runs.
      Logger.warn(
        `Task ${TaskClass.name} in module "${moduleId}" has no @Cron(token, expression) and was skipped.`,
      );
      return;
    }

    const { token, expression, options, autostart } = metadata;
    const existing = this.registrations.get(token.id);
    if (existing) {
      throw new TaskError(
        `Task "${token.id}" is claimed by ${existing.TaskClass.name} (module "${existing.moduleId}") and by ${TaskClass.name} (module "${moduleId}"). A task has one clock, so exactly one class can run on it.`,
        token.id,
      );
    }

    this.registrations.set(token.id, {
      moduleId,
      TaskClass,
      expression,
      options,
      autostart,
      scheduledOn: false,
      executing: false,
      skipped: 0,
    });
  }

  /**
   * The instance a task is running on, once it has started.
   *
   * For a test that needs to look at what the task holds. `undefined` before
   * the first start, because that is when it gets built.
   */
  public instanceOf(target: TaskToken | string): Routine | undefined {
    const id = typeof target === 'string' ? target : target.id;
    return this.registrationOf(id).instance;
  }

  /** Ids of every registered task, in registration order. */
  public ids(): string[] {
    return [...this.registrations.keys()];
  }

  /** How many clocks are ticking right now. */
  public scheduledCount(): number {
    return [...this.registrations.values()].filter((one) => one.scheduledOn)
      .length;
  }

  /** Ticks this task has dropped for overlapping with itself. */
  public skippedCount(target: TaskToken | string): number {
    const id = typeof target === 'string' ? target : target.id;
    return this.registrationOf(id).skipped;
  }

  /**
   * Starts every task that did not ask to stay stopped.
   *
   * Called after the HTTP server is listening, so a boot that fails on the way
   * there never leaves a clock ticking against a half-built application.
   */
  public startAll(): void {
    for (const [id, registration] of this.registrations) {
      if (registration.autostart) this.start(id);
    }
  }

  /** Stops everything, for an ordered shutdown. */
  public stopAll(): void {
    for (const id of this.registrations.keys()) this.stop(id);
  }

  /** The handle for one task, by token or by id. */
  public handle(target: TaskToken | string): TaskHandle {
    const id = typeof target === 'string' ? target : target.id;
    this.registrationOf(id);
    return {
      start: () => this.start(id),
      stop: () => this.stop(id),
      isScheduled: () => this.registrationOf(id).scheduledOn,
      isExecuting: () => this.registrationOf(id).executing,
      runNow: () => this.run(id, 'manual'),
    };
  }

  private registrationOf(id: string): Registration {
    const registration = this.registrations.get(id);
    if (!registration) {
      const known = this.ids();
      throw new TaskError(
        `No task is registered for "${id}". ${
          known.length === 0
            ? 'This application has no tasks: a task is a class with @Cron(token, expression) in a module’s tasks folder.'
            : `Registered: ${known.join(', ')}.`
        }`,
        id,
      );
    }
    return registration;
  }

  private start(id: string): boolean {
    const registration = this.registrationOf(id);
    if (registration.scheduledOn) return false;

    if (!registration.scheduled) {
      // Built here and not at boot, so a task nobody starts costs nothing —
      // the same rule as a contract's implementation.
      registration.instance ??= this.build(registration.TaskClass);
      // `cron.schedule` starts on creation, which is what we want: the first
      // start is also where `runOnInit` belongs, so a task that is not
      // autostarted does not fire its init tick until somebody asks for it.
      registration.scheduled = cron.schedule(
        registration.expression,
        (now) => this.run(id, now),
        registration.options,
      );
    } else {
      registration.scheduled.start();
    }

    registration.scheduledOn = true;
    return true;
  }

  private stop(id: string): boolean {
    const registration = this.registrationOf(id);
    if (!registration.scheduledOn) return false;
    registration.scheduled?.stop();
    registration.scheduledOn = false;
    return true;
  }

  /**
   * One run, and never two at once.
   *
   * node-cron does NOT wait: its scheduler ticks on its own timer and calls the
   * function again whether the previous call finished or not. For a job that
   * generates charges or applies cut-offs, two overlapping runs is the worst
   * kind of bug — it is not a crash, it is duplicated money. So a tick that
   * arrives while a run is in flight is DROPPED, and said out loud.
   *
   * Dropped and not queued on purpose: a queue turns a slow month into a
   * backlog of identical runs, all of them stale by the time they get their
   * turn. The next scheduled tick is the right time to try again.
   *
   * And the failure is logged here, because nothing else logs it: node-cron
   * emits `task-failed` on an inner object nobody subscribes to, so until now a
   * run that threw was completely silent. The schedule survives it — one bad
   * night must not stop a nightly job forever — but somebody has to be able to
   * find out.
   */
  private async run(
    id: string,
    now: Date | 'manual' | 'init',
  ): Promise<boolean> {
    const registration = this.registrationOf(id);

    if (registration.executing) {
      registration.skipped += 1;
      Logger.warn(
        `Task "${id}" (module "${registration.moduleId}") skipped a ${
          now === 'manual' ? 'manual run' : 'tick'
        }: the previous run has not finished. Skipped so far: ${
          registration.skipped
        }.`,
      );
      return false;
    }

    // A manual run on a task that was never started has nothing built yet.
    registration.instance ??= this.build(registration.TaskClass);

    registration.executing = true;
    try {
      await registration.instance.start(now);
    } catch (error) {
      Logger.error(
        `Task "${id}" (module "${registration.moduleId}") failed on a run. The schedule keeps going.`,
        error,
      );
    } finally {
      // In `finally` and not after the await: a run that threw must not leave
      // the task permanently "executing", which would silently stop it forever.
      registration.executing = false;
    }

    return true;
  }

  /** Same injection as a provider, and for the same reason. */
  private build(TaskClass: new () => Routine): Routine {
    const proto = TaskClass.prototype;
    proto.db = this.db;
    proto.container = this.container;
    proto.events = this.events;
    proto.tasks = this;

    const instance = new TaskClass();
    instance.db = this.db;
    instance.container = this.container;
    instance.events = this.events;
    instance.tasks = this;

    return instance;
  }
}
