import { Request, Response } from 'express';
import session from 'express-session';
import { Transaction } from '../utilities/transaction';
import { DataSource } from 'typeorm';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorType } from '../interfaces/type-error';

type SessionDataExtends<T> = session.Session & Partial<session.SessionData & T>;
export type DataJson =
  | Record<string, any>
  | Response<any, Record<string, any>>
  | null
  | Promise<Record<string, any> | Response<any, Record<string, any>> | null>;

export type ErrorResponse = void | ErrorType | Promise<void | ErrorType>;

/**
 * Api parents
 * @template P Params data
 * @template B Body data
 * @template Q Queries data
 */
export abstract class Api<
  P extends Record<string, any> | null = null,
  B extends Record<string, any> | null = null,
  Q extends Record<string, any> | null = null,
> {
  public body: B;
  public params: P;
  public query: Q;
  public files:
    | {
        [fieldname: string]: Express.Multer.File[];
      }
    | Express.Multer.File[];
  public file: Express.Multer.File;
  public request: Request<P, any, B, Q>;
  public response: Response;
  public db: DataSource;
  public httpStatus: HttpStatus = HttpStatus.OK;

  /**
   * Se ejecuta antes del método principal (main)
   */
  public previous(): void | Promise<void> {}
  /**
   * Método principal del endpoint.
   * Debe implementar la lógica de negocio y devolver la respuesta al cliente.
   * Puede retornar datos, objetos de error, o null según la lógica de la API.
   */
  public abstract main(): DataJson;
  /**
   * Maneja y procesa los errores generados durante la ejecución del método main.
   * Permite personalizar la respuesta de error que se envía al cliente, según el tipo de error recibido.
   * Puede utilizarse para registrar, transformar o modificar la estructura del error antes de devolverlo.
   * @param error Instancia del error capturado en el método main.
   * @returns Un objeto de error personalizado, nulo o una promesa, según la necesidad de la implementación.
   */
  public error(error: ErrorType): ErrorResponse {}
  /**
   * Se ejecuta después de que el método principal (main) y la gestión de errores hayan finalizado.
   * Útil para realizar tareas de limpieza, registro de logs o cualquier acción final posterior a la respuesta al cliente.
   */
  public final(): void | Promise<void> {}

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
