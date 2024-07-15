import { Request } from 'express';
import session from 'express-session';

type SessionDataExtends<T> = session.Session & Partial<session.SessionData & T>;

/**
 * Flow parents
 * @template P Params data
 * @template B Body data
 * @template Q Queries data
 */
export abstract class Flow<
  P extends Record<string, any> = any,
  B extends Record<string, any> = any,
  Q extends Record<string, any> = any,
> {
  public body: B = null;
  public params: P = null;
  public query: Q = null;
  public request: Request<P, any, B, Q>;

  /**
   * Método inicial que ejecutará el core.
   */
  abstract main(): any;
  /**
   * Registra una sesión.
   * @param key clave registro
   * @param value
   * @example
   * // Equivalente a
   * this.request.session.key = value
   */
  setValueSession(key: string, value: any) {
    const session = this.request.session as SessionDataExtends<any>;
    session[key as string] = value;
  }
  /**
   * Retorna el valor sesión por key
   * @param key clave registro
   * @example
   * // Equivalente a
   * this.request.session.key
   */
  getValueSession(key: string) {
    return this.request.session[key];
  }
}
