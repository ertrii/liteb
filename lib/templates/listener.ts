import { DataSource } from 'typeorm';
import type { Container, Contract } from '../modules/container';

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
  public db: DataSource;

  /** Container of the application this listener belongs to. */
  public container?: Container;

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
   * Handles the event.
   *
   * Throwing does NOT fail whoever emitted: the failure is logged, naming this
   * class and its module. An event is a notification, not a request.
   */
  public abstract on(payload: P): void | Promise<void>;
}
