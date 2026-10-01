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
   * calling it on a task that is already running does nothing and returns
   * `false`, so an endpoint can be called twice without a second clock
   * appearing.
   */
  start(): boolean;
  /** Stops the schedule. `false` if it was not running. */
  stop(): boolean;
  /** Whether the clock is ticking right now. */
  isRunning(): boolean;
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
  running: boolean;
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
      running: false,
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

  /** How many are ticking right now. */
  public runningCount(): number {
    return [...this.registrations.values()].filter((one) => one.running).length;
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
      isRunning: () => this.registrationOf(id).running,
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
    if (registration.running) return false;

    if (!registration.scheduled) {
      // Built here and not at boot, so a task nobody starts costs nothing —
      // the same rule as a contract's implementation.
      registration.instance ??= this.build(registration.TaskClass);
      const instance = registration.instance;
      // `cron.schedule` starts on creation, which is what we want: the first
      // start is also where `runOnInit` belongs, so a task that is not
      // autostarted does not fire its init tick until somebody asks for it.
      registration.scheduled = cron.schedule(
        registration.expression,
        (now) => instance.start(now),
        registration.options,
      );
    } else {
      registration.scheduled.start();
    }

    registration.running = true;
    return true;
  }

  private stop(id: string): boolean {
    const registration = this.registrationOf(id);
    if (!registration.running) return false;
    registration.scheduled?.stop();
    registration.running = false;
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
