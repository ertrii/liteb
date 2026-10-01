import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { defineModule } from '../lib/modules/define-module';
import { ModuleStore } from '../lib/modules/module-store';
import type { ModuleManifest } from '../lib/modules/module-manifest';
import {
  closeTestDb,
  createTestDb,
  resetSchema,
  tableNames,
} from './helpers/test-db';
import type { Database } from '../lib';

const mod = (id: string, extra: Partial<ModuleManifest> = {}) =>
  defineModule({ id, version: '1.0.0', ...extra });

describe('ModuleStore', () => {
  let db: Database;
  let store: ModuleStore;

  beforeAll(async () => {
    db = await createTestDb();
    store = new ModuleStore(db);
  });

  beforeEach(async () => {
    await resetSchema(db);
    await store.ensureTable();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('la tabla', () => {
    it('se crea sola', async () => {
      expect(await tableNames(db)).toContain('_modules');
    });

    it('crearla dos veces no falla', async () => {
      await store.ensureTable();
      await store.ensureTable();
      expect(await tableNames(db)).toContain('_modules');
    });

    it('empieza vacía', async () => {
      expect(await store.list()).toEqual([]);
    });
  });

  describe('sync', () => {
    it('registra los módulos nuevos', async () => {
      await store.sync([mod('identity'), mod('news')]);

      const stored = await store.list();
      expect(stored).toEqual(
        expect.arrayContaining([
          { id: 'identity', version: '1.0.0' },
          { id: 'news', version: '1.0.0' },
        ]),
      );
    });

    it('correrlo dos veces no cambia nada', async () => {
      const modules = [mod('identity'), mod('news')];

      await store.sync(modules);
      const segunda = await store.sync(modules);

      expect(segunda.install).toEqual([]);
      expect(segunda.upgrade).toEqual([]);
      expect(await store.list()).toHaveLength(2);
    });

    it('guarda la versión nueva al actualizar', async () => {
      await store.sync([mod('billing')]);
      const result = await store.sync([mod('billing', { version: '2.0.0' })]);

      expect(result.upgrade).toEqual([
        { id: 'billing', from: '1.0.0', to: '2.0.0', downgrade: false },
      ]);
      expect((await store.list())[0].version).toBe('2.0.0');
    });

    it('no borra el registro de un módulo cuyo código ya no está', async () => {
      await store.sync([mod('news'), mod('legacy-thing')]);
      const result = await store.sync([mod('news')]);

      expect(result.orphaned.map((m) => m.id)).toEqual(['legacy-thing']);
      expect((await store.list()).map((m) => m.id).sort()).toEqual([
        'legacy-thing',
        'news',
      ]);
    });

    it('informa sólo lo que entró nuevo', async () => {
      await store.sync([mod('identity'), mod('news')]);

      const result = await store.sync([
        mod('identity'),
        mod('news'),
        mod('support'),
      ]);

      expect(result.install.map((m) => m.id)).toEqual(['support']);
    });
  });

  describe('olvidar', () => {
    it('borra la fila', async () => {
      await store.sync([mod('news')]);
      await store.forget('news');

      expect(await store.list()).toEqual([]);
    });

    it('olvidar y volver a sincronizar lo reinstala', async () => {
      await store.sync([mod('news')]);
      await store.forget('news');

      const result = await store.sync([mod('news')]);

      expect(result.install).toEqual([{ id: 'news', version: '1.0.0' }]);
    });
  });
});
