import cors from 'cors';
import { ConfigService } from '../../lib';

export default function enableCors() {
  // CORS is a node.js package for providing a Connect/Express
  // middleware that can be used to enable CORS with various options.
  const corsOrigin = ConfigService.get('CORS_ORIGIN');

  /**
   * Open server for a list clients request
   */
  const whitelist = corsOrigin.split(',').map((v) => v.trim());

  return cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
      } else if (whitelist.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['POST', 'PUT', 'GET', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    credentials: true,
  });
}
