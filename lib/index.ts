import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import morgan from 'morgan';

export default function liteb() {
  function server() {
    const app: Express = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(morgan('dev'));
    return app;
  }

  function start(app: Express) {
    return app;
  }

  return {
    server,
    start,
  };
}
