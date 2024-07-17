import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { LitebOptions } from '../interfaces/app';
import morgan from 'morgan';
import logger from '../utilities/logger';
import { Api } from '../templates/api';
import filesByPatterns from '../utilities/files-by-patterns';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ModuleBase } from './module-base';
import { getModule } from '../defines/module.define';

export class Liteb {
  constructor(private options: LitebOptions) {}
  private buildModules = (app: Express, db: DataSource) => {
    const ApiConstructors = filesByPatterns<new () => Api>(this.options.apis);
    const apiGroups: Record<string, Array<new () => Api>> = {};
    for (const ApiConstructor of ApiConstructors) {
      const basePath = getModule(ApiConstructor).basePath;
      if (apiGroups[basePath]) {
        apiGroups[basePath].push(ApiConstructor);
      } else {
        apiGroups[basePath] = [ApiConstructor];
      }
    }
    for (const [basePath, Apis] of Object.entries(apiGroups)) {
      const mod = new ModuleBase(basePath);
      Apis.forEach((Api) => {
        mod.set(Api);
      });
      mod.build(app, db);
    }
  };

  server() {
    const app: Express = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(morgan('dev'));
    return app;
  }

  db = () => {
    const dbSource = new DataSource({
      type: 'postgres',
      host: this.options.db.host,
      port: this.options.db.port,
      username: this.options.db.username,
      password: this.options.db.password,
      database: this.options.db.database,
      entities: this.options.entities,
      synchronize: true,
    });
    return dbSource;
  };

  start(app: Express, dbSource: DataSource) {
    const options = this.options.server;
    this.buildModules(app, dbSource);
    app.listen(options.port, () => {
      logger.info(`Server running on port ${options.port}`);
    });
    dbSource.initialize().then(() => {
      logger.info('DB Connected');
    });
  }
}
