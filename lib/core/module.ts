import { Express, Router } from 'express';
import { Api } from '../templates/api';
import { ModuleBase } from '../templates/module-base';
import slash from 'slash';
import path from 'path';
import { DataSource } from 'typeorm';

export class Module extends ModuleBase {
  private apis: Array<new () => Api> = [];

  set(api: new () => Api<any, any, any>): void {
    this.apis.push(api);
  }

  build(app: Express, dbSource: DataSource): void {
    const router = Router();
    this.apis.forEach((api) => {
      const http = this.getHttpMetadata(api);
      // creando los ruteos
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
