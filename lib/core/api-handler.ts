import { Request, Response } from 'express';
import ApiReader from './api-reader';
import schemaValidator from '../services/schema-validator';
import { HttpStatus } from '../interfaces/http-status';
import { TypeError } from '../interfaces/type-error';
import { DataSource } from 'typeorm';
import logger from '../services/logger';
import { MiddlewareFn } from '../decorators/use.decorator';
import { Middleware } from '../templates/middleware';

export default class ApiHandler {
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
        type: TypeError.UNAUTHORIZED,
      });
    }
  };

  public schema = (req: Request, res: Response, next: () => void) => {
    let message = '';
    let errors: Record<string, any> | null = null;

    const schemasClass: Array<[new () => any, any, string]> = [
      [this.apiReader.ParamsSchema, req.params, 'Invalid parameters'],
      [this.apiReader.BodySchema, req.body, 'Invalid body'],
      [this.apiReader.QuerySchema, req.query, 'Invalid query'],
    ];

    for (const [schemaClass, object, msg] of schemasClass) {
      if (!schemaClass) continue;
      const result = schemaValidator(schemaClass, object);
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
      type: TypeError.SCHEMA,
      errors,
    });
  };

  public main = async (req: Request, res: Response) => {
    const ApiClass = this.apiReader.getApiClass();
    ApiClass.prototype.db = this.dbSource;
    ApiClass.prototype.params = req.params;
    ApiClass.prototype.body = req.body;
    ApiClass.prototype.query = req.query;
    ApiClass.prototype.request = req;
    const apiClass = new ApiClass();
    try {
      if (apiClass.load) {
        await apiClass.load();
      }
      const dataResponse = await apiClass.main();
      res.status(apiClass.httpStatus).json(dataResponse);
    } catch (error) {
      logger.error(error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Internal Error',
        type: TypeError.INTERNAL,
        response: null,
      });
    }
  };
}
