import * as log4js from 'log4js';
import * as fs from 'fs';
import * as path from 'path';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

log4js.configure({
  appenders: {
    info: {
      type: 'file',
      filename: path.join(logsDir, 'info.log'),
      maxLogSize: 10485760, // 10MB
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
      maxLogSize: 10485760,
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
      maxLogSize: 10485760,
      backups: 3,
      compress: true,
      layout: {
        type: 'pattern',
        pattern: '[%d{dd/MM/yyyy hh:mm:ss}] [ERROR] %m',
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
      appenders: ['info', 'warn', 'error', 'console'],
      level: 'trace',
    },
  },
});

/**
 * Logger Levels:
 * @trace blue
 * @debug cyan
 * @info green
 * @warn yellow
 * @error red
 * @fatal magenta
 */
const logger = log4js.getLogger();

export default logger;
