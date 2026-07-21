import { Request, Response } from 'express';
import { Transaction } from '../utilities/transaction';
import { DataSource } from 'typeorm';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorType } from '../interfaces/type-error';
import { ErrorResponse, SessionDataExtends } from '../interfaces/utils';

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
   * Se ejecuta antes del método principal (main)
   */
  public previous(): void | Promise<void> {}
  /**
   * Método principal del endpoint.
   * Debe implementar la lógica de negocio y devolver la respuesta al cliente.
   * Puede retornar datos, objetos de error, o null según la lógica de la API.
   */
  public abstract main(): DataJson | Promise<DataJson>;
  /**
   * Maneja y procesa los errores generados durante la ejecución del método main.
   * Permite personalizar la respuesta de error que se envía al cliente, según el tipo de error recibido.
   * Puede utilizarse para registrar, transformar o modificar la estructura del error antes de devolverlo.
   * @param error Instancia del error capturado en el método main.
   * @returns Un objeto de error personalizado, nulo o una promesa, según la necesidad de la implementación.
   */
  public error(error: ErrorType): ErrorResponse | Promise<ErrorResponse> {}
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
  protected setSession(key: string, value: any) {
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
  protected getSession(key: string) {
    return this.request?.session[key];
  }

  /**
   * @deprecated Use TypeORM's `this.db.transaction(cb)`. Will be removed in a
   * future major version.
   *
   * @example
   * await this.db.transaction(async (manager) => {
   *   await manager.save(customer);
   * }); // automatic commit / rollback / release
   */
  protected createTransaction = () => {
    return new Transaction(this.db);
  };
}
