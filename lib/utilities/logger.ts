import * as fs from 'fs';
import * as path from 'path';
import ApiReader from '../core/api-reader';
import slash from 'slash';
import log4js, {
  configureLogger,
  getLogDir,
  LoggerOptions,
} from '../services/log4js';

export class Logger {
  /**
   * Configures the log destination. By default liteb writes to the console
   * ONLY; passing `dir` also enables rotating files.
   *
   * Call before `start()` so startup is logged.
   *
   * @example
   * Logger.configure({ dir: './logs' });   // enables files
   * Logger.configure({ level: 'off' });    // silence everything (tests)
   */
  static configure(options: LoggerOptions = {}) {
    return configureLogger(options);
  }

  /**
   * Logs a message at the 'info' level to the file and console.
   * @param message Main message to log.
   * @param args Extra arguments for the logger.
   * @returns Result of the log4js info call.
   */
  static info(message: any, ...args: any[]) {
    return log4js.getLogger('info').info(message, ...args);
  }

  /**
   * Logs a message at the 'warn' level to the file and console.
   * @param message Main message to log.
   * @param args Extra arguments for the logger.
   * @returns Result of the log4js warn call.
   */
  static warn(message: any, ...args: any[]) {
    return log4js.getLogger('warn').warn(message, ...args);
  }

  /**
   * Logs a message at the 'error' level to the file and console.
   * @param message Main message to log.
   * @param args Extra arguments for the logger.
   * @returns Result of the log4js error call.
   */
  static error(message: any, ...args: any[]) {
    return log4js.getLogger('error').error(message, ...args);
  }

  /**
   * Logs a message to the route log ('router') and console.
   * @param message Message to log; can be a string or an ApiReader instance.
   * @param args Extra arguments for the logger.
   * @returns Result of the log4js router trace call.
   */
  static router(message: string | ApiReader, ...args: any[]) {
    const logRouter = log4js.getLogger('router');
    if (message instanceof ApiReader) {
      const type = 'API';
      const priority = message.priority ?? '-';
      const method = message.method.toUpperCase();
      const moduleName = message.moduleName;
      const pathname = slash(
        path.join('/', moduleName, message.pathname),
      );
      const msg = `[${type}] [${moduleName}] [${priority}] ${method} ${pathname}`;
      return logRouter.trace(msg, ...args);
    }
    return logRouter.trace(message, ...args);
  }

  /**
   * Clears the contents of the log file for a given category. If file logging
   * is disabled (the default), it does nothing.
   * @param category Category/log name (e.g. 'info', 'warn', 'error', 'router').
   * @returns true on success, false if there was nothing to clear or an error occurred.
   */
  static clear(category: string) {
    const dir = getLogDir();
    if (!dir) return false;
    try {
      fs.writeFileSync(path.join(dir, `${category}.log`), '');
      return true;
    } catch (err) {
      return false;
    }
  }
}
