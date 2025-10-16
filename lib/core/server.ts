import cookieParser from 'cookie-parser';
import express, { Express, Request, Response, Router } from 'express';
import morgan from 'morgan';
import { Logger } from '../utilities/logger';
import slash from 'slash';
import path from 'path';

export type Handler = (req: Request, res: Response, next: () => void) => void;

export class RouterOption {
  public readonly auth: 'token';
  private cors = {
    origin: ['*'],
    additionalHeaders: ['cache-control', 'x-requested-with'],
  };
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

  getCors = () => {
    return this.cors;
  };
}

export default class Server {
  protected app: Express;

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
   * @param basePath Prefijo base bajo el cual se registrarán las rutas.
   * @param options Arreglo de RouterOption que describe las rutas, métodos y handlers.
   */
  protected router = (basePath: string, options: RouterOption[]) => {
    const router = Router();
    options.forEach((option) => {
      const fullPath = slash(path.join('/', option.path));
      router[option.method](fullPath, ...option.getHandlers());
    });
    this.app.use(slash(path.join('/', basePath)), router);
  };

  /**
   * Registra un endpoint individual en la raíz de la aplicación o bajo la ruta especificada.
   * @param option Objeto RouterOption que describe la ruta, método y handlers a registrar.
   */
  protected enpoint = (option: RouterOption) => {
    const fullPath = slash(path.join('/', option.path));
    this.app[option.method](fullPath, ...option.getHandlers());
  };

  /**
   * Inicia el servidor escuchando en el puerto especificado.
   * @param port Puerto donde se levantará el servidor HTTP.
   * @returns Promesa que se resuelve cuando el servidor ha iniciado exitosamente.
   */
  protected listen = (port: number) => {
    return new Promise<void>((resolve) => {
      this.app.listen(port, () => {
        Logger.info(`Server running on port ${port}`);
        resolve();
      });
    });
  };

  /**
   * Obtiene la instancia interna de la aplicación Express.
   * @returns Instancia de Express.
   */
  public getApp = () => this.app;

  /**
   * Permite agregar middlewares o lógica adicional a la aplicación Express.
   * @param callback Función que recibe la instancia de Express para ser modificada.
   */
  public use = (callback: (app: Express) => void) => {
    callback(this.app);
  };
}
