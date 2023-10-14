import express, { Express, Router } from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import enableCors from './enable-cors';
import filesByPatterns from '../utilities/files-by-patterns';
import { ClassController, PatternsServer } from './types';
import metadata from '../metadata';
import { MethodNames } from './constants';
import middleware from '../middleware';
import handler from './handler';
import fixPath from '../utilities/fix-path';
import logger from '../utilities/logger';
import { ClassSchedule } from '../scheduler/types';
import scheduler from '../scheduler';
import { ConfigService } from '../utilities/config-service';

export default function server(
  port: number,
  patterns: PatternsServer,
  uses: Array<(express: Express) => void>,
) {
  const basePath = ConfigService.get('BASE_PATH') || '/';
  const app: Express = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  enableCors(app);
  uses.forEach((use) => use(app));
  app.use(cookieParser());
  app.use(morgan('dev'));
  // socket(app);
  logger.warn(`Mode: ${app.get('env')}`);

  const controllers = filesByPatterns<ClassController>(patterns.controllers);
  const schedules = filesByPatterns<ClassSchedule>(patterns.schedules);

  schedules.forEach((Schedule) => {
    scheduler(metadata('schedule', Schedule));
  });

  controllers.forEach((Controller) => {
    const metadataController = metadata('controller', Controller);
    const name = metadataController.name;
    const router = Router();
    metadataController.methods.forEach((method) => {
      const methodName = MethodNames[method.metadata.http.method];
      const path = `/${method.metadata.http.path}`;
      router[methodName](
        path,
        ...middleware(metadataController, method.metadata),
        handler(method),
      );
    });
    app.use(fixPath(`${basePath}/${name}`), router);
  });

  app.listen(port, function () {
    logger.info(`Server running on port ${port}`);
  });
}
