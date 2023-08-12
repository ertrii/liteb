import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as dotenv from 'dotenv';

dotenv.config();

export const TYPE: PostgresConnectionOptions['type'] = 'postgres';
export const HOST = process.env.DB_HOST;
export const PORT = +process.env.DB_PORT;
export const USERNAME = process.env.DB_USERNAME;
export const PASSWORD = process.env.DB_PASSWORD;
export const NAME = process.env.DB_NAME;
export const SYNCHRONIZE = true;
