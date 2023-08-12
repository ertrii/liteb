import { Express } from 'express';
import { Server } from 'socket.io';
import http from 'http';
import logger from '../utilities/logger';

export default function socket(app: Express) {
  const io = new Server(http.createServer(app));
  io.on('connection', (listener) => {
    logger.info('Socket running');
    listener.emit('a', {
      message: '',
    });
    listener.broadcast.emit('a', 'asf');
  });
}
