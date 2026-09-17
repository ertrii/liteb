import path from 'path';
import { ConfigService, Liteb } from '../lib';
import enableCors from './config/enable-cors';
import enableSession from './config/enable-session';
import sessionAuth from './config/session-auth';
import identity from './modules/identity/module';
import catalog from './modules/catalog/module';
import reports from './modules/reports/module';

/**
 * A small but complete liteb 2.x application. `src/demo.http` walks the whole
 * flow request by request.
 *
 * Three modules on purpose:
 * - `identity` and `catalog` are CORE: they cannot be turned off.
 * - `reports` is optional, so it installs DISABLED and stays out until someone
 *   turns it on.
 *
 * It is BUILT here and not started, so anything that needs the application
 * without a server — `liteb migrate`, a test, a one-off script — can ask for
 * it. That is the contract the CLI looks for.
 */
export async function createApp() {
  const app = await Liteb.create({
    db: {
      type: 'postgres',
      host: ConfigService.get('DB_HOST'),
      port: +ConfigService.get('DB_PORT'),
      username: ConfigService.get('DB_USERNAME'),
      password: ConfigService.get('DB_PASSWORD'),
      database: ConfigService.get('DB_NAME'),
      // Off, deliberately: every table here comes from a module's own
      // migration, which is what a real installation does.
      synchronize: false,
    },
    modules: [identity, catalog, reports],
    // Checked against each module's `engine` range.
    version: '2.0.0',
    basePath: '/api',
    // How a request becomes an actor.
    auth: sessionAuth,
  });

  app.use(enableCors());
  app.use(enableSession(app.getApp()));
  app.static('/public', './src/public');

  // Views live inside the module that owns them.
  await app.setTemplates('pug', path.join(__dirname, 'modules/*/views'));

  app.swagger('/docs', {
    title: 'Liteb Demo API',
    version: '2.0.0',
    description: 'Modules, contracts, migrations, auth and permissions.',
  });

  return app;
}

async function main() {
  const app = await createApp();
  await app.start(+ConfigService.get('SERVER_PORT'));
}

// Importing this file must not start a server.
if (require.main === module) void main();
