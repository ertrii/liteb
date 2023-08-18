import * as dotenv from 'dotenv';

dotenv.config();

interface INV {
  SERVER_PORT: string;
  CORS_ORIGIN: string;
  // SECRET_KEY: string;
  MAIN_HOST: string;
  MAIL_USER: string;
  MAIL_PASSWORD: string;
  NODE_ENV: string;
}

type MODE = 'production' | 'development';

/**
 * Servidor de variables de entorno
 */
export class ConfigService {
  static get(name: keyof INV | string): string {
    return process.env[name as string];
  }

  static all(): Record<string, string> {
    return { ...process.env };
  }

  static mode(): MODE {
    return process.env.NODE_ENV as MODE;
  }
}
