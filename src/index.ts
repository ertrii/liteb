import { DataSource } from 'typeorm';
import { ConfigService, Liteb } from '../lib';
import enableCors from './config/enable-cors';
import enableSession from './config/enable-session';

const dbSource = new DataSource({
  type: 'postgres',
  host: ConfigService.get('DB_HOST'),
  port: +ConfigService.get('DB_PORT'),
  username: ConfigService.get('DB_USERNAME'),
  password: ConfigService.get('DB_PASSWORD'),
  database: ConfigService.get('DB_NAME'),
  entities: ['./src/modules/**/entities/*.entity.ts'],
  synchronize: true,
});

const liteb = new Liteb(dbSource);

liteb.use(enableCors());
liteb.use(enableSession(liteb.getApp()));
liteb.setApis('/', ['./src/modules/**/apis/*.api.ts']);
liteb.setTasks(['./src/modules/**/tasks/*.task.ts']);

liteb.start(+ConfigService.get('SERVER_PORT'));
