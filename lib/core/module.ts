import { Express, Router } from 'express';
import { Api } from '../templates/api';
import { ModuleBase } from '../templates/module-base';
import slash from 'slash';
import path from 'path';

export class Module extends ModuleBase {
  constructor(basePath: string) {
    super(basePath);
  }

  private apis: Array<new () => Api> = [];

  set(api: new () => Api<any, any, any>): void {
    this.apis.push(api);
  }

  build(app: Express): void {
    const router = Router();
    this.apis.forEach((api) => {
      const http = this.getHttpMetadata(api);
      // creando los ruteos
      router[http.method](
        slash(path.join('/', http.path)),
        this.getHandlers(api),
        this.buildApi(api),
      );
    });
    // agregando a express el ruteo
    app.use(slash(path.join('/', this.basePath)), router);
  }
}
