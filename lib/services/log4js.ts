import * as log4js from 'log4js';
import * as fs from 'fs';
import * as path from 'path';

export interface LoggerOptions {
  /**
   * Directorio donde escribir los archivos de log. Omitido o `null` = SÓLO
   * consola (por defecto): el framework no toca el disco. Puede venir también
   * de la variable de entorno `LITEB_LOG_DIR`.
   */
  dir?: string | null;
  /**
   * Nivel mínimo: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'off'.
   * Por defecto 'trace'. También se puede fijar con `LITEB_LOG_LEVEL`.
   */
  level?: string;
}

/** 10MB */
const MAX_LOG_SIZE = 10485760;

const CONSOLE_APPENDER = {
  type: 'console',
  layout: {
    type: 'pattern',
    pattern: '%[%d{dd-MM-yy hh:mm:ss}%] %[%5p%] %m',
  },
};

const fileAppender = (dir: string, name: string, label: string) => ({
  type: 'file',
  filename: path.join(dir, `${name}.log`),
  maxLogSize: MAX_LOG_SIZE,
  backups: 3,
  compress: true,
  layout: {
    type: 'pattern',
    pattern: `[%d{dd/MM/yyyy hh:mm:ss}] [${label}] %m`,
  },
});

let currentDir: string | null = null;

/** Directorio de logs en uso, o `null` si sólo se escribe a consola. */
export const getLogDir = () => currentDir;

/**
 * (Re)configura el logger. Sin `dir` escribe únicamente a consola, que es el
 * comportamiento por defecto: así liteb arranca en contenedores y sistemas de
 * archivos de sólo lectura sin tocar el disco.
 *
 * Si el directorio pedido no se puede crear (permisos, FS de sólo lectura),
 * degrada a consola en lugar de hacer fallar el arranque.
 */
export function configureLogger(options: LoggerOptions = {}) {
  const level = options.level ?? process.env.LITEB_LOG_LEVEL ?? 'trace';
  let dir = options.dir ?? process.env.LITEB_LOG_DIR ?? null;

  if (dir) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Sin permiso de escritura: seguimos sólo con consola.
      dir = null;
    }
  }
  currentDir = dir;

  const appenders: Record<string, unknown> = { console: CONSOLE_APPENDER };

  const withFile = (name: string, label: string) => {
    if (!dir) return ['console'];
    appenders[name] = fileAppender(dir, name, label);
    return [name, 'console'];
  };

  const info = withFile('info', 'INFO');
  const warn = withFile('warn', 'WARN');
  const error = withFile('error', 'ERROR');
  // El listado de rutas va al archivo cuando hay uno; si no, a consola (de lo
  // contrario se perdería en silencio).
  const router = dir ? ['router'] : ['console'];
  if (dir) appenders.router = fileAppender(dir, 'router', 'ROUTER');

  return log4js.configure({
    appenders,
    categories: {
      default: { appenders: ['console'], level },
      info: { appenders: info, level },
      warn: { appenders: warn, level },
      error: { appenders: error, level },
      router: { appenders: router, level },
    },
  } as log4js.Configuration);
}

export default configureLogger();
