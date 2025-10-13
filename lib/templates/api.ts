import { Request, Response } from 'express';
import session from 'express-session';
import { Transaction } from '../utilities/transaction';
import { DataSource } from 'typeorm';
import { HttpStatus } from '../interfaces/http-status';

type SessionDataExtends<T> = session.Session & Partial<session.SessionData & T>;
export type DataJson =
  | Record<string, any>
  | Response<any, Record<string, any>>
  | null;

/**
 * Api parents
 * @template P Params data
 * @template B Body data
 * @template Q Queries data
 */
export abstract class Api<
  P extends Record<string, any> = any,
  B extends Record<string, any> = any,
  Q extends Record<string, any> = any,
> {
  public body: B = null;
  public params: P = null;
  public query: Q = null;
  public request: Request<P, any, B, Q>;
  public response: Response;
  public db: DataSource;
  public httpStatus: HttpStatus = HttpStatus.OK;

  abstract main(): DataJson;

  async load() {
    await Promise.resolve();
  }

  /**
   * Registra una sesión.
   * @param key clave registro
   * @param value
   * @example
   * // Equivalente a
   * this.request.session.key = value
   */
  setSession(key: string, value: any) {
    const session = this.request?.session as SessionDataExtends<any>;
    session[key as string] = value;
  }

  /**
   * Retorna el valor sesión por key
   * @param key clave registro
   * @example
   * // Equivalente a
   * this.request.session.key
   */
  getSession(key: string) {
    return this.request?.session[key];
  }

  /**
   * @deprecated use createQueryRunner or queue
   */
  createTransaction = () => {
    return new Transaction(this.db);
  };
}
