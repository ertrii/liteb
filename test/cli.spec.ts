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
      /liteb endpoint <module>\/<name>/,
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
        arrayEntry: {
          field: 'entities',
          value: 'Product',
          importLine: 'import x',
        },
      }),
    ).toBeNull();
  });

  it('agrega al arreglo y trae su import', () => {
    const source =
      "import { defineModule } from 'liteb';\n\nexport default defineModule({\n  entities: [],\n});\n";
    const after = applyEdit(source, {
      path: 'x',
      arrayEntry: {
        field: 'entities',
        value: 'Product',
        importLine: "import { Product } from './entities/product.entity';",
      },
    });

    expect(after).toContain('entities: [Product]');
    expect(after).toContain(
      "import { Product } from './entities/product.entity';",
    );
  });

  it('no rompe un arreglo que prettier ya partió en varias líneas', () => {
    // Prettier agrega una coma final al envolver un arreglo, y agregar detrás
    // de ella producía `'a',, 'b'`: el generador rompiendo un archivo que él
    // mismo había escrito.
    const source = `export default defineModule({
  permissions: [
    'inventory.view',
    'inventory.count',
  ],
});
`;

    const after = applyEdit(source, {
      path: 'x',
      arrayEntry: {
        field: 'permissions',
        value: "'inventory.export'",
        unless: "'inventory.export'",
      },
    })!;

    expect(after).not.toContain(',,');
    expect(after).toContain("'inventory.count', 'inventory.export'");
  });

  it('no duplica una entrada que ya está', () => {
    const source = `export default defineModule({
  permissions: ['a.view'],
});
`;
    const after = applyEdit(source, {
      path: 'x',
      arrayEntry: {
        field: 'permissions',
        value: "'a.view'",
        unless: "'a.view'",
      },
    });

    expect(after).toBe(source);
  });

  it('no vuelve a agregar un bloque que ya está, aunque lo hayan reformateado', () => {
    // El caso real: prettier del proyecto del consumidor reenvuelve la línea y
    // puede cambiar las comillas. Comparar el bloque entero, verbatim, hacía que
    // la segunda corrida apendara una copia de lo que ya estaba.
    const bloque = createModule({
      name: 'tasks',
      modulesDir: 'src/modules',
      from: 'liteb',
    }).edits.find((edit) => edit.path === 'src/config/permissions.ts')!;

    const base = `import type { PermissionsOf } from 'liteb';
`;
    const unaVez = applyEdit(base, bloque)!;

    // Tal cual: lo reconoce.
    expect(applyEdit(unaVez, bloque)).toBe(unaVez);

    // Reformateado — comillas dobles y otro corte de línea — también.
    const reformateado = unaVez
      .replace("'../modules/tasks/module'", '"../modules/tasks/module"')
      .replace(
        `interface Permissions
      extends`,
        'interface Permissions extends',
      );
    expect(reformateado).not.toBe(unaVez);
    expect(applyEdit(reformateado, bloque)).toBe(reformateado);

    // Reindentado a mano, igual.
    const aMano = unaVez.replace(
      '  namespace LitebAuth {',
      '    namespace LitebAuth {',
    );
    expect(applyEdit(aMano, bloque)).toBe(aMano);
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
      '.gitattributes',
      '.editorconfig',
      '.prettierrc',
      '.prettierignore',
      'eslint.config.mjs',
      '.vscode/settings.json',
      '.vscode/extensions.json',
      '.env',
      '.env.template',
      'src/index.ts',
      'src/config/permissions.ts',
      'src/config/auth.ts',
    ]);
  });

  it('el formato del documento queda decidido, no a criterio de cada editor', () => {
    const archivos = createProject({ name: 'mi-app', litebVersion }).files;
    const busca = (ruta: string) =>
      archivos.find((file) => file.path === ruta)!.content;

    // Los cuatro dicen lo mismo, cada uno a un lector distinto: el editor que
    // no corre nada, Prettier, el linter y git.
    expect(busca('.editorconfig')).toContain('end_of_line = lf');
    expect(busca('.editorconfig')).toContain('max_line_length = 80');
    expect(busca('.prettierrc')).toContain('"endOfLine": "lf"');
    expect(busca('.prettierrc')).toContain('"printWidth": 80');
    // Sin esto, git en Windows saca CRLF mientras los otros dos piden LF, y el
    // formateador quiere reescribir la mitad del repo.
    expect(busca('.gitattributes')).toContain('* text=auto eol=lf');

    // Flat config: `.eslintrc` se eliminó en ESLint 10.
    const eslint = busca('eslint.config.mjs');
    expect(eslint).toContain("from 'eslint/config'");
    // Prettier NO corre como regla de ESLint, que es lo que Prettier mismo
    // recomienda: sólo se apagan las reglas que discutirían con él.
    expect(eslint).toContain("from 'eslint-config-prettier/flat'");
    expect(eslint).not.toContain('eslint-plugin-prettier');
    expect(eslint).not.toContain('prettier/prettier');

    // Las dos reglas que el andamiaje necesita para lintear su propia salida.
    expect(eslint).toContain('allowDeclarations: true');
    expect(eslint).toContain("allowInterfaces: 'with-single-extends'");
    // Y la que justifica pagar información de tipos.
    expect(eslint).toContain('no-floating-promises');

    const pkg = JSON.parse(busca('package.json'));
    expect(pkg.scripts).toMatchObject({
      lint: 'eslint .',
      'lint:fix': 'eslint . --fix',
      format: 'prettier --write .',
      'format:check': 'prettier --check .',
    });
    // Node 20 llegó a fin de vida en abril de 2026; 22 es la línea más vieja que
    // todavía recibe seguridad.
    expect(pkg.engines.node).toBe('>=22.13');
    [
      'eslint',
      '@eslint/js',
      'typescript-eslint',
      'eslint-config-prettier',
      'prettier',
    ].forEach((dep) => expect(pkg.devDependencies).toHaveProperty(dep));
  });

  it('el archivo de permisos ya no necesita ningún eslint-disable', () => {
    // La regla queda CONFIGURADA para el caso (`no-empty-object-type` con
    // `with-single-extends`), que es mejor que apagarla: un `{}` de verdad
    // sigue reportándose.
    const permisos = createProject({ name: 'mi-app', litebVersion }).files.find(
      (file) => file.path === 'src/config/permissions.ts',
    )!.content;

    expect(permisos).not.toContain('eslint-disable');
  });

  it('permisos y auth quedan ESCRITOS, no comentados', () => {
    // El pedido es que no haya que configurar nada para empezar: el bloque de
    // permisos existe desde el primer día —`create module` le agrega uno por
    // módulo y el merge de interfaces los junta— y hay un resolutor de verdad
    // enchufado en el index.
    const archivos = createProject({ name: 'mi-app', litebVersion }).files;
    const busca = (ruta: string) =>
      archivos.find((file) => file.path === ruta)!.content;

    const permisos = busca('src/config/permissions.ts');
    expect(permisos).toContain('declare global {');
    expect(permisos).toContain(
      'interface Permissions extends PermissionsOf<unknown> {}',
    );

    const auth = busca('src/config/auth.ts');
    // Deja pasar a todos, y lo dice en voz alta una vez.
    expect(auth).toContain("permissions: ['*']");
    expect(auth).toContain('Logger.warn(');

    const index = busca('src/index.ts');
    expect(index).toContain("import auth from './config/auth';");
    expect(index).toMatch(/^\s*auth,$/m);
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

    // Los tres quedan encendidos: un proyecto recién creado tiene que poder
    // contestar un probe, mostrar su API y dejar el mapa de rutas sin que
    // nadie descubra una opción antes.
    //
    // Salud: un 200/503 sin credenciales, que es lo que lee un balanceador.
    expect(index).toContain("health: { path: '/health' }");
    // Documentación viva, generada de los mismos decoradores que montan.
    expect(index).toContain("path: '/docs'");
    // Archivos de log en `logs/`, con `router.log` adentro.
    expect(index).toContain("logs: { dir: 'logs' }");
    // Nada condicionado al entorno: apagarlos es una decisión que se toma
    // mirando el archivo, no una que venga tomada de fábrica.
    expect(index).not.toContain("=== 'production'");

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

    // Y el alias: sin el require de ts-node, `npm run dev` muere en el primer
    // import que lo use.
    // Relativo y sin `baseUrl`: TS 6 lo marca deprecado y TS 7 lo quita, así
    // que un `paths` va relativo al propio tsconfig.
    expect(tsconfig.content).toContain(
      '"paths": { "@/*": ["./src/modules/*"] }',
    );
    expect(tsconfig.content).not.toContain('"baseUrl"');
    expect(tsconfig.content).toContain(
      '"ts-node": { "require": ["tsconfig-paths/register"] }',
    );
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

  /** Reemplaza el andamiaje por una migración de verdad, como haría un autor. */
  const escribirMigracion = () => {
    const carpeta = path.join(workspace, modulesDir, 'inventory/migrations');
    const archivo = fs
      .readdirSync(carpeta)
      .find((name) => name.endsWith('-create-items.ts')) as string;
    const ruta = path.join(carpeta, archivo);

    // Escribe el SQL y saca el freno: todo lo que hay desde el comentario que
    // lo anuncia hasta el cierre del throw.
    const lineas = fs.readFileSync(ruta, 'utf8').split('\n');
    const desde = lineas.findIndex((line) =>
      line.includes('Delete this once the SQL above is written'),
    );
    const hasta = lineas.findIndex(
      (line, i) => i > desde && line.trim() === ');',
    );
    lineas.splice(desde - 1, hasta - desde + 2);

    fs.writeFileSync(
      ruta,
      lineas
        .join('\n')
        .replace(
          '      -- what this migration creates',
          '      create table inv_items (id serial primary key)',
        )
        .replace('      -- how to undo it', '      drop table inv_items'),
    );
  };

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
    scaffold(
      createEntity({ target: 'inventory/item', modulesDir, from: 'liteb' }),
    );
    scaffold(
      createEndpoint({
        target: 'inventory/ping',
        modulesDir,
        from: 'liteb',
        path: 'ping',
        // `--public`: sin aserción, para los pocos que de verdad lo son.
        permission: false,
      }),
    );
    scaffold(
      createRoutine({ target: 'inventory/nightly', modulesDir, from: 'liteb' }),
    );
    scaffold(
      createListener({ target: 'inventory/audit', modulesDir, from: 'liteb' }),
    );
    scaffold(
      createMigration({
        target: 'inventory/create-items',
        modulesDir,
        from: 'liteb',
      }),
    );
    // Lo que hace un autor a continuación: escribir el SQL y sacar el freno.
    // Sin eso el andamiaje se niega a correr, a propósito — una migración
    // vacía se anotaría como aplicada y lo que se escribiera después no
    // correría nunca.
    escribirMigracion();
    scaffold(
      createContract({ target: 'inventory/stock', modulesDir, from: 'liteb' }),
    );
    scaffold(
      createProvider({ target: 'inventory/stock', modulesDir, from: 'liteb' }),
    );
    scaffold(
      createEvent({
        target: 'inventory/item-added',
        modulesDir,
        from: 'liteb',
      }),
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
    // Sin `label`: el andamiaje no inventa una etiqueta que repita la clave.
    // Escribirla es opcional y queda para donde la clave no alcanza.
    expect(app.permissions()).toEqual([
      { key: 'inventory.view', moduleId: 'inventory' },
      // La segunda la declaró `endpoint --permission`.
      { key: 'inventory.count', moduleId: 'inventory' },
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

    // Con la clave que el módulo declara: el andamiaje gatea de entrada.
    const res = await request(server())
      .get('/api/inventory')
      .set('x-perms', 'inventory.view');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('y sin ella no responde: la puerta está puesta, no de adorno', async () => {
    expect((await request(server()).get('/api/inventory')).status).toBe(401);
  });

  it('trae la aserción VIVA, con la clave que declara el manifiesto', () => {
    // Las dos mitades del andamiaje coinciden: `init` escribe un resolutor que
    // deja pasar a todos, así que la aserción puede nacer encendida. Al revés
    // —comentada— enseña que un endpoint es abierto por defecto, y el día que
    // alguien escriba autenticación de verdad todos los ya escritos siguen
    // abiertos.
    const endpoint = read(
      `${modulesDir}/inventory/endpoints/inventory.endpoint.ts`,
    );

    expect(endpoint).toMatch(/^\s*this\.auth\.assert\('inventory\.view'\);/m);
    expect(endpoint).not.toContain('// this.auth.assert(');
  });

  it('las claves se declaran en UN lugar: el manifiesto', () => {
    // El punto de partida: la clave escrita una vez, donde el módulo se
    // declara. No hay un permissions.ts por módulo que mantener al lado.
    expect(
      fs.existsSync(
        path.join(workspace, `${modulesDir}/inventory/permissions.ts`),
      ),
    ).toBe(false);

    const manifest = read(`${modulesDir}/inventory/module.ts`);
    expect(manifest).toContain("permissions: ['inventory.view'");
    // Y `config/permissions.ts` las LEE del manifiesto, no las repite.
    expect(read('src/config/permissions.ts')).toContain(
      "typeof import('../modules/inventory/module').default",
    );
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
    // generador habría escrito código que no puede correr.
    expect(read(`${modulesDir}/inventory/module.ts`)).toContain(
      "'inventory.count'",
    );
    // El endpoint la exige como cadena, que es como se lee mejor. Lo que la
    // hace segura es el bloque que `create module` agregó acá:
    expect(
      read(`${modulesDir}/inventory/endpoints/count-items.endpoint.ts`),
    ).toContain("this.auth.assert('inventory.count');");
    expect(read('src/config/permissions.ts')).toContain(
      "typeof import('../modules/inventory/module').default",
    );
    expect(app.permissions().map((permission) => permission.key)).toEqual([
      'inventory.view',
      'inventory.count',
    ]);
  });

  it('un endpoint --public contesta sin resolutor: auth sigue siendo opcional', async () => {
    // El framework no exige `auth`: un endpoint que nunca toca `this.auth` no
    // necesita a nadie que resuelva. Lo que cambió es el andamiaje, no la
    // regla — y `--public` es cómo se pide un endpoint que de verdad lo es.
    const abierto = read(`${modulesDir}/inventory/endpoints/ping.endpoint.ts`);
    expect(abierto).not.toContain('this.auth');

    const sinAuth = await Liteb.create({
      db,
      modules: [
        require(path.join(workspace, modulesDir, 'inventory/module.ts'))
          .default,
      ],
      version: '1.0.0',
      basePath: '/api',
    });
    await sinAuth.start(0);

    try {
      const res = await request(sinAuth.getApp()).get('/api/inventory/ping');
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
    expect(
      inventory.entities.map((entity) => (entity as Function).name),
    ).toEqual(['Item']);
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

    expect(entry).toContain(
      "import inventory from './modules/inventory/module';",
    );
    expect(entry).toContain('modules: [inventory]');
  });

  it('el punto de entrada compila y expone createApp() sin arrancar nada', () => {
    // Requerirlo lo TYPECHEQUEA (ts-jest) y, como `require.main` no es él, no
    // levanta ningún servidor: por eso la plantilla separa createApp() de main().
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
