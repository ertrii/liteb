import { Database } from '../modules/database';
import type { Container, Contract } from '../modules/container';
import type { TaskHandle, TaskRunner, TaskToken } from '../modules/tasks';
import type { Slot } from '../modules/slots';

/**
 * Reacts to something another module announced.
 *
 * It is the third kind of unit a module contributes, beside endpoints and
 * tasks, and it gets the same injections. Mark it with `@On(SomeEvent)` and put
 * it where the module's `listeners` glob can find it.
 *
 * @template P What the event carries.
 *
 * @example
 * @On(ChargeCreated)
 * export class NotifyOnCharge extends Listener<ChargeCreated> {
 *   async on(payload: ChargeCreated) {
 *     await this.get(Messaging).send(payload.customerId, 'New charge');
 *   }
 * }
 */
export abstract class Listener<P = unknown> {
  public db: Database;

  /** Container of the application this listener belongs to. */
  public container?: Container;
  /** Task runner of this application, injected like `db`. */
  public tasks?: TaskRunner;

  /** Resolves a contract another module provides. Same rule as an endpoint. */
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
   * Handles the event.
   *
   * Throwing does NOT fail whoever emitted: the failure is logged, naming this
   * class and its module. An event is a notification, not a request.
   */
  public abstract on(payload: P): void | Promise<void>;
}
