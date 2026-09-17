import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Auth, AuthError, ForbiddenError, Liteb } from '../lib';
import { ErrorIdentifier } from '../lib/interfaces/type-error';
import { testAuthResolver } from './fixtures/auth/actor';

const actorDe = (userId: number) => ({ userId }) as LitebAuth.Actor;

describe('Auth (sin servidor)', () => {
  it('distingue "nadie inició sesión" de "la app no configuró auth"', () => {
    // Sin resolutor es un error de programación: NO debe verse como un 401,
    // porque el cliente no puede hacer nada al respecto.
    expect(() => new Auth(null, false).actor).toThrow(/pass `auth`/);

    // Con resolutor, que no haya actor es la respuesta legítima.
    expect(() => new Auth(null, true).actor).toThrow(AuthError);
  });

  it('optional devuelve null en vez de lanzar', () => {
    const auth = new Auth(null, true);

    expect(auth.optional).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('expone el actor tal como lo devolvió el resolutor', () => {
    const auth = new Auth({ actor: actorDe(7) }, true);

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.actor.userId).toBe(7);
    expect(auth.optional).toEqual({ userId: 7 });
  });

  it('can exige TODOS los permisos dados', () => {
    const auth = new Auth(
      { actor: actorDe(1), permissions: ['billing.view', 'billing.emit'] },
      true,
    );

    expect(auth.can('billing.view')).toBe(true);
    expect(auth.can('billing.view', 'billing.emit')).toBe(true);
    expect(auth.can('billing.view', 'billing.void')).toBe(false);
    expect(auth.can('billing.void')).toBe(false);
  });

  it('"*" concede todo', () => {
    const auth = new Auth({ actor: actorDe(1), permissions: ['*'] }, true);

    expect(auth.can('lo.que.sea')).toBe(true);
  });

  it('un anónimo no puede nada, aunque no se le pida permiso', () => {
    const auth = new Auth(null, true);

    expect(auth.can('billing.view')).toBe(false);
    expect(auth.permissions).toEqual([]);
  });

  it('assert separa 401 de 403', () => {
    expect(() => new Auth(null, true).assert('billing.view')).toThrow(AuthError);

    const auth = new Auth(
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
    expect(() => new Auth(null, true).assert()).toThrow(AuthError);
    expect(() => new Auth({ actor: actorDe(1) }, true).assert()).not.toThrow();
  });
});

describe('Auth (extremo a extremo)', () => {
  const fakeDataSource = {
    initialize: async () => undefined,
    isInitialized: false,
    destroy: async () => undefined,
  } as unknown as DataSource;

  const liteb = new Liteb(fakeDataSource);
  const app = () => liteb.getApp();

  beforeAll(async () => {
    liteb.setAuth(testAuthResolver);
    liteb.setApis('/api', ['./test/fixtures/auth/*.api.ts']);
    await liteb.start(0);
  });

  afterAll(async () => {
    const server = (
      liteb as unknown as { server?: { close: (cb: () => void) => void } }
    ).server;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
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

describe('Liteb.create({ auth })', () => {
  let app: Liteb | undefined;

  afterAll(async () => {
    await app?.close({ database: false }).catch(() => undefined);
  });

  it('la opción auth llega a los endpoints igual que setAuth', async () => {
    // `Object.create(DataSource.prototype)` para que pase el `instanceof` de
    // create() sin levantar una base: esta prueba es del cableado, no del ORM.
    const db = Object.assign(Object.create(DataSource.prototype), {
      initialize: async () => undefined,
      isInitialized: false,
      destroy: async () => undefined,
    }) as DataSource;

    app = await Liteb.create({ db, auth: testAuthResolver });
    app.setApis('/api', ['./test/fixtures/auth/whoami.api.ts']);
    await app.start(0);

    const res = await request(app.getApp())
      .get('/api/yo/actual')
      .set('x-user', '9');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 9 });
  });
});
