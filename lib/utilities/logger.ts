import * as fs from 'fs';
import * as path from 'path';
import ApiReader from '../core/api-reader';
import slash from 'slash';
import log4js from '../services/log4js';

export class Logger {
  /**
   * Registra un mensaje a nivel 'info' en el archivo y consola.
   * @param message Mensaje principal a registrar.
   * @param args Argumentos extra para el logger.
   * @returns Resultado de la función log4js info.
   */
  static info(message: any, ...args: any[]) {
    return log4js.getLogger('info').info(message, ...args);
  }

  /**
   * Registra un mensaje a nivel 'warn' en el archivo y consola.
   * @param message Mensaje principal a registrar.
   * @param args Argumentos extra para el logger.
   * @returns Resultado de la función log4js warn.
   */
  static warn(message: any, ...args: any[]) {
    return log4js.getLogger('warn').warn(message, ...args);
  }

  /**
   * Registra un mensaje a nivel 'error' en el archivo y consola.
   * @param message Mensaje principal a registrar.
   * @param args Argumentos extra para el logger.
   * @returns Resultado de la función log4js error.
   */
  static error(message: any, ...args: any[]) {
    return log4js.getLogger('error').error(message, ...args);
  }

  /**
   * Registra un mensaje en el log de rutas ('router') y consola.
   * @param message Mensaje a registrar, puede ser una cadena o una instancia de ApiReader.
   * @param args Argumentos extra para el logger.
   * @returns Resultado de la función log4js info para rutas.
   */
  static router(message: string | ApiReader, ...args: any[]) {
    const logRouter = log4js.getLogger('router');
    if (message instanceof ApiReader) {
      const priority = message.priority ?? '-';
      const method = message.method.toUpperCase();
      const version = message.getVersionPath();
      const moduleName = message.moduleName;
      const pathname = slash(
        path.join('/', version, moduleName, message.pathname),
      );
      const msg = `[${moduleName}] [${priority}] ${method} ${pathname}`;
      return logRouter.trace(msg, ...args);
    }
    return logRouter.trace(message, ...args);
  }

  /**
   * Limpia el contenido del archivo de log para una categoría dada.
   * @param category Nombre de la categoría/log (ejemplo: 'info', 'warn', 'error', 'router').
   * @returns true si la operación fue exitosa, false si hubo un error.
   */
  static clear(category: string) {
    try {
      const logFile = path.join(process.cwd(), `logs/${category}.log`);
      fs.writeFileSync(logFile, '');
      return true;
    } catch (err) {
      return false;
    }
  }
}
