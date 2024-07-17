import { InternalError, isManagedError } from '../utilities/errors';
import { Api } from './api';
import { Express, Request, Response } from 'express';
import { getHttp } from '../defines/http.define';
import { DataSource } from 'typeorm';
import { getBody, getParams, getQuery } from '../defines/request.define';
import { getUse } from '../defines/use.define';
import { managerMiddleware } from '../middlewares/manager';
import { paramsExpect, queryExpect, bodyExpect } from '../middlewares/expects';

export abstract class ModuleBase {
  constructor(protected basePath: string) {}
  abstract set(api: new () => Api): void;
  abstract build(app: Express, dbSource: DataSource): void;
  protected getHttpMetadata = (ApiConstructor: new () => Api) => {
    const http = getHttp(ApiConstructor);
    if (http === null) {
      throw new InternalError(
        new Error(
          'Flow no válido, verifique si tiene uno de los decoradores (@Get(), @Post(), @Put(), @Delete(), @Path())',
        ),
      );
    }
    return http;
  };

  protected getHandlers = (ApiConstructor: new () => Api) => {
    type Handler = (req: Request, res: Response, next: () => void) => void;
    const handlers: Handler[] = [];
    const useMtd = getUse(ApiConstructor);
    const paramsMtd = getParams(ApiConstructor);
    const bodyMtd = getBody(ApiConstructor);
    const queryMtd = getQuery(ApiConstructor);

    if (useMtd) {
      handlers.push(managerMiddleware(useMtd.middleware));
    }
    if (paramsMtd) {
      handlers.push(paramsExpect(paramsMtd.Schema));
    }
    if (bodyMtd) {
      handlers.push(bodyExpect(bodyMtd.Schema));
    }
    if (queryMtd) {
      handlers.push(queryExpect(queryMtd.Schema));
    }

    return handlers;
  };

  protected buildApi = (
    ApiConstructor: new () => Api,
    dbSource: DataSource,
  ) => {
    ApiConstructor.prototype.db = dbSource;
    const api = new ApiConstructor();
    return async function (req: Request, res: Response) {
      api.params = req.params;
      api.body = req.body;
      api.query = req.query;
      api.request = req;

      try {
        const result = await api.main();

        res.json(result);
      } catch (error) {
        if (isManagedError(error)) {
          res.status(error.status).json(error);
          return;
        }
        const internetError = new InternalError(error);
        internetError.path = req.originalUrl;
        res.status(internetError.status).json(internetError);
      }
    };
  };
}
