import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { DBOptions, LitebOptions } from '../interfaces/app';
import morgan from 'morgan';
import logger from '../utilities/logger';
import { Api } from '../templates/api';
import filesByPatterns from '../utilities/files-by-patterns';
import { Module } from './module';
import { DataSource, DataSourceOptions } from 'typeorm';

export class Liteb {
  constructor(private options: LitebOptions) {}
  private buildModules = (app: Express, db: DataSource) => {
    const mods = filesByPatterns<Module>(this.options.modules);
    for (const mod of mods) {
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
