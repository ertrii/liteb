import cookieParser from 'cookie-parser';
import express, {
  Express,
  NextFunction,
  Request,
  Response,
  Router,
} from 'express';
import morgan from 'morgan';
import http from 'http';
import { Logger } from '../utilities/logger';
import slash from 'slash';
import path from 'path';

export type Handler = (req: Request, res: Response, next: () => void) => void;

export class RouterOption {
  private handlers: Handler[] = [];

  constructor(
    public path: string,
    public method: string,
  ) {}

  public setHandler = (handler: Handler) => {
    this.handlers.push(handler);
  };

  getHandlers = () => {
    return this.handlers;
  };
}

export default class Server {
  protected app: Express;
  protected server?: http.Server;

  /**
   * Inicializa la aplicación Express y configura middlewares básicos como body parser,
   * cookie parser y morgan para logging de peticiones.
   */
  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());
    this.app.use(morgan('dev'));
  }

  /**
   * Registra múltiples rutas bajo un prefijo determinado en la aplicación.
   * @param moduleName Grupo base bajo el cual se registrarán las rutas.
   * @param options Arreglo de RouterOption que describe las rutas, métodos y handlers.
   */
  protected router = (moduleName: string, options: RouterOption[]) => {
    const router = Router();
    options.forEach((option) => {
      const fullPath = slash(path.join('/', option.path));
      const register = router[option.method];
      // Un verbo puede no existir en el runtime (p. ej. QUERY en un Node cuyo
      // parser HTTP todavía no lo reconoce): omitimos la ruta con un error
      // claro en vez de tumbar el arranque con "is not a function".
      if (typeof register !== 'function') {
        Logger.error(
          `HTTP method "${option.method.toUpperCase()}" is not supported by this Node/Express version; skipping route ${fullPath}`,
        );
        return;
      }
      register.call(router, fullPath, ...option.getHandlers());
    });
    this.app.use(slash(path.join('/', moduleName)), router);
  };

  /**
   * Inicia el servidor escuchando en el puerto especificado.
   * @param port Puerto donde se levantará el servidor HTTP.
   * @returns Promesa que se resuelve cuando el servidor ha iniciado exitosamente.
   */
  protected listen = (port: number) => {
    return new Promise<void>((resolve) => {
      this.server = this.app.listen(port, () => {
        Logger.info(`Server running on port ${port}`);
        resolve();
      });
    });
  };

  /**
   * Cierra el servidor HTTP: deja de aceptar conexiones nuevas y espera a que
   * terminen las peticiones en vuelo. Resuelve de inmediato si no hay servidor.
   */
  protected closeServer = () => {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  };

  /**
   * Obtiene la instancia interna de la aplicación Express.
   * @returns Instancia de Express.
   */
  public getApp = () => {
    return this.app;
  };

  /**
   * Permite agregar middlewares o lógica adicional a la aplicación Express.
   * @param callback Función que recibe la instancia de Express para ser modificada.
   */
  public use = (
    callback: (req: Request, res: Response, next: NextFunction) => any,
  ) => {
    this.app.use.bind(this.app);
    this.app.use(callback);
  };

  /**
   * Registra un directorio de archivos estáticos en la aplicación Express bajo la ruta especificada.
   * Los archivos ubicados en el directorio raíz proporcionado serán servidos directamente si son solicitados a través del pathname.
   *
   * @param pathname Ruta base en la que los archivos estáticos estarán disponibles (por ejemplo, '/public').
   * @param root Ruta absoluta o relativa al directorio desde donde se servirán los archivos estáticos.
   */
  public static = (pathname: string, root: string) => {
    this.app.use(pathname, express.static(root));
  };
}
