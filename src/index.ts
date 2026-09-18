import path from 'path';
import { existsSync } from 'fs';
import { ConfigService, Liteb } from '../lib';
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

    // Who may call this API from a browser. liteb owns the mechanism — headers,
    // preflight, order — and the application owns the policy, the same split as
    // `auth`. With `credentials` the list has to be explicit: a browser refuses
    // `*` on a request that carries cookies, and liteb refuses to start rather
    // than let you find that out in a console.
    cors: {
      origin: (ConfigService.get('CORS_ORIGIN') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      credentials: true,
    },

    // Can this application serve? An unauthenticated 200/503 for a load
    // balancer, a container runtime or an uptime check. Outside `basePath`,
    // and kept out of the access log so a probe every few seconds does not
    // bury every real request.
    health: {
      path: '/health',
      // liteb only knows what it owns — the process and the database. What
      // ELSE has to be true for THIS application to serve is knowledge it
      // cannot guess, so it goes here. A check that throws counts as `fail`;
      // one that hangs is cut off, because a probe that never answers reads to
      // a balancer as a network problem instead of as an unwell instance.
      checks: {
        uploads: () => existsSync(path.join(__dirname, 'public')),
      },
    },

    // Generated from the same decorators that mount the routes, so it cannot
    // drift from what the API does. It does publish the full shape of the API
    // to whoever finds the URL, so an application that minds puts it behind
    // its own gate or drops the option.
    docs: {
      path: '/docs',
      info: {
        title: 'Liteb Demo API',
        version: '2.0.0',
        description: 'Modules, contracts, migrations, auth and permissions.',
      },
    },

    // Rotating files in `logs/`: `app.log` with everything in one stream,
    // `info`/`warn`/`error` split out for grepping, and `router.log` — the map
    // of what answers where, in registration order. Declared even though it is
    // the default, because this is the file where you look for the knob:
    // `dir: null` for a container, `files` to rename or drop one.
    logs: { dir: 'logs' },

    // How a request becomes an actor.
    auth: sessionAuth,
  });

  app.use(enableSession(app.getApp()));
  app.static('/public', './src/public');

  // Views live inside the module that owns them.
  await app.setTemplates('pug', path.join(__dirname, 'modules/*/views'));

  return app;
}

async function main() {
  const app = await createApp();
  await app.start(+ConfigService.get('SERVER_PORT'));
}

// Importing this file must not start a server.
if (require.main === module) void main();
