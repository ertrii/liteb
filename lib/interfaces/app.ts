/**
 * Opciones principales para iniciar la aplicación.
 */
export interface LitebOptions {
  server: ServerOptions;
  db: DBOptions;
  entities: string[];
  apis: string[];
}

export interface ServerOptions {
  port: number;
}

export interface DBOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}
