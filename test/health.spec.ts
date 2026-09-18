import 'reflect-metadata';
import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { buildHealth, Liteb } from '../lib';
import type { HealthConfig } from '../lib';
import { closeTestDb, createTestDb } from './helpers/test-db';

/**
 * El chequeo de salud es el contrato con TODO lo que corre un backend: un
 * balanceador, un runtime de contenedores, un chequeo de disponibilidad. No
 * pregunta si el proceso existe — eso ya lo sabe — sino si PUEDE atender.
 */
describe('/health', () => {
  let db: DataSource;
  let app: Liteb;

  const build = async (health: HealthConfig = {}) => {
    db = await createTestDb();
    app = await Liteb.create({
      db,
      modules: [],
      version: '3.1.0',
      health,
    });
    await app.start(0);
    return app.getApp();
  };

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    await closeTestDb();
  });

  it('con la base contestando, es 200 y dice pass', async () => {
    const server = await build();

    const res = await request(server).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pass');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('por defecto no cuenta nada más: un probe no se autentica', async () => {
    // Versión, módulos y contadores son el mapa de tu instalación para quien
    // lo encuentre. Lo mínimo es lo correcto por defecto.
    const server = await build();

    const res = await request(server).get('/health');

    expect(res.body.version).toBeUndefined();
    expect(res.body.checks).toBeUndefined();
  });

  it('con details sí, para cuando está detrás de una puerta', async () => {
    const server = await build({ details: true });

    const res = await request(server).get('/health');

    expect(res.body.version).toBe('3.1.0');
    expect(res.body.checks).toEqual({ database: 'pass' });
  });

  it('si la base no contesta es 503, no 500', async () => {
    // 503 es "ahora no puedo", que es lo que un balanceador sabe reintentar.
    const server = await build();
    await db.destroy();

    const res = await request(server).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('fail');
    expect(res.body.checks.database).toBe('fail');

    db = await createTestDb();
  });

  it('mira de verdad, no el flag: isInitialized miente tras una caída', async () => {
    const server = await build();
    // El pool recuerda que se conectó; sólo se entera cuando alguien pregunta.
    await db.destroy();

    expect((await request(server).get('/health')).status).toBe(503);

    db = await createTestDb();
  });

  it('responde donde se le diga, y sólo ahí', async () => {
    const server = await build({ path: '/healthz' });

    expect((await request(server).get('/healthz')).status).toBe(200);
    // Sin prefijo debajo: /healthz/loquesea es un typo en la URL del probe,
    // no un 200.
    expect((await request(server).get('/healthz/nada')).status).toBe(404);
  });

  it('un check propio que falla baja todo, y se dice cuál', async () => {
    // liteb sólo sabe lo suyo: el proceso y la base. Qué MÁS tiene que estar
    // arriba para que esta aplicación atienda lo sabe la aplicación.
    const server = await build({ checks: { cola: () => false } });

    const res = await request(server).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.checks).toEqual({ database: 'pass', cola: 'fail' });
  });

  it('un check que lanza es fail, no un 500', async () => {
    // Una dependencia caída se anuncia lanzando; acá la excepción es una
    // RESPUESTA, no una falla del endpoint.
    const server = await build({
      checks: {
        pagos: () => {
          throw new Error('ECONNREFUSED');
        },
      },
    });

    const res = await request(server).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.checks.pagos).toBe('fail');
  });

  it('un check colgado se corta: un probe que no contesta es peor', async () => {
    const server = await build({
      timeout: 30,
      checks: { lento: () => new Promise<boolean>(() => undefined) },
    });

    const res = await request(server).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.checks.lento).toBe('fail');
  });

  it('con todo arriba, los checks propios pasan', async () => {
    const server = await build({
      details: true,
      checks: { cola: () => true, cache: async () => true },
    });

    const res = await request(server).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual({
      database: 'pass',
      cola: 'pass',
      cache: 'pass',
    });
  });

  it('rechaza un nombre reservado al arrancar, no en el primer probe', async () => {
    // Si se dejara pasar, la respuesta de la aplicación reemplazaría en
    // silencio a la de la base y el endpoint diría pass sin haberla mirado.
    db = await createTestDb();

    await expect(
      Liteb.create({
        db,
        modules: [],
        health: { checks: { database: () => true } },
      }),
    ).rejects.toThrow(/reserves/);

    app = undefined as never;
  });

  it('sin la opción no hay endpoint', async () => {
    db = await createTestDb();
    app = await Liteb.create({ db, modules: [], version: '3.1.0' });
    await app.start(0);

    expect((await request(app.getApp()).get('/health')).status).toBe(404);
  });
});

describe('durante el apagado', () => {
  /**
   * Es la ventana que pide un balanceador: dejar de mandar tráfico ANTES de
   * que el proceso deje de aceptarlo, mientras las peticiones en vuelo
   * terminan. Probado sobre el handler para que no dependa de ganarle una
   * carrera al cierre.
   */
  const correr = async (handler: ReturnType<typeof buildHealth>) => {
    const res = {
      code: 0,
      body: null as any,
      status(code: number) {
        this.code = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    await new Promise<void>((resolve) => {
      handler({} as never, res as never, resolve as never);
      setTimeout(resolve, 20);
    });
    return res;
  };

  it('contesta 503 aunque la base siga viva', async () => {
    const db = await createTestDb();
    const handler = buildHealth(
      {},
      { db: () => db, isShuttingDown: () => true },
    );

    const res = await correr(handler);

    expect(res.code).toBe(503);
    expect(res.body.status).toBe('fail');
    expect(res.body.checks).toEqual({
      server: 'shutting-down',
      database: 'pass',
    });
    await closeTestDb();
  });
});
