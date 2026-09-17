import { Request, Response } from 'express';
import EndpointReader from './endpoint-reader';
import schemaValidator from '../services/schema-validator';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorIdentifier } from '../interfaces/type-error';
import { DataSource } from 'typeorm';
import ErrorControl from '../utilities/error-control';
import type { Container, Contract } from '../modules/container';
import { Auth, AuthContext, AuthResolver } from './auth';

export default class EndpointHandler {
  constructor(
    private endpointReader: EndpointReader,
    private dbSource: DataSource,
    private container?: Container,
    private authResolver?: AuthResolver,
  ) {}

  /**
   * Built once and reused: the DataSource and the container are stable for the
   * whole life of this handler, only the request changes.
   */
  private context: AuthContext | null = null;

  private authContext = (): AuthContext => {
    if (!this.context) {
      this.context = {
        db: this.dbSource,
        get: <T>(token: Contract<T>): T => {
          if (!this.container) {
            throw new Error(
              `Cannot resolve the contract "${token.id}": this application has no modules. Start it with Liteb.create({ modules }).`,
            );
          }
          return this.container.get(token);
        },
      };
    }
    return this.context;
  };

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
    // Like `db`: on the prototype, so it is there before the instance exists
    // and a field initializer can already reach it.
    EndpointClass.prototype.container = this.container;

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
    // Anonymous until the resolver says otherwise, so `error()` and `final()`
    // still find an `auth` if resolution itself blows up.
    state.auth = new Auth(null, this.authResolver !== undefined);
    try {
      // Inside the try on purpose: a resolver that throws on a malformed token
      // should become a 401 through the usual mapping, not an unhandled
      // rejection that leaves the request hanging.
      if (this.authResolver) {
        state.auth = new Auth(
          (await this.authResolver(req, this.authContext())) ?? null,
          true,
        );
      }
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
      // One layer of catching is enough now that no endpoint hook runs in here:
      // the nested catch only existed because `error()` could itself throw.
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
  };
}
