import * as dotenv from 'dotenv';

dotenv.config();

export type MODE = 'production' | 'development';

/**
 * Servidor de variables de entorno
 */
export class ConfigService {
  static get(name: string): string {
    return process.env[name as string];
  }

  static all(): Record<string, string> {
    return { ...process.env };
  }

  static mode(): MODE {
    return process.env.NODE_ENV as MODE;
  }
}
