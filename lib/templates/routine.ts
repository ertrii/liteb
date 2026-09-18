import { DataSource } from 'typeorm';
import type { Container, Contract } from '../modules/container';
import type { Slot } from '../modules/slots';
import type { EventBus, EventToken } from '../modules/events';

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
 * A routine belongs to its module: it runs only while that module is ENABLED,
 * so turning a module off stops its clock without touching any data.
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
  public db: DataSource;

  /** Container of the application this routine belongs to, injected like `db`. */
  public container?: Container;

  /** Event bus of this application, injected like `db`. */
  public events?: EventBus;

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
   * Contributions come only from ENABLED modules, so turning an extension off
   * removes what it added — a payment method, a channel, a report.
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
