import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import {
  createEndpoint,
  createEntity,
  createListener,
  createMigration,
  createModule,
  createTask,
} from '../lib/cli/generators';
import { applyEdit } from '../lib/cli/writer';
import { apply } from '../lib/cli/writer';
import { parseTarget, toKebab, toPascal } from '../lib/cli/names';
import { AuthResolver, collectModuleEntities, Liteb, ResolvedModule } from '../lib';
import { closeTestDb, createTestDb } from './helpers/test-db';

/**
 * El CLI escribe la FORMA de un módulo, y esta prueba es la razón por la que
 * se puede volver a tener uno.
 *
 * El CLI de 1.x se borró porque sus plantillas eran archivos sueltos que nadie
 * compilaba: derivaron hasta generar decoradores que el framework ya no tenía.
 * Acá las plantillas son parte del build Y lo generado se ARRANCA de verdad:
 * si una plantilla deja de coincidir con el framework, esta suite se cae.
 */

const workspace = path.join(__dirname, '.generated');
const modulesDir = 'src/modules';

const scaffold = (plan: ReturnType<typeof createModule>) =>
  apply(plan, { root: workspace, force: true });

const read = (file: string) =>
  fs.readFileSync(path.join(workspace, file), 'utf8');

describe('nombres', () => {
  it('normaliza venga como venga', () => {
    expect(toKebab('MyModule')).toBe('my-module');
    expect(toKebab('my_module')).toBe('my-module');
    expect(toKebab('listProducts')).toBe('list-products');
    expect(toPascal('list-products')).toBe('ListProducts');
  });

  it('exige decir a qué módulo pertenece', () => {
    expect(() => parseTarget('list-products', 'endpoint')).toThrow(
      /liteb create endpoint <module>\/<name>/,
    );
    expect(parseTarget('catalog/list-products', 'endpoint')).toEqual({
      module: 'catalog',
      name: 'list-products',
    });
  });
});

describe('ediciones sobre archivos que el generador no escribió', () => {
  it('descomenta la línea que la propia plantilla dejó puesta', () => {
    const source = "  routes: './apis/*.api.ts',\n  // tasks: './tasks/*.task.ts',\n";
    expect(applyEdit(source, { path: 'x', uncomment: "tasks: './tasks/*.task.ts'," })).toContain(
      "\n  tasks: './tasks/*.task.ts',",
    );
  });

  it('ante un archivo que no reconoce NO adivina', () => {
    // Devolver null es lo que convierte la edición en una instrucción escrita,
    // en vez de dejar un manifiesto hecho a mano a medio editar.
    expect(applyEdit('nada que ver', { path: 'x', uncomment: 'tasks' })).toBeNull();
    expect(
      applyEdit('export default {}', {
        path: 'x',
        arrayEntry: { field: 'entities', value: 'Product', importLine: 'import x' },
      }),
    ).toBeNull();
  });

  it('agrega al arreglo y trae su import', () => {
    const source = "import { defineModule } from 'liteb';\n\nexport default defineModule({\n  entities: [],\n});\n";
    const after = applyEdit(source, {
      path: 'x',
      arrayEntry: {
        field: 'entities',
        value: 'Product',
        importLine: "import { Product } from './entities/product.entity';",
      },
    });

    expect(after).toContain('entities: [Product]');
    expect(after).toContain("import { Product } from './entities/product.entity';");
  });

  it('el índice de migraciones deja de ser un módulo vacío al llegar la primera', () => {
    const after = applyEdit('export {};\n', {
      path: 'x',
      append: "export * from './1-create';",
    });

    expect(after).toBe("export * from './1-create';\n");
  });
});

describe('un módulo generado y puesto a andar', () => {
  let db: DataSource;
  let app: Liteb;
  const server = () => app.getApp();

  const auth: AuthResolver = (req) =>
    req.headers['x-perms']
      ? {
          // El actor lo define la app (declaration merging); acá alcanza con
          // que exista uno.
          actor: { userId: 1 },
          permissions: String(req.headers['x-perms']).split(','),
        }
      : null;

  beforeAll(async () => {
    fs.rmSync(workspace, { recursive: true, force: true });

    scaffold(createModule({ name: 'Inventory', modulesDir, from: 'liteb' }));
    scaffold(
      createEndpoint({
        target: 'inventory/count-items',
        modulesDir,
        from: 'liteb',
        method: 'post',
        path: 'count',
      }),
    );
    scaffold(createEntity({ target: 'inventory/item', modulesDir, from: 'liteb' }));
    scaffold(createTask({ target: 'inventory/nightly', modulesDir, from: 'liteb' }));
    scaffold(createListener({ target: 'inventory/audit', modulesDir, from: 'liteb' }));
    scaffold(
      createMigration({ target: 'inventory/create-items', modulesDir, from: 'liteb' }),
    );

    // Sin resetModules(): reiniciar el registro le daría al módulo generado una
    // copia NUEVA de liteb, y su `Endpoint` ya no sería el mismo que el del
    // cargador — `instanceof` falla y no se monta ninguna ruta.
    const manifest = path.join(workspace, modulesDir, 'inventory/module.ts');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const inventory = require(manifest).default as ResolvedModule;

    db = await createTestDb(collectModuleEntities([inventory]));
    app = await Liteb.create({
      db,
      modules: [inventory],
      version: '2.0.0',
      basePath: '/api',
      auth,
    });
    await app.start(0);
  });

  afterAll(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    await closeTestDb();
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('el manifiesto quedó válido: el módulo está encendido', () => {
    // defineModule valida al importarse, así que llegar hasta acá ya significa
    // que id, versión, engine y claves de permiso pasaron.
    expect(app.permissions()).toEqual([
      { key: 'inventory.view', label: 'View inventory', moduleId: 'inventory' },
    ]);
  });

  it('el endpoint que vino con el módulo responde', async () => {
    const res = await request(server())
      .get('/api/inventory')
      .set('x-perms', 'inventory.view');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('y su permiso es el mismo que declara el manifiesto', async () => {
    // Si la plantilla del endpoint y la del manifiesto se separan, esto es un
    // 500 por clave no declarada, no un 403.
    const res = await request(server()).get('/api/inventory');

    expect(res.status).toBe(401);
  });

  it('el endpoint agregado después se monta con su método y su ruta', async () => {
    const res = await request(server())
      .post('/api/inventory/count')
      .set('x-perms', 'inventory.view');

    expect(res.status).toBe(200);
  });

  it('la entidad quedó registrada en el manifiesto, no sólo escrita', () => {
    const manifest = read(`${modulesDir}/inventory/module.ts`);

    expect(manifest).toContain('entities: [Item]');
    expect(manifest).toContain(
      "import { Item } from './entities/item.entity';",
    );
  });

  it('la migración corrió y quedó anotada en el registro del módulo', async () => {
    const rows = await db.query(
      'select module, name from _module_migrations order by name',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].module).toBe('inventory');
    expect(rows[0].name).toMatch(/^CreateItems\d+$/);
  });

  it('tarea y oyente encendieron sus globs en el manifiesto', () => {
    const manifest = read(`${modulesDir}/inventory/module.ts`);

    expect(manifest).toContain("tasks: './tasks/*.task.ts',");
    expect(manifest).toContain("listeners: './listeners/*.listener.ts',");
    expect(manifest).not.toContain("// tasks:");
  });
});
