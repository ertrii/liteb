import * as log4js from 'log4js';

log4js.configure({
  appenders: {
    info: {
      type: 'file',
      filename: 'info.log',
    },
    console: {
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%[%d{dd/MM/yyyy hh:mm:ss} %-5p%] %m',
      },
    },
  },
  categories: {
    default: { appenders: ['info', 'console'], level: 'trace' },
  },
});

/**
 * @trace blue
 * @debug cyan
 * @info green
 * @warn yellow
 * @error red
 * @fatal magenta
 */
const logger = log4js.getLogger();

export default logger;
