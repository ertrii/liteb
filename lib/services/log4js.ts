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

export default log4js.configure({
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
