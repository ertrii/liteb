import { Request, Response } from 'express';
import ApiReader from './api-reader';
import schemaValidator from '../services/schema-validator';
import { HttpStatus } from '../interfaces/http-status';
import { ErrorIdentifier } from '../interfaces/type-error';
import { DataSource } from 'typeorm';
import { Logger } from '../utilities/logger';
import { MiddlewareFn } from '../decorators/use.decorator';
import { Middleware } from '../templates/middleware';
import ErrorControl from '../utilities/error-control';

export default class ApiHandler {
  private returnNullIfEmpty = (obj: any) => {
    if (
      obj &&
      typeof obj === 'object' &&
      !Array.isArray(obj) &&
      Object.keys(obj).length === 0
    ) {
      return null;
    }
    return obj ?? null;
  };

  private isMiddlewareFunction = (
    funcOrClass: (new () => Middleware) | MiddlewareFn,
  ): funcOrClass is MiddlewareFn => {
    const propertyNames = Object.getOwnPropertyNames(funcOrClass);
    return (
      !propertyNames.includes('prototype') ||
      propertyNames.includes('arguments')
    );
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
    ApiClass.prototype.db = this.dbSource;
    ApiClass.prototype.params = this.returnNullIfEmpty(req.params);
    ApiClass.prototype.body = this.returnNullIfEmpty(req.body);
    ApiClass.prototype.query = this.returnNullIfEmpty(req.query);
    ApiClass.prototype.files = this.returnNullIfEmpty(req.files);
    ApiClass.prototype.file = this.returnNullIfEmpty(req.file);
    ApiClass.prototype.request = req;

    const apiClass = new ApiClass();
    try {
      await apiClass.previous();
      const dataResponse = await apiClass.main();
      res.status(apiClass.httpStatus).json(dataResponse);
    } catch (error) {
      try {
        const errorResponse = await apiClass.error(error);
        const errResult = new ErrorControl(
          errorResponse ? errorResponse : error,
        );
        res.status(errResult.getStatus()).json(errResult.toJson());
      } catch (error) {
        const errResult = new ErrorControl(error);
        res.status(errResult.getStatus()).json(errResult.toJson());
      }
    } finally {
      await apiClass.final();
    }
  };
}
