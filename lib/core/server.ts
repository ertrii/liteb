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
   * Initializes the Express application and sets up basic middleware such as
   * the body parser, cookie parser and morgan for request logging.
   */
  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());
    this.app.use(morgan('dev'));
  }

  /**
   * Registers multiple routes under a given prefix in the application.
   * @param moduleName Base group under which the routes are registered.
   * @param options Array of RouterOption describing the routes, methods and handlers.
   */
  protected router = (moduleName: string, options: RouterOption[]) => {
    const router = Router();
    options.forEach((option) => {
      const fullPath = slash(path.join('/', option.path));
      const register = router[option.method];
      // A verb may not exist in the runtime (e.g. QUERY on a Node whose HTTP
      // parser does not recognize it yet): skip the route with a clear error
      // instead of crashing startup with "is not a function".
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
   * Starts the server listening on the given port.
   * @param port Port the HTTP server will listen on.
   * @returns Promise that resolves once the server has started successfully.
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
   * Closes the HTTP server: stops accepting new connections and waits for
   * in-flight requests to finish. Resolves immediately if there is no server.
   */
  protected closeServer = () => {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  };

  /**
   * Returns the internal Express application instance.
   * @returns The Express instance.
   */
  public getApp = () => {
    return this.app;
  };

  /**
   * Lets you add middleware or extra logic to the Express application.
   * @param callback Function that receives the Express instance to modify it.
   */
  public use = (
    callback: (req: Request, res: Response, next: NextFunction) => any,
  ) => {
    this.app.use.bind(this.app);
    this.app.use(callback);
  };

  /**
   * Registers a directory of static files in the Express application under the
   * given path. Files in the provided root directory are served directly when
   * requested through the pathname.
   *
   * @param pathname Base path where the static files are available (e.g. '/public').
   * @param root Absolute or relative path to the directory the files are served from.
   */
  public static = (pathname: string, root: string) => {
    this.app.use(pathname, express.static(root));
  };
}
