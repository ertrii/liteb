import path from 'path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { DataSource, QueryRunner } from 'typeorm';
import Liteb from '../lib/core/liteb';
import { defineModule } from '../lib/modules/define-module';
import { closeTestDb, createTestDb, tableNames } from './helpers/test-db';

/**
 * Migrar sin levantar el servidor.
 *
 * Hasta ahora las migraciones sólo corrían dentro de `start()`, que además
 * monta rutas y arranca crons. En un despliegue eso obliga a "levantar la app
 * para migrar": si la migración falla, el servidor ya está arriba. Separarlo
 * permite `migrate` y después `start`, y que el primero rompa la release.
 */

const dir = path.join(__dirname, 'fixtures/modules/billing');

class CrearCargos1000 {
  async up(runner: QueryRunner) {
    await runner.query('create table cargos_demo (id int primary key)');
  }
}

class CrearNotas2000 {
  async up(runner: QueryRunner) {
    await runner.query('create table notas_demo (id int primary key)');
  }
}

const billing = () =>
  defineModule({
    id: 'billing',
    version: '1.0.0',
    core: true,
    dir,
    routes: './controllers/*.controller.ts',
    migrations: [CrearCargos1000],
  });

/** Opcional: instala APAGADO, así que no migra. */
const news = () =>
  defineModule({
    id: 'news',
    version: '1.0.0',
    dir,
    migrations: [CrearNotas2000],
  });

/** Un módulo cuyo índice de migraciones no exporta nada. */
const sinMigraciones = () =>
  defineModule({ id: 'vacio', version: '1.0.0', core: true, dir, migrations: {} });

describe('app.migrate()', () => {
  let db: DataSource;
  let app: Liteb;

  const build = async (modules: ReturnType<typeof billing>[]) => {
    app = await Liteb.create({ db, modules, version: '2.0.0' });
    return app;
  };

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    await closeTestDb();
  });

  it('corre las migraciones sin montar nada', async () => {
    db = await createTestDb();
    const application = await build([billing()]);

    const ran = await application.migrate();

    expect(ran).toEqual([{ module: 'billing', name: 'CrearCargos1000' }]);
    expect(await tableNames(db)).toContain('cargos_demo');
  });

  it('la segunda vez no repite nada', async () => {
    db = await createTestDb();
    const application = await build([billing()]);

    await application.migrate();
    expect(await application.migrate()).toEqual([]);
  });

  it('un módulo APAGADO no migra: apagarlo también apaga su esquema', async () => {
    db = await createTestDb();
    const application = await build([billing(), news()]);

    const ran = await application.migrate();

    expect(ran.map((entry) => entry.module)).toEqual(['billing']);
    expect(await tableNames(db)).not.toContain('notas_demo');
  });

  it('--dry-run dice qué correría y no toca la base', async () => {
    db = await createTestDb();
    const application = await build([billing()]);

    const pending = await application.migrate({ dryRun: true });

    expect(pending).toEqual([{ module: 'billing', name: 'CrearCargos1000' }]);
    expect(await tableNames(db)).not.toContain('cargos_demo');
    // Tampoco registró el módulo: un ensayo no instala nada.
    const registrados = await db.query('select id from _modules');
    expect(registrados).toEqual([]);
  });

  it('abre la conexión si nadie la abrió', async () => {
    // Es la diferencia con start(): un comando que sólo migra no debería tener
    // que inicializar la conexión por su cuenta.
    db = await createTestDb();
    await db.destroy();
    const application = await build([billing()]);

    await application.migrate();

    expect(db.isInitialized).toBe(true);
  });
});

describe('app.migrationStatus()', () => {
  let db: DataSource;
  let app: Liteb;

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    await closeTestDb();
  });

  it('dice qué declaró cada módulo y qué de eso ya corrió', async () => {
    db = await createTestDb();
    app = await Liteb.create({
      db,
      modules: [billing(), news()],
      version: '2.0.0',
    });

    expect(await app.migrationStatus()).toEqual([
      {
        module: 'billing',
        enabled: true,
        migrations: [{ name: 'CrearCargos1000', applied: false }],
      },
      {
        module: 'news',
        enabled: false,
        migrations: [{ name: 'CrearNotas2000', applied: false }],
      },
    ]);

    await app.migrate();

    const despues = await app.migrationStatus();
    expect(despues[0].migrations[0].applied).toBe(true);
    // El apagado sigue pendiente: por eso se informa `enabled`.
    expect(despues[1].migrations[0].applied).toBe(false);
  });

  it('un módulo sin migraciones declaradas se ve como tal', async () => {
    // Es el caso que desde la base es indistinguible de "todavía no corrió":
    // el archivo existe pero el índice no lo exporta.
    db = await createTestDb();
    app = await Liteb.create({
      db,
      modules: [sinMigraciones()],
      version: '2.0.0',
    });

    expect(await app.migrationStatus()).toEqual([
      { module: 'vacio', enabled: true, migrations: [] },
    ]);
  });
});
