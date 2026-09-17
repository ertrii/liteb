import 'reflect-metadata';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { DataSource } from 'typeorm';
import request from 'supertest';
import { AuthResolver, collectModuleEntities, Liteb } from '../lib';
import identity from '../src/modules/identity/module';
import catalog from '../src/modules/catalog/module';
import reports from '../src/modules/reports/module';
import { closeTestDb, createTestDb } from './helpers/test-db';

/**
 * Runs the demo app under `src/` end to end.
 *
 * It exists because the previous demo had silently rotted — `@Priority` was
 * backwards so `/users/all` resolved to the `:id` route, and a `@Template`
 * endpoint could never render because nothing ever called `setTemplates`.
 * Example code nobody executes stops being an example.
 *
 * The session is replaced by a header-driven resolver: everything else —
 * migrations, routes, permissions, contracts, the transaction — is the real
 * thing.
 */
const headerAuth: AuthResolver = (req) => {
  const raw = req.headers['x-user'];
  if (!raw) return null;
  const perms = req.headers['x-perms'];
  return {
    actor: { userId: Number(raw) },
    permissions: typeof perms === 'string' ? perms.split(',') : [],
  };
};

const STAFF = ['catalog.products.view', 'catalog.products.manage'];

describe('la app de ejemplo (src/)', () => {
  let db: DataSource;
  let app: Liteb;
  const server = () => app.getApp();

  beforeAll(async () => {
    // Las entidades se pasan a mano A PROPÓSITO: `create()` solo las agrega
    // cuando recibe OPCIONES de conexión. Si le das un DataSource ya
    // construido, sus entidades son asunto tuyo — como aquí.
    db = await createTestDb(collectModuleEntities([identity, catalog, reports]));
    app = await Liteb.create({
      db,
      modules: [identity, catalog, reports],
      version: '2.0.0',
      basePath: '/api',
      auth: headerAuth,
    });
    // Igual que src/index.ts: las vistas viven dentro del módulo que las usa.
    await app.setTemplates('pug', path.join(__dirname, '../src/modules/*/views'));
    await app.start(0);
  });

  afterAll(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    await closeTestDb();
  });

  it('las migraciones de cada módulo crearon sus tablas y sembraron datos', async () => {
    const users = await db.query('select username, role from demo_users order by id');
    const products = await db.query('select name from demo_products order by id');

    expect(users).toEqual([
      { username: 'owner', role: 'owner' },
      { username: 'staff', role: 'staff' },
    ]);
    expect(products).toHaveLength(2);
  });

  it('un módulo opcional instala APAGADO: su ruta no existe', async () => {
    const res = await request(server()).get('/api/reports/summary');

    expect(res.status).toBe(404);
  });

  it('sin actor, un endpoint gateado responde 401', async () => {
    const res = await request(server()).get('/api/products');

    expect(res.status).toBe(401);
  });

  it('con actor pero sin el permiso, 403 — no 401', async () => {
    const res = await request(server())
      .get('/api/products')
      .set('x-user', '2')
      .set('x-perms', 'identity.users.view');

    expect(res.status).toBe(403);
  });

  it('con el permiso, responde', async () => {
    const res = await request(server())
      .get('/api/products')
      .set('x-user', '2')
      .set('x-perms', STAFF.join(','));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('"*" concede todo, que es lo que significa owner', async () => {
    const res = await request(server())
      .get('/api/users')
      .set('x-user', '1')
      .set('x-perms', '*');

    expect(res.status).toBe(200);
    // La contraseña no sale del proceso.
    expect(res.body[0]).not.toHaveProperty('password');
  });

  it('valida el cuerpo antes de llegar a main()', async () => {
    const res = await request(server())
      .post('/api/products')
      .set('x-user', '2')
      .set('x-perms', STAFF.join(','))
      .send({ name: '', stock: -1 });

    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('name');
    expect(res.body.errors).toHaveProperty('stock');
  });

  it('crear devuelve 201 porque el endpoint fija httpStatus', async () => {
    const res = await request(server())
      .post('/api/products')
      .set('x-user', '2')
      .set('x-perms', STAFF.join(','))
      .send({ name: 'Router 4G', stock: 5 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Router 4G', stock: 5 });
  });

  it('el restock escribe producto y movimiento en una transacción', async () => {
    const res = await request(server())
      .post('/api/products/1/restock')
      .set('x-user', '2')
      .set('x-perms', STAFF.join(','))
      .send({ quantity: 10 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, stock: 22 });

    const moves = await db.query(
      'select "productId", quantity, "userId" from demo_stock_moves',
    );
    expect(moves).toEqual([{ productId: 1, quantity: 10, userId: 2 }]);
  });

  it('si la transacción falla, no deja media escritura', async () => {
    const antes = await db.query('select count(*) as n from demo_stock_moves');

    const res = await request(server())
      .post('/api/products/9999/restock')
      .set('x-user', '2')
      .set('x-perms', STAFF.join(','))
      .send({ quantity: 10 });

    expect(res.status).toBe(404);
    const despues = await db.query('select count(*) as n from demo_stock_moves');
    expect(despues).toEqual(antes);
  });

  it('@Priority(1) registra /page ANTES que /:id', async () => {
    // Al revés, ':id' se comería la ruta y el DTO daría 422 sobre "page".
    const res = await request(server())
      .get('/api/products/page')
      .set('x-user', '2')
      .set('x-perms', STAFF.join(','));

    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('Antenna 5GHz');
  });

  it('un id no numérico lo frena el DTO, antes de main()', async () => {
    const res = await request(server())
      .get('/api/products/abc')
      .set('x-user', '2')
      .set('x-perms', STAFF.join(','));

    expect(res.status).toBe(422);
  });

  it('un id inexistente es 404 lanzado desde main()', async () => {
    const res = await request(server())
      .get('/api/products/9999')
      .set('x-user', '2')
      .set('x-perms', STAFF.join(','));

    expect(res.status).toBe(404);
  });
});
