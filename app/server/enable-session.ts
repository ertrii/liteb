import { SECRET_KEY } from '../../config/server';
import connectPgSimple from 'connect-pg-simple';
import { Express } from 'express';
import session from 'express-session';
import { Pool } from 'pg';

export default function enableSession(app: Express) {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const PgSession = connectPgSimple(session);

  const store = new PgSession({
    tableName: 'session',
    pool: pool,
    createTableIfMissing: true,
  });

  const isProd = app.get('env') === 'production';
  app.set('trust proxy', 1);
  app.use(
    session({
      store,
      secret: SECRET_KEY,
      resave: false,
      saveUninitialized: true,
      cookie: {
        maxAge: 1000 * 60 * 60 * 1,
        secure: isProd,
        httpOnly: false,
        sameSite: isProd ? 'none' : false,
      },
    }),
  );
}
