import express, { Express, Router } from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { BASE_PATH } from '../../config/server';
import enableCors from './enable-cors';
import filesByPatterns from '../utilities/files-by-patterns';
import { ClassController } from './types';
import metadata from '../metadata';
import enableSession from './enable-session';
import { MethodNames } from './constants';
import middleware from '../middleware';
import handler from './handler';
import fixPath from '../utilities/fix-path';
import logger from '../utilities/logger';
import { ClassSchedule } from '../scheduler/types';
import scheduler from '../scheduler';

export default function server(
  patternController: string[],
  patternSchedule: string[],
  port: number,
) {
  const app: Express = express();

  app.use(express.json());
  enableCors(app);
  enableSession(app);
  app.use(cookieParser());
  app.use(morgan('dev'));
  // socket(app);
  logger.warn(`Mode: ${app.get('env')}`);

  const controllers = filesByPatterns<ClassController>(patternController);
  const schedules = filesByPatterns<ClassSchedule>(patternSchedule);

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
        middleware(metadataController, method.metadata),
        handler(method),
      );
    });
    app.use(fixPath(`${BASE_PATH}/${name}`), router);
  });

  app.listen(port, function () {
    logger.info(`Server running on port ${port}`);
  });
}
