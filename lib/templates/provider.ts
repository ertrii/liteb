import type { Database } from '../modules/database';
import type { Container, Contract } from '../modules/container';
import type { Slot } from '../modules/slots';
import type { EventBus, EventToken } from '../modules/events';
import type { TaskHandle, TaskRunner, TaskToken } from '../modules/tasks';

/**
 * How a module answers a contract, or fills someone else's extension point.
 *
 * It is the implementation that a token deliberately leaves out: the consumer
 * imports the token, never this. Which one it answers is the `@Provides`
 * decorator — the same one whether the token is a contract or an extension
 * point — and the file lives in the module's `providers/` folder, so nothing
 * lists it.
 *
 * A class and not a function on purpose. A decorator cannot be put on an
 * object literal or an arrow function, so the class is what makes the folder
 * work at all — the same reason an endpoint, a routine and a listener are
 * classes. And it is where most of a module's real work ends up living, which
 * is exactly what should not be inside `module.ts`.
 *
 * Built the FIRST time someone asks for it and then reused, so a contract
 * nobody calls costs nothing.
 *
 * @example
 * \@Provides(UserDirectory)
 * export class UserDirectoryProvider
 *   extends Provider
 *   implements UserDirectory
 * {
 *   private readonly users = this.db.getRepository(User);
 *
 *   count() {
 *     return this.users.count();
 *   }
 * }
 */
export abstract class Provider {
  /** The open connection, injected before the instance is built. */
  public db: Database;

  /** Container of the application this provider belongs to. */
  public container?: Container;

  /** Event bus of this application. */
  public events?: EventBus;
  /** Task runner of this application, injected like `db`. */
  public tasks?: TaskRunner;

  /**
   * Resolves another contract. Same rule as everywhere else: this knows the
   * contract, never who implements it.
   *
   * Two implementations asking for each other is caught by name at boot rather
   * than recursing until the stack gives out.
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
   * An empty array is a normal answer: a slot nobody filled is a feature
   * nobody installed.
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
   * Available here because this is where most of a module's work lives, and
   * reaching for a global instead is how a second application in the same
   * process starts seeing the first one's events.
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
}
