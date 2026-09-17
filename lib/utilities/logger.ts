import * as fs from 'fs';
import * as path from 'path';
import EndpointReader from '../core/endpoint-reader';
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
   * Writes one line of the route map ('router' log, `router.log` when file
   * logging is on).
   *
   * The map exists for one question: WHICH ROUTE WINS. Express matches in
   * registration order, so `/products/:id` registered before `/products/page`
   * swallows the page and the handler receives the literal string "page" — a
   * bug that looks like a data problem. The listing prints routes in the order
   * they were mounted, with the `@Priority` that put each one there, so the
   * answer is read off the file instead of guessed.
   *
   * @param message A line of text, or the endpoint to print.
   * @param options `order` is the position in the whole mount (1 = matched
   * first); `basePath` completes the URL.
   */
  static router(
    message: string | EndpointReader,
    options: { order?: number; basePath?: string } = {},
  ) {
    const logRouter = log4js.getLogger('router');
    if (message instanceof EndpointReader) {
      const order =
        options.order === undefined
          ? '   '
          : `#${String(options.order).padStart(2, '0')}`;
      // `auto` and not `-`: no `@Priority` is the normal case, not a gap.
      const priority =
        message.priority === null ? 'auto' : `p${message.priority}`;
      const method = message.method.toUpperCase().padEnd(6);
      const pathname = slash(
        path.join('/', options.basePath ?? '', message.moduleName, message.pathname),
      );
      const name = message.getEndpointClass().name;
      return logRouter.trace(
        `${order} ${priority.padEnd(4)} ${method} ${pathname}  (${name})`,
      );
    }
    return logRouter.trace(message);
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
