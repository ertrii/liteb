import path from 'path';
import request from 'supertest';
import { afterEach, describe, expect, it } from '@jest/globals';
import { DataSource, QueryRunner } from 'typeorm';
import Liteb from '../lib/core/liteb';
import { defineModule } from '../lib/modules/define-module';
import { ModuleStore } from '../lib/modules/module-store';
import { ModuleMigrator } from '../lib/modules/module-migrator';
import { closeTestDb, createTestDb, tableNames } from './helpers/test-db';

const billingDir = path.join(__dirname, 'fixtures/modules/billing');

class CrearCargos1000 {
  async up(runner: QueryRunner) {
    await runner.query('create table cargos_demo (id int primary key)');
  }
}

const billing = () =>
  defineModule({
    id: 'billing',
    version: '1.0.0',
    core: true,
    dir: billingDir,
    routes: './controllers/*.controller.ts',
    migrations: [CrearCargos1000],
  });

/** Opcional: instalado pero apagado salvo que se lo encienda. */
const news = () =>
  defineModule({
    id: 'news',
    version: '1.0.0',
    dir: billingDir,
    routes: './controllers/*.controller.ts',
  });

describe('arranque con módulos', () => {
  let db: DataSource;
  let app: Liteb;

  const boot = async (modules: ReturnType<typeof billing>[]) => {
    app = await Liteb.create({
      db: db,
      modules: modules,
      version: '2.0.0-dev.0',
    });
    await app.start(0);
    return app.getApp();
  };

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    await closeTestDb();
  });

  it('monta las rutas de un módulo core y responde', async () => {
    db = await createTestDb();
    const server = await boot([billing()]);

    const res = await request(server).get('/api/facturacion/cargos');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ charges: [], limit: 50 });
  });

  it('corre las migraciones del módulo antes de montar', async () => {
    db = await createTestDb();
    await boot([billing()]);

    expect(await tableNames(db)).toContain('cargos_demo');
  });

  it('registra el módulo en _modules', async () => {
    db = await createTestDb();
    await boot([billing()]);

    const stored = await new ModuleStore(db).list();
    expect(stored).toEqual([
      { id: 'billing', version: '1.0.0', enabled: true },
    ]);
  });

  it('un módulo opcional llega apagado y NO responde', async () => {
    db = await createTestDb();
    const server = await boot([news()]);

    const res = await request(server).get('/api/facturacion/cargos');

    expect(res.status).toBe(404);
    expect(res.body.identifier).toBe('not_found');
  });

  it('una vez encendido, el mismo módulo sí responde', async () => {
    db = await createTestDb();

    // Primer arranque: se instala apagado.
    await boot([news()]);
    await new ModuleStore(db).enable('news');
    await app.close({ database: false });

    // Segundo arranque, misma base: ahora monta.
    app = await Liteb.create({
      db: db,
      modules: [news()],
      version: '2.0.0-dev.0',
    });
    await app.start(0);

    const res = await request(app.getApp()).get('/api/facturacion/cargos');
    expect(res.status).toBe(200);
  });

  it('no repite las migraciones en el segundo arranque', async () => {
    db = await createTestDb();
    await boot([billing()]);
    await app.close({ database: false });

    app = await Liteb.create({
      db: db,
      modules: [billing()],
      version: '2.0.0-dev.0',
    });
    await app.start(0);

    expect(await new ModuleMigrator(db).pending([billing()])).toEqual([]);
  });

  it('no arranca si un módulo pide un anfitrión incompatible', async () => {
    db = await createTestDb();
    const futuro = defineModule({
      id: 'billing',
      version: '1.0.0',
      core: true,
      engine: '^9.0.0',
    });

    app = await Liteb.create({
      db: db,
      modules: [futuro],
      version: '2.0.0-dev.0',
    });

    await expect(app.start(0)).rejects.toThrow(/needs a host matching/);
  });

  it('no arranca si falta una dependencia', async () => {
    db = await createTestDb();
    const huerfano = defineModule({
      id: 'billing',
      version: '1.0.0',
      core: true,
      requires: ['fantasma'],
    });

    app = await Liteb.create({ db, modules: [huerfano] });

    await expect(app.start(0)).rejects.toThrow(/is not installed/);
  });

  it('sin módulos, el arranque es el de siempre', async () => {
    db = await createTestDb();
    app = await Liteb.create({ db, modules: [] });
    await app.start(0);

    expect(await tableNames(db)).not.toContain('_modules');
  });
});
