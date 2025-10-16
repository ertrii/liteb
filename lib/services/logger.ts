import * as log4js from 'log4js';
import * as fs from 'fs';
import * as path from 'path';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

/**
 * 10MB
 */
const maxLogSize = 10485760;

log4js.configure({
  appenders: {
    info: {
      type: 'file',
      filename: path.join(logsDir, 'info.log'),
      maxLogSize,
      backups: 3,
      compress: true,
      layout: {
        type: 'pattern',
        pattern: '[%d{dd/MM/yyyy hh:mm:ss}] [INFO] %m',
      },
    },
    warn: {
      type: 'file',
      filename: path.join(logsDir, 'warn.log'),
      maxLogSize,
      backups: 3,
      compress: true,
      layout: {
        type: 'pattern',
        pattern: '[%d{dd/MM/yyyy hh:mm:ss}] [WARN] %m',
      },
    },
    error: {
      type: 'file',
      filename: path.join(logsDir, 'error.log'),
      maxLogSize,
      backups: 3,
      compress: true,
      layout: {
        type: 'pattern',
        pattern: '[%d{dd/MM/yyyy hh:mm:ss}] [ERROR] %m',
      },
    },
    router: {
      type: 'file',
      filename: path.join(logsDir, 'router.log'),
      maxLogSize,
      backups: 3,
      compress: true,
      layout: {
        type: 'pattern',
        pattern: '[%d{dd/MM/yyyy hh:mm:ss}] [ROUTER] %m',
      },
    },
    console: {
      type: 'console',
      layout: {
        type: 'pattern',
        // Colorful output, succinct: timestamp, level (color), message
        pattern: '%[%d{dd-MM-yy hh:mm:ss}%] %[%5p%] %m',
        // log4js automatically supports color on supported terminals
      },
    },
  },
  categories: {
    default: {
      appenders: ['console'],
      level: 'trace',
    },
    info: {
      appenders: ['info', 'console'],
      level: 'info',
    },
    warn: {
      appenders: ['warn', 'console'],
      level: 'warn',
    },
    error: {
      appenders: ['error', 'console'],
      level: 'error',
    },
    router: {
      appenders: ['router'],
      level: 'trace',
    },
  },
});

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
   * @param message Mensaje principal a registrar.
   * @param args Argumentos extra para el logger.
   * @returns Resultado de la función log4js info para rutas.
   */
  static router(message: any, ...args: any[]) {
    return log4js.getLogger('router').trace(message, ...args);
  }

  /**
   * Limpia el contenido del archivo de log para una categoría dada.
   * @param category Nombre de la categoría/log (ejemplo: 'info', 'warn', 'error', 'router').
   * @returns true si la operación fue exitosa, false si hubo un error.
   */
  static clear(category: string) {
    try {
      const logFile = path.join(__dirname, `../../logs/${category}.log`);
      fs.writeFileSync(logFile, '');
      return true;
    } catch (err) {
      return false;
    }
  }
}
