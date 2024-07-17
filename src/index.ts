import { ConfigService, Liteb } from '../lib';
import enableCors from './config/enable-cors';
import enableSession from './config/enable-session';

const liteb = new Liteb({
  entities: ['./src/modules/**/entities/*.entity.ts'],
  apis: ['./src/modules/**/apis/*.api.ts'],
  db: {
    host: ConfigService.get('DB_HOST'),
    port: +ConfigService.get('DB_PORT'),
    username: ConfigService.get('DB_USERNAME'),
    password: ConfigService.get('DB_PASSWORD'),
    database: ConfigService.get('DB_NAME'),
  },
  server: {
    port: +ConfigService.get('SERVER_PORT'),
  },
});

const server = liteb.server();
enableCors(server);
enableSession(server);

const db = liteb.db();
liteb.start(server, db);
