import cookieParser from 'cookie-parser';
import express, { Express, Request, Response, Router } from 'express';
import morgan from 'morgan';
import { Logger } from '../services/logger';
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

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());
    this.app.use(morgan('dev'));
  }

  protected router = (basePath: string, options: RouterOption[]) => {
    const router = Router();
    options.forEach((option) => {
      const fullPath = slash(path.join('/', option.path));
      router[option.method](fullPath, ...option.getHandlers());
    });
    this.app.use(slash(path.join('/', basePath)), router);
  };

  protected enpoint = (option: RouterOption) => {
    const fullPath = slash(path.join('/', option.path));
    this.app[option.method](fullPath, ...option.getHandlers());
  };

  protected listen = (port: number) => {
    return new Promise<void>((resolve) => {
      this.app.listen(port, () => {
        Logger.info(`Server running on port ${port}`);
        resolve();
      });
    });
  };

  public getApp = () => this.app;

  public use = (callback: (app: Express) => void) => {
    callback(this.app);
  };
}
