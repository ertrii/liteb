import { DataSource } from 'typeorm';
import type { Container, Contract } from '../modules/container';
import type { EventBus, EventToken } from '../modules/events';

export abstract class Task {
  public db: DataSource;

  /** Container of the application this task belongs to, injected like `db`. */
  public container?: Container;

  /** Event bus of this application, injected like `db`. */
  public events?: EventBus;

  /**
   * Resolves a contract another module provides. Same rule as an endpoint: the
   * task knows the contract, never the implementation.
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

  abstract start(now: Date | 'manual' | 'init'): any;
}
