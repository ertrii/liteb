import { DataSource } from 'typeorm';
import * as DBConfig from '@config/db';
import logger from 'app/utilities/logger';

export default class DBSource {
  static DataSource: DataSource;
  constructor(entityPatterns: string[]) {
    DBSource.DataSource = new DataSource({
      type: DBConfig.TYPE,
      host: DBConfig.HOST,
      port: DBConfig.PORT,
      username: DBConfig.USERNAME,
      password: DBConfig.PASSWORD,
      database: DBConfig.NAME,
      entities: entityPatterns,
      synchronize: DBConfig.SYNCHRONIZE,
    });
  }

  async run() {
    await DBSource.DataSource.initialize();
    logger.info('DB Connected');
  }
}
