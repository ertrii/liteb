import path from 'path';
import request from 'supertest';
import { afterEach, describe, expect, it } from '@jest/globals';
import { DataSource, QueryRunner } from 'typeorm';
import { PGliteDriver } from 'typeorm-pglite';
import Liteb from '../lib/core/liteb';
import { defineModule } from '../lib/modules/define-module';
import { collectModuleEntities } from '../lib/modules/collect-entities';
import { ModuleDefinitionError } from '../lib/modules/module-manifest';
import { Product } from './fixtures/modules/catalog/product.entity';
import { closeTestDb, createTestDb } from './helpers/test-db';

const catalogDir = path.join(__dirname, 'fixtures/modules/catalog');

class CrearProductos1000 {
  async up(runner: QueryRunner) {
    await runner.query(
      'create table productos_demo (id int primary key, nombre varchar)',
    );
    await runner.query("insert into productos_demo values (1, 'Antena')");
  }
}

const catalog = () =>
  defineModule({
    id: 'catalog',
    version: '1.0.0',
    core: true,
    dir: catalogDir,
    entities: [Product],
    migrations: [CrearProductos1000],
    routes: './controllers/*.controller.ts',
  });

describe('collectModuleEntities', () => {
  class Charge {}
  class Invoice {}

  it('junta las entidades de todos los módulos', () => {
    const a = defineModule({ id: 'a', version: '1.0.0', entities: [Charge] });
    const b = defineModule({ id: 'b', version: '1.0.0', entities: [Invoice] });

    expect(collectModuleEntities([a, b])).toEqual([Charge, Invoice]);
  });

  it('incluye las de un módulo que podría estar apagado', () => {
    // Apagar decide qué CORRE, no si los datos siguen alcanzables.
    const encendido = defineModule({ id: 'a', version: '1.0.0', entities: [Charge] });
    const apagado = defineModule({ id: 'b', version: '1.0.0', entities: [Invoice] });

    expect(collectModuleEntities([encendido, apagado])).toHaveLength(2);
  });

  it('rechaza la misma entidad declarada por dos módulos', () => {
    const a = defineModule({ id: 'a', version: '1.0.0', entities: [Charge] });
    const b = defineModule({ id: 'b', version: '1.0.0', entities: [Charge] });

    expect(() => collectModuleEntities([a, b])).toThrow(ModuleDefinitionError);
    expect(() => collectModuleEntities([a, b])).toThrow(
      /declared by both "a" and "b"/,
    );
  });

  it('sin módulos devuelve vacío', () => {
    expect(collectModuleEntities([])).toEqual([]);
  });
});

describe('Liteb.create', () => {
  let app: Liteb | undefined;

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    app = undefined;
    await closeTestDb();
  });

  it('registra las entidades del módulo en el DataSource', async () => {
    app = await Liteb.create({
      db: {
        type: 'postgres',
        driver: new PGliteDriver().driver,
        database: 'liteb_test',
        synchronize: false,
      } as never,
      modules: [catalog()],
      version: '2.0.0-dev.0',
    });

    // El endpoint usa this.db.getRepository(Product): sin la entidad
    // registrada, esto respondería 500.
    await app.start(0);
    const res = await request(app.getApp()).get('/api/catalogo/productos');

    expect(res.status).toBe(200);
    expect(res.body.productos).toEqual([{ id: 1, nombre: 'Antena' }]);
  });

  it('acepta un DataSource ya construido', async () => {
    const db: DataSource = await createTestDb();

    app = await Liteb.create({ db, modules: [], version: '2.0.0-dev.0' });
    await app.start(0);

    expect(app.getApp()).toBeDefined();
  });

  it('falla al crear si dos módulos declaran la misma entidad', async () => {
    const a = defineModule({ id: 'a', version: '1.0.0', entities: [Product] });
    const b = defineModule({ id: 'b', version: '1.0.0', entities: [Product] });

    await expect(
      Liteb.create({
        db: { type: 'postgres', database: 'x' } as never,
        modules: [a, b],
      }),
    ).rejects.toThrow(/belongs to exactly one module/);
  });

  it('sin módulos se comporta como el constructor de siempre', async () => {
    const db = await createTestDb();
    app = await Liteb.create({ db });

    await app.start(0);
    expect(app.getApp()).toBeDefined();
  });
});
