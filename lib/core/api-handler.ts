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
    // `db` is stable across requests, so it lives on the prototype: it is
    // available during field initializers (e.g.
    // `private rep = this.db.getRepository(...)`), which run inside `new`.
    ApiClass.prototype.db = this.dbSource;

    const requiereRender = this.apiReader.requiereRender();
    const apiClass = new ApiClass();
    // The rest of the state is PER REQUEST and is assigned on the INSTANCE, not
    // the prototype. With the prototype, two concurrent requests to the same
    // endpoint overwrote each other: one `await`ed inside `main()` while the
    // other rewrote `prototype.query/params/body` before the first one read
    // them, so both ended up with the last one's data. Assigning on the
    // instance gives each request its own state. (cast: the instance is typed
    // with the default `null` generics; the real state comes from the DTOs.)
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
      // The controller may have written directly to `this.response` (binaries,
      // HTML, streams). If it already ended the response, don't overwrite it.
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
