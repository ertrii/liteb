/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Ships the demo app as V8 bytecode and boots it — `npm run demo:bytecode`.
 *
 * It answers one question about liteb and nothing else: can a module be
 * delivered to a machine whose owner should not read the source? Compiling and
 * packaging are NOT the framework's job — this lives under `scripts/` next to
 * the demo, not in `lib/`, and bytenode is a devDependency of the example, not
 * a dependency of liteb.
 *
 * It cannot be a jest test: jest's runtime intercepts `require`, so bytenode's
 * `Module._extensions['.jsc']` never runs and the file is parsed as text. What
 * jest covers is the glob and the preference order (`test/module-loader.spec.ts`).
 *
 * Steps: tsc -> copy what was never JavaScript -> compile every .js to .jsc and
 * delete it -> boot against an in-process Postgres and make three requests.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const lab = path.join(root, '.bytecode');
const build = path.join(lab, 'build');

const log = (message) => console.log(`\n=== ${message}`);

/** Everything that is not JavaScript stays readable: it was never bytecode. */
function copyAssets() {
  const assets = [
    ['src/modules/catalog/views', 'src/modules/catalog/views'],
    ['src/public', 'src/public'],
  ];
  for (const [from, to] of assets) {
    fs.cpSync(path.join(root, from), path.join(build, to), { recursive: true });
  }
}

/** Every .js under a directory becomes a .jsc, and the .js is deleted. */
function compile(dir, bytenode) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += compile(full, bytenode);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    bytenode.compileFile({ filename: full, output: `${full}c` });
    fs.unlinkSync(full);
    count += 1;
  }
  return count;
}

const get = (port, url, headers) =>
  new Promise((resolve, reject) => {
    http
      .get({ port, path: url, headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            type: res.headers['content-type'],
            body,
          }),
        );
      })
      .on('error', reject);
  });

async function main() {
  log('Compilando a JavaScript');
  fs.rmSync(lab, { recursive: true, force: true });
  // El compilador por su ruta, no `npx`: en Windows, spawnear un `.cmd` desde
  // Node moderno falla con EINVAL salvo que se pida una shell.
  execFileSync(
    process.execPath,
    [
      require.resolve('typescript/bin/tsc'),
      '-p',
      'tsconfig.json',
      '--outDir',
      build,
      '--incremental',
      'false',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  copyAssets();

  log('Compilando src/ a bytecode V8');
  const bytenode = require('bytenode'); // también registra la extensión .jsc
  const total = compile(path.join(build, 'src'), bytenode);
  const legibles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) legibles.push(full);
    }
  })(path.join(build, 'src'));
  console.log(`${total} archivos .jsc; .js legibles que quedaron: ${legibles.length}`);

  log('Arrancando desde el bytecode');
  require('reflect-metadata');
  const { DataSource } = require('typeorm');
  const { PGliteDriver } = require('typeorm-pglite');
  const { Liteb, Logger, collectModuleEntities } = require(path.join(build, 'lib'));

  require(path.join(build, 'src/config/session-auth')); // amplía LitebAuth.Actor
  const modules = ['identity', 'catalog', 'reports'].map(
    (id) => require(path.join(build, `src/modules/${id}/module`)).default,
  );

  Logger.configure({ dir: path.join(lab, 'logs') });
  const db = new DataSource({
    type: 'postgres',
    driver: new PGliteDriver().driver,
    database: 'bytecode_demo',
    entities: collectModuleEntities(modules),
    synchronize: false,
    logging: false,
  });
  await db.initialize();

  const app = await Liteb.create({
    db,
    modules,
    version: '2.0.0',
    basePath: '/api',
    // Por cabecera: acá se prueba la carga, no el login.
    auth: (req) =>
      req.headers['x-user']
        ? {
            actor: { userId: Number(req.headers['x-user']) },
            permissions: String(req.headers['x-perms'] || '').split(','),
          }
        : null,
  });
  await app.setTemplates('pug', path.join(build, 'src/modules/*/views'));

  const port = 4399;
  await app.start(port);

  const headers = {
    'x-user': '2',
    'x-perms': 'catalog.products.view,catalog.products.manage',
  };
  const json = await get(port, '/api/products', headers);
  const page = await get(port, '/api/products/page', headers);
  const sheet = await get(port, '/api/products/export', headers);

  log('Respuestas');
  const line = (name, res) =>
    console.log(
      `${name.padEnd(24)} ${res.status} ${String(res.type).split(';')[0].padEnd(16)} ${JSON.stringify(res.body.slice(0, 60))}`,
    );
  line('GET /api/products', json);
  line('GET /api/products/page', page);
  line('GET /api/products/export', sheet);

  await app.close();
  // log4js escribe en diferido: sin esto el mapa queda a medias.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  log('Mapa de rutas (.bytecode/logs/router.log)');
  console.log(fs.readFileSync(path.join(lab, 'logs/router.log'), 'utf8').trim());

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
