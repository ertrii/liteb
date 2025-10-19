import { Request } from 'express';
import { DataSource } from 'typeorm';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorResponse, SessionDataExtends } from '../interfaces/utils';
import { ErrorType } from '../interfaces/type-error';

/**
 * View parents
 * @template P Params data
 * @template B Body data
 * @template Q Queries data
 */
export default abstract class View<
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
   * Método principal que ejecuta la lógica de renderizado del template engine (por ejemplo, EJS).
   * Debe ser implementado en la vista concreta para generar la salida HTML a partir de los datos proporcionados.
   * Este método es el encargado de preparar y retornar los datos que serán usados para renderizar la vista.
   * Puede retornar un objeto con variables para el motor de templates o directamente el resultado procesado.
   * Puede ser síncrono o retornar una promesa si requiere operaciones asíncronas.
   */
  public abstract render(): Record<string, any> | Promise<Record<string, any>>;
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
}
