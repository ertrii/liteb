import DBSource from './orm/db-source';
import server from './server';
import { ModuleMetadata } from './server/types';

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
export * from './orm/transaction';
export * from './metadata/interfaces/guard-arguments';
export * from './metadata/decorators/schedule';
export * from './scheduler/get-schedule';
export * from './orm/repository';

export default class App {
  constructor(private metadata: ModuleMetadata) {}

  /**
   * Conecta la base de datos e inicia el servidor
   */
  async run(port: number) {
    const dbSource = new DBSource(this.metadata.entities);
    await dbSource.run();
    server(this.metadata.controllers, this.metadata.schedules, port);
  }
}
