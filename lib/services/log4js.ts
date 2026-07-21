import * as log4js from 'log4js';
import * as fs from 'fs';
import * as path from 'path';

export interface LoggerOptions {
  /**
   * Directory to write log files to. Omitted or `null` = console ONLY (the
   * default): the framework does not touch the disk. Can also come from the
   * `LITEB_LOG_DIR` environment variable.
   */
  dir?: string | null;
  /**
   * Minimum level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'off'.
   * Defaults to 'trace'. Can also be set with `LITEB_LOG_LEVEL`.
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

/** Log directory in use, or `null` if writing to the console only. */
export const getLogDir = () => currentDir;

/**
 * (Re)configures the logger. Without `dir` it writes to the console only, which
 * is the default behavior: this way liteb starts in containers and read-only
 * file systems without touching the disk.
 *
 * If the requested directory cannot be created (permissions, read-only FS), it
 * degrades to console logging instead of failing to start.
 */
export function configureLogger(options: LoggerOptions = {}) {
  const level = options.level ?? process.env.LITEB_LOG_LEVEL ?? 'trace';
  let dir = options.dir ?? process.env.LITEB_LOG_DIR ?? null;

  if (dir) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {
      // No write permission: fall back to console only.
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
  // The route listing goes to the file when there is one; otherwise to the
  // console (else it would be silently lost).
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
