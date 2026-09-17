import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorType } from '../interfaces/type-error';
import { ErrorResponse, SessionDataExtends } from '../interfaces/utils';
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

  /**
   * Stores a value in the session.
   * @param key session key
   * @param value
   * @example
   * // Equivalent to
   * this.request.session.key = value
   */
  protected setSession(key: string, value: any) {
    const session = this.request?.session as SessionDataExtends<any>;
    session[key as string] = value;
  }

  /**
   * Returns the session value for a key.
   * @param key session key
   * @example
   * // Equivalent to
   * this.request.session.key
   */
  protected getSession(key: string) {
    return this.request?.session[key];
  }

}
