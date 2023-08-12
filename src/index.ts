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
// eslint-disable-next-line prettier/prettier
export * from './metadata/interfaces/guard-arguments';
export * from './metadata/decorators/schedule';
export * from './scheduler/get-schedule';

export default class App {
  constructor(private metadata: ModuleMetadata) {}

  /**
   * Conecta la base de datos e inicia el servidor
   */
  async run(port: number) {
    await this.metadata.datasource.initialize();
    logger.info('DB Connected');
    server(this.metadata.controllers, this.metadata.schedules, port);
  }
}
