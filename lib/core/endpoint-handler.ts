import { Request, Response } from 'express';
import EndpointReader from './endpoint-reader';
import schemaValidator from '../services/schema-validator';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorIdentifier } from '../interfaces/type-error';
import { DataSource } from 'typeorm';
import ErrorControl from '../utilities/error-control';

export default class EndpointHandler {
  constructor(
    private endpointReader: EndpointReader,
    private dbSource: DataSource,
  ) {}

  public middleware = (req: Request, res: Response, next: () => void) => {
    this.endpointReader.MiddlewareClass(req, res, next);
  };

  public schema = async (req: Request, res: Response, next: () => void) => {
    let message = '';
    let errors: Record<string, any> | null = null;

    const schemasClass: Array<[new () => any, any, string]> = [
      [this.endpointReader.ParamsSchema, req.params, 'Invalid parameters'],
      [this.endpointReader.BodySchema, req.body, 'Invalid body'],
      [this.endpointReader.QuerySchema, req.query, 'Invalid query'],
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
    const EndpointClass = this.endpointReader.getEndpointClass();
    // `db` is stable across requests, so it lives on the prototype: it is
    // available during field initializers (e.g.
    // `private rep = this.db.getRepository(...)`), which run inside `new`.
    EndpointClass.prototype.db = this.dbSource;

    const requiereRender = this.endpointReader.requiereRender();
    const endpointClass = new EndpointClass();
    // The rest of the state is PER REQUEST and is assigned on the INSTANCE, not
    // the prototype. With the prototype, two concurrent requests to the same
    // endpoint overwrote each other: one `await`ed inside `main()` while the
    // other rewrote `prototype.query/params/body` before the first one read
    // them, so both ended up with the last one's data. Assigning on the
    // instance gives each request its own state. (cast: the instance is typed
    // with the default `null` generics; the real state comes from the DTOs.)
    const state = endpointClass as unknown as Record<string, unknown>;
    state.params = this.endpointReader.ParamsSchema ? req.params : null;
    state.body = this.endpointReader.BodySchema ? req.body : null;
    state.query = this.endpointReader.QuerySchema ? req.query : null;
    state.files = req.files;
    state.file = req.file;
    state.request = req;
    state.response = res;
    try {
      await endpointClass.previous();
      const dataResponse = await endpointClass.main();
      if (requiereRender) {
        res.render(this.endpointReader.getTemplatePath(), dataResponse);
        return;
      }
      // The controller may have written directly to `this.response` (binaries,
      // HTML, streams). If it already ended the response, don't overwrite it.
      if (res.headersSent) return;
      res.status(endpointClass.httpStatus).json(dataResponse);
    } catch (error) {
      try {
        const errorResponse = await endpointClass.error(error);
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
      await endpointClass.final();
    }
  };
}
