import * as dotenv from 'dotenv';
dotenv.config();

export const VERSION = 0;
export const BASE_PATH = '/';
export const PORT = +process.env.SERVER_PORT;
export const CORS_ORIGIN = process.env.CORS_ORIGIN;
export const SECRET_KEY = process.env.SECRET_KEY;
