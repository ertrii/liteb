import { InternalError, isManagedError } from '../utilities/errors';
import { Api } from '../templates/api';
import { Express, Request, Response, Router } from 'express';
import { getHttp } from '../defines/http.define';
import { DataSource } from 'typeorm';
import { getBody, getParams, getQuery } from '../defines/request.define';
import { getUse } from '../defines/use.define';
import { managerMiddleware } from '../middlewares/manager';
import { paramsExpect, queryExpect, bodyExpect } from '../middlewares/expects';
import slash from 'slash';
import path from 'path';
import { getOrder } from '../defines/utils';

export class ModuleBase {
  constructor(private basePath: string) {}
  private apis: Array<new () => Api> = [];

  set(api: new () => Api<any, any, any>): void {
    this.apis.push(api);
  }

  private getHttpMetadata = (ApiConstructor: new () => Api) => {
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

  private getHandlers = (ApiConstructor: new () => Api) => {
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

  private buildApi = (ApiConstructor: new () => Api, dbSource: DataSource) => {
    ApiConstructor.prototype.db = dbSource;
    return async function (req: Request, res: Response) {
      const api = new ApiConstructor();
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

  build(app: Express, dbSource: DataSource): void {
    const router = Router();
    const apisOrdered = this.apis.sort((apiA, apiB) => {
      const a = getOrder(apiA)?.number || 0;
      const b = getOrder(apiB)?.number || 0;
      if (a > b) return -1;
      if (a < b) return 1;
      return 0;
    });
    apisOrdered.forEach((api) => {
      const http = this.getHttpMetadata(api);
      // creando los ruteos
      // router.patch
      router[http.method](
        slash(path.join('/', http.path)),
        this.getHandlers(api),
        this.buildApi(api, dbSource),
      );
    });
    // agregando a express el ruteo
    app.use(slash(path.join('/', this.basePath)), router);
  }
}
