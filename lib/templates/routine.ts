import { Database } from '../modules/database';
import type { Container, Contract } from '../modules/container';
import type { Slot } from '../modules/slots';
import type { EventBus, EventToken } from '../modules/events';
import type { TaskHandle, TaskRunner, TaskToken } from '../modules/tasks';

/**
 * Work the application does on its own, on a clock.
 *
 * The third way into an application, next to {@link Endpoint} (answers a
 * request) and {@link Listener} (reacts to an event): nobody calls a routine,
 * the schedule does. It gets `db`, contracts and the event bus injected the
 * same way, so it can do anything an endpoint can — it just has no request and
 * nobody waiting for an answer.
 *
 * The WHEN is the `@Cron` decorator; this class is the WHAT.
 *
 * A routine belongs to its module: it is discovered under that module's
 * `routines/`, scheduled once the HTTP server is listening, and cleared on
 * shutdown. A boot that failed never leaves a clock running.
 *
 * @example
 * \@Cron('0 7 * * *')
 * export default class DailySummary extends Routine {
 *   public async start(): Promise<void> {
 *     const total = await this.get(ProductCatalog).count();
 *     await this.emit(SummaryReady, { total });
 *   }
 * }
 */
export abstract class Routine {
  public db: Database;

  /** Container of the application this routine belongs to, injected like `db`. */
  public container?: Container;

  /** Event bus of this application, injected like `db`. */
  public events?: EventBus;
  /** Task runner of this application, injected like `db`. */
  public tasks?: TaskRunner;

  /**
   * Resolves a contract another module provides. Same rule as an endpoint: the
   * routine knows the contract, never the implementation.
   */
  protected get<T>(token: Contract<T>): T {
    if (!this.container) {
      throw new Error(
        `Cannot resolve the contract "${token.id}": this application has no modules. Start it with Liteb.create({ modules }).`,
      );
    }
    return this.container.get(token);
  }

  /**
   * Everything the installed modules contributed to an extension point.
   *
   * Where {@link get} asks ONE module for a capability, this asks whoever
   * showed up. An empty array is a normal answer: a slot nobody filled is a
   * feature nobody installed.
   *
   * Contributions come from whatever modules are present, so a deployment
   * without that module answers one item short — a payment method, a channel,
   * a report.
   *
   * @example
   * const methods = this.all(PaymentMethods);
   * return methods.map((m) => ({ id: m.id, label: m.label }));
   */
  protected all<T>(target: Slot<T>): T[] {
    if (!this.container) {
      throw new Error(
        `Cannot read the extension point "${target.id}": this application has no modules. Start it with Liteb.create({ modules }).`,
      );
    }
    return this.container.all(target);
  }

  /**
   * Announces that something happened, for whatever modules are listening.
   *
   * It is NOT a call: a listener that fails does not fail this request, and an
   * event nobody listens to is normal. When the outcome matters, use a
   * contract with {@link get} instead.
   *
   * GOTCHA: listeners read on their own connection. Emitting inside
   * `db.transaction()` means they cannot see the uncommitted rows — emit after
   * it commits, or put what they need in the payload.
   *
   * @example
   * await this.emit(ChargeCreated, { chargeId: charge.id, customerId });
   */
  protected async emit<T>(token: EventToken<T>, payload: T): Promise<void> {
    if (!this.events) return;
    await this.events.emit(token, payload);
  }

  /**
   * The handle of a scheduled task: `start()`, `stop()`, `isRunning()`.
   *
   * What it is for is the schedule an operator decides, not the deployment: a
   * sync somebody triggers, a nightly job that gets paused during a migration.
   * `start()` on something already running does nothing and says so, so the
   * same button pressed twice cannot produce two clocks.
   *
   * @example
   * const backup = this.task(NightlyBackup);
   * backup.start();
   * return { running: backup.isRunning() };
   */
  protected task(token: TaskToken): TaskHandle {
    if (!this.tasks) {
      throw new Error(
        `Cannot reach the task "${token.id}": this application has no task runner. Start it with Liteb.create({ modules }).`,
      );
    }
    return this.tasks.handle(token);
  }

  /**
   * What the routine does.
   *
   * `now` is the moment the schedule fired, and the two strings come from
   * node-cron: `'init'` when the routine was declared with
   * `@Cron(expression, { runOnInit: true })` and runs once at startup, and
   * `'manual'` for a tick nothing scheduled. Branch on it when the routine
   * should behave differently the first time — and remember `now` is not
   * always a Date.
   *
   * Throwing here does not stop the schedule: the next tick runs anyway, which
   * is what keeps one bad night from silently disabling a routine forever.
   */
  abstract start(now: Date | 'manual' | 'init'): any;
}
