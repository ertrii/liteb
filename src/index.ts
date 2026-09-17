import { ConfigService, Liteb } from '../lib';
import enableCors from './config/enable-cors';
import enableSession from './config/enable-session';
import sessionAuth from './config/session-auth';
import users from './modules/users/module';
import categories from './modules/categories/module';
import crm from './modules/crm/module';

async function main() {
  const liteb = await Liteb.create({
    db: {
      type: 'postgres',
      host: ConfigService.get('DB_HOST'),
      port: +ConfigService.get('DB_PORT'),
      username: ConfigService.get('DB_USERNAME'),
      password: ConfigService.get('DB_PASSWORD'),
      database: ConfigService.get('DB_NAME'),
      // The demo has no migrations: TypeORM creates the module tables.
      synchronize: true,
    },
    // `categories` is optional: it installs disabled, and stays out until it is
    // turned on in `_modules`. `users` and `crm` are core.
    modules: [users, categories, crm],
    version: '2.0.0',
    basePath: '/api',
    // How a request becomes an actor. Endpoints read it as `this.auth`.
    auth: sessionAuth,
  });

  liteb.use(enableCors());
  liteb.use(enableSession(liteb.getApp()));
  liteb.static('/public', './src/public');
  liteb.swagger('/docs', {
    title: 'Liteb Sample API',
    version: '2.0.0',
    description: 'Demo of Liteb modules, contracts and auto-generated docs.',
  });

  await liteb.start(+ConfigService.get('SERVER_PORT'));
}

main();
