import 'reflect-metadata';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import {
  Auth,
  AuthError,
  defineModule,
  ForbiddenError,
  Liteb,
} from '../lib';
import { ErrorIdentifier } from '../lib/interfaces/type-error';
import { testAuthResolver } from './fixtures/auth/actor';
import { closeTestDb, createTestDb } from './helpers/test-db';
import { Grants } from './fixtures/grants/contracts/grants.contract';

/**
 * Estas suites prueban el chequeo EN EJECUCIÓN con su propio vocabulario
 * (`billing.*`), a propósito independiente de lo que declare la app de `src/`.
 *
 * Dentro de este repo `PermissionKey` se estrecha a las claves de la demo —
 * dos aplicaciones comparten el mismo programa de TypeScript — así que el
 * ensanche va acá una sola vez, en vez de un @ts-expect-error por línea. Una
 * app de verdad sólo declara las suyas y no necesita nada de esto.
 */
type AuthSinTipar = Omit<Auth, 'assert' | 'can'> & {
  assert(...keys: string[]): void;
  can(...keys: string[]): boolean;
};

const crearAuth = (...args: ConstructorParameters<typeof Auth>): AuthSinTipar =>
  new Auth(...args) as unknown as AuthSinTipar;

const actorDe = (userId: number) => ({ userId }) as LitebAuth.Actor;

describe('Auth (sin servidor)', () => {
  it('distingue "nadie inició sesión" de "la app no configuró auth"', () => {
    // Sin resolutor es un error de programación: NO debe verse como un 401,
    // porque el cliente no puede hacer nada al respecto.
    expect(() => crearAuth(null, false).actor).toThrow(/pass `auth`/);

    // Con resolutor, que no haya actor es la respuesta legítima.
    expect(() => crearAuth(null, true).actor).toThrow(AuthError);
  });

  it('optional devuelve null en vez de lanzar', () => {
    const auth = crearAuth(null, true);

    expect(auth.optional).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('expone el actor tal como lo devolvió el resolutor', () => {
    const auth = crearAuth({ actor: actorDe(7) }, true);

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.actor.userId).toBe(7);
    expect(auth.optional).toEqual({ userId: 7 });
  });

  it('can exige TODOS los permisos dados', () => {
    const auth = crearAuth(
      { actor: actorDe(1), permissions: ['billing.view', 'billing.emit'] },
      true,
    );

    expect(auth.can('billing.view')).toBe(true);
    expect(auth.can('billing.view', 'billing.emit')).toBe(true);
    expect(auth.can('billing.view', 'billing.void')).toBe(false);
    expect(auth.can('billing.void')).toBe(false);
  });

  it('"*" concede todo', () => {
    const auth = crearAuth({ actor: actorDe(1), permissions: ['*'] }, true);

    expect(auth.can('lo.que.sea')).toBe(true);
  });

  it('un anónimo no puede nada, aunque no se le pida permiso', () => {
    const auth = crearAuth(null, true);

    expect(auth.can('billing.view')).toBe(false);
    expect(auth.permissions).toEqual([]);
  });

  it('assert separa 401 de 403', () => {
    expect(() => crearAuth(null, true).assert('billing.view')).toThrow(AuthError);

    const auth = crearAuth(
      { actor: actorDe(1), permissions: ['billing.view'] },
      true,
    );
    expect(() => auth.assert('billing.view')).not.toThrow();

    try {
      auth.assert('billing.view', 'billing.void');
      throw new Error('debió lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      // Nombra lo que falta, no lo que sobra: es lo accionable.
      expect((error as ForbiddenError).missing).toEqual(['billing.void']);
    }
  });

  it('assert sin permisos solo exige estar identificado', () => {
    expect(() => crearAuth(null, true).assert()).toThrow(AuthError);
    expect(() => crearAuth({ actor: actorDe(1) }, true).assert()).not.toThrow();
  });
});

describe('Auth (extremo a extremo)', () => {
  const fixtures = defineModule({
    id: 'secretos',
    version: '1.0.0',
    core: true,
    dir: path.join(__dirname, 'fixtures/auth'),
    routes: './*.api.ts',
    // Declarado: desde el registro de permisos, exigir una clave que ningún
    // módulo declara es un error de programación, no un 403.
    permissions: [{ key: 'secretos.ver', label: 'Ver secretos' }],
  });

  let liteb: Liteb;
  const app = () => liteb.getApp();

  beforeAll(async () => {
    const db = await createTestDb();
    liteb = await Liteb.create({
      db,
      modules: [fixtures],
      version: '2.0.0-dev.0',
      auth: testAuthResolver,
    });
    await liteb.start(0);
  });

  afterAll(async () => {
    await liteb.close({ database: false }).catch(() => undefined);
    await closeTestDb();
  });

  it('el endpoint lee el actor sin saber de dónde salió', async () => {
    const res = await request(app()).get('/api/yo/actual').set('x-user', '42');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 42 });
  });

  it('sin actor, leerlo devuelve 401 con el contrato de error del framework', async () => {
    const res = await request(app()).get('/api/yo/actual');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ identifier: ErrorIdentifier.UNAUTHORIZED });
  });

  it('un resolutor que lanza se mapea como cualquier otro error', async () => {
    const res = await request(app()).get('/api/yo/actual').set('x-user', 'roto');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      identifier: ErrorIdentifier.UNAUTHORIZED,
      message: 'Malformed credential.',
    });
  });

  it('un endpoint público atiende al anónimo', async () => {
    const res = await request(app()).get('/api/yo/publico');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ anonimo: true, actor: null });
  });

  it('permiso faltante es 403, no 401', async () => {
    const res = await request(app()).get('/api/yo/secreto').set('x-user', '42');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ identifier: ErrorIdentifier.FORBIDDEN });
  });

  it('con el permiso, pasa', async () => {
    const res = await request(app())
      .get('/api/yo/secreto')
      .set('x-user', '42')
      .set('x-perms', 'secretos.ver');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('un permiso que nadie declara es 500, no 403', async () => {
    // Un 403 mandaría a revisar roles; el 500 dice que el código está mal.
    const res = await request(app())
      .get('/api/yo/roto')
      .set('x-user', '42')
      .set('x-perms', 'secretos.ver');

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Unknown permission "secretos.vre"/);
    expect(res.body.message).toMatch(/Did you mean: secretos.ver/);
  });

  it('dos peticiones simultáneas no se pisan el actor', async () => {
    // El mismo riesgo que obligó a mover params/body/query del prototipo a la
    // instancia: si `auth` viviera en el prototipo, el segundo actor
    // sobrescribiría al primero mientras este await-ea dentro de main().
    const [uno, dos] = await Promise.all([
      request(app()).get('/api/yo/lento').set('x-user', '1'),
      request(app()).get('/api/yo/lento').set('x-user', '2'),
    ]);

    expect(uno.body).toEqual({ userId: 1 });
    expect(dos.body).toEqual({ userId: 2 });
  });
});

describe('el resolutor recibe db y contratos', () => {
  // La política de permisos vive en el módulo que la posee, y el resolutor
  // llega a ella por contrato — sin importar el módulo ni cerrar sobre un
  // DataSource global.
  const grantsModule = defineModule({
    id: 'grants',
    version: '1.0.0',
    core: true,
    // Su proveedor está en ./providers, y el token en ./contracts.
    dir: path.join(__dirname, 'fixtures/grants'),
  });

  const fixtures = defineModule({
    id: 'secretos',
    version: '1.0.0',
    core: true,
    requires: ['grants'],
    dir: path.join(__dirname, 'fixtures/auth'),
    routes: './*.api.ts',
    permissions: [{ key: 'secretos.ver', label: 'Ver secretos' }],
  });

  let liteb: Liteb;
  let visto: { db: boolean } = { db: false };

  beforeAll(async () => {
    const db = await createTestDb();
    await db.query(
      'create table permisos_demo (user_id int primary key, perms varchar)',
    );
    await db.query("insert into permisos_demo values (7, 'secretos.ver')");
    await db.query("insert into permisos_demo values (8, 'otra.cosa')");

    liteb = await Liteb.create({
      db,
      modules: [grantsModule, fixtures],
      version: '2.0.0-dev.0',
      auth: async (request, ctx) => {
        visto.db = ctx.db.isInitialized;
        const raw = request.headers['x-user'];
        if (!raw) return null;

        const permissions = await ctx.get(Grants).forUser(Number(raw));
        if (!permissions) return null;

        return { actor: { userId: Number(raw) }, permissions };
      },
    });
    await liteb.start(0);
  });

  afterAll(async () => {
    await liteb?.close({ database: false }).catch(() => undefined);
    await closeTestDb();
  });

  it('el DataSource llega vivo en el contexto', async () => {
    await request(liteb.getApp()).get('/api/yo/publico');

    expect(visto.db).toBe(true);
  });

  it('los permisos salen de la base, por contrato', async () => {
    const res = await request(liteb.getApp())
      .get('/api/yo/secreto')
      .set('x-user', '7');

    expect(res.status).toBe(200);
  });

  it('otro usuario, otros permisos: 403', async () => {
    const res = await request(liteb.getApp())
      .get('/api/yo/secreto')
      .set('x-user', '8');

    expect(res.status).toBe(403);
  });

  it('un usuario que ya no existe deja de ser actor, sin re-login', async () => {
    const res = await request(liteb.getApp())
      .get('/api/yo/actual')
      .set('x-user', '999');

    expect(res.status).toBe(401);
  });
});
