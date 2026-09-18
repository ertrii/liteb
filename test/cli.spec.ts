import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import {
  createContract,
  createEndpoint,
  createEvent,
  createEntity,
  createListener,
  createMigration,
  createModule,
  createProvider,
  createRoutine,
  createSlot,
} from '../lib/cli/generators';
import { applyEdit } from '../lib/cli/writer';
import { apply } from '../lib/cli/writer';
import { createProject } from '../lib/cli/init';
import { parseTarget, toKebab, toPascal } from '../lib/cli/names';
import {
  AuthResolver,
  buildContainer,
  collectModuleEntities,
  Liteb,
  ResolvedModule,
} from '../lib';
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

const litebVersion = '^2.0.0-alpha.1';

const read = (file: string) =>
  fs.readFileSync(path.join(workspace, file), 'utf8');

/**
 * Un archivo sin sus comentarios: lo que DECLARA, no lo que explica.
 *
 * La plantilla del manifiesto documenta la disposición estándar — y nombra
 * `routes:` para mostrar cómo cambiarla — así que buscar el texto pelado
 * confundiría la explicación con una declaración.
 */
const declared = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

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
  it('ante un archivo que no reconoce NO adivina', () => {
    // Devolver null es lo que convierte la edición en una instrucción escrita,
    // en vez de dejar un manifiesto hecho a mano a medio editar.
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

describe('liteb init', () => {
  it('escribe un proyecto que arranca, no una carpeta vacía', () => {
    const files = createProject({ name: 'Mi App', litebVersion }).files;
    const paths = files.map((file) => file.path);

    expect(paths).toEqual([
      'package.json',
      'tsconfig.json',
      '.gitignore',
      '.env',
      '.env.template',
      'src/index.ts',
      'src/config/permissions.ts',
    ]);
  });

  it('el package.json es válido y trae lo que el framework necesita', () => {
    const [pkg] = createProject({ name: 'mi-app', litebVersion }).files;
    const parsed = JSON.parse(pkg.content);

    expect(parsed.name).toBe('mi-app');
    expect(parsed.dependencies.liteb).toBe(litebVersion);
    // Son peer dependencies de liteb: sin ellas no arranca nada.
    expect(Object.keys(parsed.dependencies)).toEqual(
      expect.arrayContaining(['typeorm', 'express', 'class-validator']),
    );
    expect(parsed.scripts.build).toBe('liteb build');
  });

  it('deja listo lo que todo backend termina necesitando', () => {
    const index = createProject({ name: 'mi-app', litebVersion }).files.find(
      (file) => file.path === 'src/index.ts',
    )!.content;

    // Salud: un 200/503 sin credenciales, que es lo que lee un balanceador.
    expect(index).toContain("health: { path: '/health' }");
    // Documentación viva, apagada en producción: el mapa de la API no se
    // regala.
    expect(index).toContain("{ path: '/docs' }");
    expect(index).toContain("ConfigService.mode() === 'production' ? undefined");
    // Archivos de log en desarrollo, consola en producción: dentro de un
    // contenedor el disco no es donde nadie lee.
    expect(index).toContain(
      "logs: { dir: ConfigService.mode() === 'production' ? null : 'logs' }",
    );

    const env = createProject({ name: 'mi-app', litebVersion }).files.find(
      (file) => file.path === '.env',
    )!.content;
    expect(env).toContain('NODE_ENV=development');
  });

  it('el tsconfig trae los dos flags sin los cuales nada funciona', () => {
    const tsconfig = createProject({ name: 'mi-app', litebVersion }).files[1];

    expect(tsconfig.content).toContain('"experimentalDecorators": true');
    expect(tsconfig.content).toContain('"emitDecoratorMetadata": true');
    // Con esto en true, cada campo de una entidad es un error.
    expect(tsconfig.content).toContain('"strictPropertyInitialization": false');
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

  let inventory: ResolvedModule;

  beforeAll(async () => {
    fs.rmSync(workspace, { recursive: true, force: true });

    // El camino real: primero el proyecto, después los módulos.
    scaffold(createProject({ name: 'inventory-app', litebVersion }));
    scaffold(createModule({ name: 'Inventory', modulesDir, from: 'liteb' }));
    scaffold(
      createEndpoint({
        target: 'inventory/count-items',
        modulesDir,
        from: 'liteb',
        method: 'post',
        path: 'count',
        // `--permission`: la aserción se escribe VIVA. Es opt-in justamente
        // porque exige un resolutor `auth`, que un proyecto recién creado no
        // tiene. Clave NUEVA a propósito: el generador tiene que declararla.
        permission: 'inventory.count',
      }),
    );
    scaffold(createEntity({ target: 'inventory/item', modulesDir, from: 'liteb' }));
    scaffold(
      createRoutine({ target: 'inventory/nightly', modulesDir, from: 'liteb' }),
    );
    scaffold(createListener({ target: 'inventory/audit', modulesDir, from: 'liteb' }));
    scaffold(
      createMigration({ target: 'inventory/create-items', modulesDir, from: 'liteb' }),
    );
    scaffold(
      createContract({ target: 'inventory/stock', modulesDir, from: 'liteb' }),
    );
    scaffold(
      createProvider({ target: 'inventory/stock', modulesDir, from: 'liteb' }),
    );
    scaffold(
      createEvent({ target: 'inventory/item-added', modulesDir, from: 'liteb' }),
    );
    scaffold(
      createSlot({ target: 'inventory/labels', modulesDir, from: 'liteb' }),
    );

    // Antes que nada: el archivo que le enseña al compilador las claves de
    // ESTA app. Sin él, los endpoints generados se tipan contra las claves de
    // la demo de `src/` — que comparte programa de TypeScript con las pruebas —
    // y `assert('inventory.count')` no compila. Una app de verdad lo tiene
    // siempre; acá hay dos apps en el mismo tsconfig.
    require(path.join(workspace, 'src/config/permissions.ts'));

    // Sin resetModules(): reiniciar el registro le daría al módulo generado una
    // copia NUEVA de liteb, y su `Endpoint` ya no sería el mismo que el del
    // cargador — `instanceof` falla y no se monta ninguna ruta.
    const manifest = path.join(workspace, modulesDir, 'inventory/module.ts');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    inventory = require(manifest).default as ResolvedModule;

    db = await createTestDb(collectModuleEntities([inventory]));
    app = await Liteb.create({
      db,
      modules: [inventory],
      // La versión de LA APLICACIÓN, que es contra lo que se chequea el
      // `engine` de cada módulo. La plantilla del manifiesto pide `^1.0.0` y
      // la de `init` declara `1.0.0`: si se separan, no arranca.
      version: '1.0.0',
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
      // La segunda la declaró `create endpoint --permission`.
      { key: 'inventory.count', label: 'Count inventory', moduleId: 'inventory' },
    ]);
  });

  it('el archivo se llama endpoint, no api: `Api` era la clase base de 1.x', () => {
    // Un generador que sigue escribiendo el nombre viejo enseña el framework
    // viejo. La carpeta y el sufijo son convención del CLI, no del framework.
    const file = `${modulesDir}/inventory/endpoints/inventory.endpoint.ts`;

    expect(fs.existsSync(path.join(workspace, file))).toBe(true);
    expect(read(file)).toContain('class InventoryEndpoint extends Endpoint');

    // Y la carpeta es lo único que lo dice: el manifiesto no repite el camino.
    expect(declared(`${modulesDir}/inventory/module.ts`)).not.toContain(
      'routes:',
    );
    expect(inventory.implicit).toContain('routes');
  });

  it('el endpoint que vino con el módulo responde, sin declarar grupo', async () => {
    // La plantilla NO escribe `@Group`: `/api/inventory` existe porque el
    // prefijo sale del id del módulo. Si ese default se rompe, esto es 404.
    expect(
      read(`${modulesDir}/inventory/endpoints/inventory.endpoint.ts`),
    ).not.toContain('@Group');

    // Y SIN cabeceras: el endpoint que trae el módulo no gatea nada.
    const res = await request(server()).get('/api/inventory');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('trae la aserción COMENTADA, y la clave declarada en permissions.ts', () => {
    // Las dos mitades del andamiaje tienen que coincidir: `init` escribe
    // `auth` comentado, así que un endpoint que asserta de entrada contesta
    // 500 al primer request de cualquier proyecto nuevo.
    const endpoint = read(
      `${modulesDir}/inventory/endpoints/inventory.endpoint.ts`,
    );

    expect(endpoint).toContain("// this.auth.assert('inventory.view');");
    expect(endpoint).not.toMatch(/^\s*this\.auth\.assert/m);
  });

  it('las claves se declaran en UN lugar, y el manifiesto lo referencia', () => {
    // El punto de partida: una sola línea por clave, y el resto la importa.
    expect(read(`${modulesDir}/inventory/permissions.ts`)).toContain(
      "declarePermissions('inventory', {",
    );
    const manifest = read(`${modulesDir}/inventory/module.ts`);
    expect(manifest).toContain("import { permissions } from './permissions';");
    expect(manifest).toContain('permissions,');
    // Sin segunda lista que mantener sincronizada.
    expect(manifest).not.toContain("key: 'inventory.view'");
  });

  it('el endpoint agregado después se monta con su método y su ruta', async () => {
    const res = await request(server())
      .post('/api/inventory/count')
      .set('x-perms', 'inventory.count');

    expect(res.status).toBe(200);
  });

  it('con --permission la aserción sí va viva: anónimo es 401', async () => {
    const res = await request(server()).post('/api/inventory/count');

    expect(res.status).toBe(401);
  });

  it('y con OTRO permiso es 403: hay actor, le falta la clave', async () => {
    const res = await request(server())
      .post('/api/inventory/count')
      .set('x-perms', 'inventory.view');

    expect(res.status).toBe(403);
  });

  it('--permission declara la clave donde viven, no sólo la assertea', () => {
    // Sin esto sería un 500 "Unknown permission" en vez de un 403: el
    // generador habría escrito código que no puede correr. La etiqueta es un
    // punto de partida legible, para la pantalla de roles.
    expect(read(`${modulesDir}/inventory/permissions.ts`)).toContain(
      "count: 'Count inventory',",
    );
    // El endpoint la exige como cadena, que es como se lee mejor. Lo que la
    // hace segura es el bloque que `create module` agregó acá:
    expect(
      read(`${modulesDir}/inventory/endpoints/count-items.endpoint.ts`),
    ).toContain("this.auth.assert('inventory.count');");
    expect(read('src/config/permissions.ts')).toContain(
      "typeof import('../modules/inventory/permissions').permissions",
    );
    expect(app.permissions().map((permission) => permission.key)).toEqual([
      'inventory.view',
      'inventory.count',
    ]);
  });

  it('una app SIN resolutor `auth` igual contesta: auth es opcional', async () => {
    // La regresión: `init` escribe `auth` comentado. Si el andamiaje assertara
    // de entrada, esto sería 500 — "this application resolves no actor" — en
    // el primer request de todo proyecto nuevo.
    const sinAuth = await Liteb.create({
      db,
      modules: [require(path.join(workspace, modulesDir, 'inventory/module.ts')).default],
      version: '1.0.0',
      basePath: '/api',
    });
    await sinAuth.start(0);

    try {
      const res = await request(sinAuth.getApp()).get('/api/inventory');
      expect(res.status).toBe(200);
    } finally {
      await sinAuth.close({ database: false });
    }
  });

  it('la entidad la encuentra la carpeta: el manifiesto no la lista', () => {
    // Escribir la clase es todo lo que hay que hacer. Que el manifiesto no la
    // nombre no es un olvido: `./entities/*.entity.ts` es donde liteb mira.
    const manifest = declared(`${modulesDir}/inventory/module.ts`);

    expect(manifest).not.toContain('entities:');
    expect(manifest).not.toContain('item.entity');
    expect(inventory.entities.map((entity) => (entity as Function).name)).toEqual(
      ['Item'],
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

  it('el módulo quedó registrado en el punto de entrada, sin editar a mano', () => {
    const entry = read('src/index.ts');

    expect(entry).toContain("import inventory from './modules/inventory/module';");
    expect(entry).toContain('modules: [inventory]');
  });

  it('el punto de entrada compila y expone createApp() sin arrancar nada', () => {
    // Requerirlo lo TYPECHEQUEA (ts-jest) y, como `require.main` no es él, no
    // levanta ningún servidor: por eso la plantilla separa createApp() de main().
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const entry = require(path.join(workspace, 'src/index.ts'));

    expect(typeof entry.createApp).toBe('function');
  });

  it('el contrato y su proveedor quedan enchufados, sin manifiesto', async () => {
    // Dos archivos: el token en contracts/, la clase en providers/. El
    // manifiesto no nombra ninguno y el contenedor igual lo resuelve.
    const declaredManifest = declared(`${modulesDir}/inventory/module.ts`);
    expect(declaredManifest).not.toContain('provides');

    expect(
      read(`${modulesDir}/inventory/providers/stock.provider.ts`),
    ).toContain('@Provides(Stock)');

    const container = await buildContainer([inventory], db);
    expect(container.providerOf({ id: 'inventory.stock' } as never)).toBe(
      'inventory',
    );
  });

  it('un proveedor con --slot implementa la INTERFAZ, no el token', () => {
    // Una ranura tiene dos nombres: el token es la colección y la interfaz es
    // UNA contribución. Implementar el token no compila, así que la plantilla
    // no puede confundirlos.
    const plan = createProvider({
      target: 'reports/low-stock',
      modulesDir,
      from: 'liteb',
      slot: 'product-badges',
    });
    const archivo = plan.files[0];

    expect(archivo.path).toBe(
      `${modulesDir}/reports/providers/low-stock.provider.ts`,
    );
    expect(archivo.content).toContain('@Contributes(ProductBadges)');
    expect(archivo.content).toContain(
      'extends Provider implements ProductBadge',
    );
    // Y el import trae las dos mitades, con el alias.
    expect(archivo.content).toContain(
      "import { ProductBadge, ProductBadges } from '@/<module>/slots/product-badges.slot';",
    );
    // El cuerpo es el de una contribución, no el de un contrato.
    expect(archivo.content).toContain("public readonly id = 'low-stock';");
    expect(archivo.content).not.toContain('describe()');
  });

  it('cada token público va a SU carpeta', () => {
    // contracts/, events/ y slots/ son la cara pública del módulo. liteb no
    // las globea — un token se importa por nombre — así que la carpeta existe
    // para ubicarse, y es el CLI quien la sostiene.
    expect(
      read(`${modulesDir}/inventory/events/item-added.event.ts`),
    ).toContain("event<ItemAdded>('inventory.item-added')");

    const ranura = read(`${modulesDir}/inventory/slots/labels.slot.ts`);
    // El token nombra la colección, la interfaz nombra UNA contribución.
    expect(ranura).toContain('export interface Label {');
    expect(ranura).toContain("slot<Label>('inventory.labels')");
  });

  it('rutina, oyente y migración no tocan el manifiesto', () => {
    // Cuatro generadores escribieron archivos y NINGUNO editó module.ts. Eso
    // es lo que hace que un módulo se pueda leer de un vistazo: lo que dice es
    // lo particular de este módulo, no la lista de carpetas que tienen todos.
    const manifest = declared(`${modulesDir}/inventory/module.ts`);

    expect(manifest).not.toContain('routines:');
    expect(manifest).not.toContain('listeners:');
    expect(manifest).not.toContain('migrations');

    expect(inventory.routines).toEqual(['./routines/*.routine.ts']);
    expect(inventory.listeners).toEqual(['./listeners/*.listener.ts']);
    expect(inventory.migrations.map((migration) => migration.name)).toEqual([
      expect.stringMatching(/^CreateItems\d+$/),
    ]);

    // Y ya no hay un índice de migraciones que mantener a mano.
    expect(
      fs.existsSync(
        path.join(workspace, modulesDir, 'inventory/migrations/index.ts'),
      ),
    ).toBe(false);
  });
});
