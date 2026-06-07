import { Request, Response } from 'express';
import ApiReader from './api-reader';
import schemaValidator from '../services/schema-validator';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorIdentifier } from '../interfaces/type-error';
import { DataSource } from 'typeorm';
import { MiddlewareFn } from '../decorators/use.decorator';
import { Middleware } from '../templates/middleware';
import ErrorControl from '../utilities/error-control';

export default class ApiHandler {
  private isMiddlewareFunction = (
    funcOrClass: (new () => Middleware) | MiddlewareFn,
  ): funcOrClass is MiddlewareFn => {
    return !/^\s*class\s/.test(Function.prototype.toString.call(funcOrClass));
  };

  constructor(
    private apiReader: ApiReader,
    private dbSource: DataSource,
  ) {}

  public middleware = async (req: Request, res: Response, next: () => void) => {
    if (this.isMiddlewareFunction(this.apiReader.MiddlewareClass)) {
      this.apiReader.MiddlewareClass(req, res, next);
      return;
    }
    const middleware = new this.apiReader.MiddlewareClass();
    middleware.request = req;
    try {
      await middleware.canContinue();
      next();
    } catch (error) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        message: error.message,
        type: ErrorIdentifier.UNAUTHORIZED,
      });
    }
  };

  public schema = async (req: Request, res: Response, next: () => void) => {
    let message = '';
    let errors: Record<string, any> | null = null;

    const schemasClass: Array<[new () => any, any, string]> = [
      [this.apiReader.ParamsSchema, req.params, 'Invalid parameters'],
      [this.apiReader.BodySchema, req.body, 'Invalid body'],
      [this.apiReader.QuerySchema, req.query, 'Invalid query'],
    ];

    for (const [schemaClass, object, msg] of schemasClass) {
      if (!schemaClass) continue;
      const result = await schemaValidator(schemaClass, object);
      if (result) {
        message = msg;
        errors = result;
        break;
      }
    }

    if (!errors) {
      next();
      return;
    }

    res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      message,
      type: ErrorIdentifier.SCHEMA,
      errors,
    });
  };

  public main = async (req: Request, res: Response) => {
    const ApiClass = this.apiReader.getApiClass();
    // `db` es estable entre requests, así que va en el prototype: queda
    // disponible durante los field initializers (p. ej.
    // `private rep = this.db.getRepository(...)`), que corren dentro de `new`.
    ApiClass.prototype.db = this.dbSource;

    const requiereRender = this.apiReader.requiereRender();
    const apiClass = new ApiClass();
    // El resto del estado es POR REQUEST y se asigna en la INSTANCIA, no en el
    // prototype. Con prototype, dos requests concurrentes al mismo endpoint se
    // pisaban: una hacía `await` en `main()` y la otra reescribía
    // `prototype.query/params/body` antes de que la primera los leyera, así que
    // ambas terminaban con los datos de la última. Asignar en la instancia da a
    // cada request su propio estado. (cast: la instancia está tipada con los
    // genéricos por defecto `null`; el estado real lo aportan los DTOs.)
    const state = apiClass as unknown as Record<string, unknown>;
    state.params = this.apiReader.ParamsSchema ? req.params : null;
    state.body = this.apiReader.BodySchema ? req.body : null;
    state.query = this.apiReader.QuerySchema ? req.query : null;
    state.files = req.files;
    state.file = req.file;
    state.request = req;
    state.response = res;
    try {
      await apiClass.previous();
      const dataResponse = await apiClass.main();
      if (requiereRender) {
        res.render(this.apiReader.getTemplatePath(), dataResponse);
        return;
      }
      // El controller pudo escribir directo en `this.response` (binarios,
      // HTML, streams). Si ya cerró la respuesta, no la pisamos.
      if (res.headersSent) return;
      res.status(apiClass.httpStatus).json(dataResponse);
    } catch (error) {
      try {
        const errorResponse = await apiClass.error(error);
        const errResult = new ErrorControl(
          errorResponse ? errorResponse : error,
        );
        if (requiereRender) {
          res.send(
            `<html><body>${JSON.stringify(errResult.toJson())}</body></html>`,
          );
          return;
        }
        if (res.headersSent) return;
        res.status(errResult.getStatus()).json(errResult.toJson());
      } catch (error) {
        const errResult = new ErrorControl(error);
        if (requiereRender) {
          res.send(
            `<html><body>${JSON.stringify(errResult.toJson())}</body></html>`,
          );
          return;
        }
        if (res.headersSent) return;
        res.status(errResult.getStatus()).json(errResult.toJson());
      }
    } finally {
      await apiClass.final();
    }
  };
}
