import { DataSource } from 'typeorm';
import { ConfigService, ModuleStore } from '../../lib';

/**
 * Turns modules on and off from the command line.
 *
 * `ModuleStore` is public API and talks to `_modules` with plain SQL, so it
 * needs no entities registered — which is the point: the framework's own
 * bookkeeping must not force an application to know about it.
 *
 *   npm run modules -- list
 *   npm run modules -- enable reports
 *   npm run modules -- disable reports
 */
async function main() {
  const [action, moduleId] = process.argv.slice(2);

  const db = new DataSource({
    type: 'postgres',
    host: ConfigService.get('DB_HOST'),
    port: +ConfigService.get('DB_PORT'),
    username: ConfigService.get('DB_USERNAME'),
    password: ConfigService.get('DB_PASSWORD'),
    database: ConfigService.get('DB_NAME'),
    entities: [],
    synchronize: false,
  });

  await db.initialize();
  const store = new ModuleStore(db);

  try {
    if (action === 'list') {
      const rows = await store.list();
      if (rows.length === 0) {
        console.log('Nothing installed yet — start the app once.');
      }
      for (const row of rows) {
        console.log(
          `${row.enabled ? 'on ' : 'off'}  ${row.id}@${row.version}`,
        );
      }
      return;
    }

    if ((action === 'enable' || action === 'disable') && moduleId) {
      await (action === 'enable'
        ? store.enable(moduleId)
        : store.disable(moduleId));
      console.log(`${moduleId}: ${action}d. Restart the app to apply it.`);
      return;
    }

    console.log('Usage: npm run modules -- list | enable <id> | disable <id>');
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

main();
