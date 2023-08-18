import { ConfigService } from 'liteb';
import { DataSource } from 'typeorm';

const dbSource = new DataSource({
  type: 'postgres',
  host: ConfigService.get('DB_HOST'),
  port: +ConfigService.get('DB_PORT'),
  username: ConfigService.get('DB_USERNAME'),
  password: ConfigService.get('DB_PASSWORD'),
  database: ConfigService.get('DB_NAME'),
  entities: ['./**/entities/*.entity.ts'],
  synchronize: true,
});

export default dbSource;
