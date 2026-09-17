import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorType } from '../interfaces/type-error';
import { ErrorResponse } from '../interfaces/utils';
import { Auth } from '../core/auth';
import type { Container, Contract } from '../modules/container';

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
   * Runs before the main method (main).
   */
  public previous(): void | Promise<void> {}
  /**
   * Main method of the endpoint.
   * Must implement the business logic and return the response to the client.
   * May return data, error objects, or null depending on the API's logic.
   */
  public abstract main(): DataJson | Promise<DataJson>;
  /**
   * Handles and processes the errors raised while running the main method.
   * Lets you customize the error response sent to the client based on the type
   * of error received. Can be used to log, transform or reshape the error
   * before returning it.
   * @param error The error instance caught in the main method.
   * @returns A custom error object, null, or a promise, as the implementation needs.
   */
  public error(error: ErrorType): ErrorResponse | Promise<ErrorResponse> {}
  /**
   * Runs after the main method (main) and error handling have finished.
   * Useful for cleanup, logging, or any final action after the client response.
   */
  public final(): void | Promise<void> {}
}
