import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorType } from '../interfaces/type-error';
import { Auth } from '../core/auth';
import type { EventBus, EventToken } from '../modules/events';
import type { Container, Contract } from '../modules/container';
import type { Slot } from '../modules/slots';

export type DataJson =
  | Record<string, any>
  | Response<any, Record<string, any>>
  | null;

/**
 * Endpoint parents
 * @template P Params data
 * @template B Body data
 * @template Q Queries data
 */
export abstract class Endpoint<
  P extends Record<string, any> | null = null,
  B extends Record<string, any> | null = null,
  Q extends Record<string, any> | null = null,
> {
  public body: B;
  public params: P;
  public query: Q;
  public file: Express.Multer.File;
  public files:
    | {
        [fieldname: string]: Express.Multer.File[];
      }
    | Express.Multer.File[];
  public request: Request<P, any, B, Q>;
  public response: Response;
  public db: DataSource;
  public httpStatus: HttpStatus = HttpStatus.OK;

  /**
   * Who is making this request, and what they may do.
   *
   * Filled by the application's `auth` resolver, so the endpoint never learns
   * where the identity came from — a cookie session, a bearer token from the
   * mobile app, an API key from a third-party extension all arrive here the
   * same way.
   *
   * GOTCHA: per-request state, assigned AFTER the instance is built. Not
   * readable from the constructor or a field initializer (`db` and `container`
   * are).
   *
   * @example
   * const userId = this.auth.actor.userId;   // 401 if anonymous
   * this.auth.assert('billing.void');        // 403 if not allowed
   * if (this.auth.optional) { ... }          // public endpoint
   */
  public auth: Auth = new Auth();

  /**
   * Container of the application this endpoint belongs to. Injected on the
   * prototype like `db`, so it is available before the instance is built.
   */
  public container?: Container;

  /** Event bus of this application, injected on the prototype like `db`. */
  public events?: EventBus;

  /**
   * Resolves a contract another module provides.
   *
   * The endpoint imports the contract, never the implementation — which is
   * what lets the providing module change, or be swapped, without touching
   * anyone who calls it.
   *
   * @example
   * const billing = this.get(BillingService);
   * await billing.emitirCargo({ ... });
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
   * Runs before {@link main}, inside the instance.
   *
   * Kept while `error()` and `final()` were dropped because it is the only
   * guard that sees validated state: `this.params`, `this.body` and
   * `this.auth` are already there, where a `@Use` middleware only gets the raw
   * request. Throwing from here skips `main()` and maps like any other error.
   */

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

  public previous(): void | Promise<void> {}
  /**
   * Main method of the endpoint.
   * Must implement the business logic and return the response to the client.
   * May return data, error objects, or null depending on the API's logic.
   */
  public abstract main(): DataJson | Promise<DataJson>;
}
