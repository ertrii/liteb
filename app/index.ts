import { Express } from 'express';
import server from './server';
import { ModuleMetadata } from './server/types';
import logger from './utilities/logger';

export * from './utilities/exceptions';
export * from './seeder/templates';
export * from './enums/http-status';
export * from './metadata/decorators/http';
export * from './server/types';
export * from './utilities/mailer';
export * from './metadata/decorators/controller';
export * from './metadata/decorators/body';
export * from './metadata/decorators/query';
export * from './metadata/decorators/param';
export * from './metadata/decorators/header';
export * from './metadata/decorators/req';
export * from './metadata/decorators/res';
export * from './metadata/decorators/use-guard';
export * from './metadata/interfaces/guard-arguments';
export * from './metadata/decorators/schedule';
export * from './scheduler/get-schedule';
export * from './utilities/config-service';
export { logger };

export default function liteb(metadata: ModuleMetadata) {
  const uses: Array<(app: Express) => void> = [];

  function use(func: (app: Express) => void) {
    uses.push(func);
  }

  /**
   * Conecta la base de datos e inicia el servidor
   */
  function run(port: number) {
    const controllers = metadata.controllers;
    const schedules = metadata.schedules;

    server(
      port,
      {
        controllers,
        schedules,
      },
      uses,
    );
  }

  return {
    use,
    run,
  };
}
