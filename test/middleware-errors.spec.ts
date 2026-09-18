import 'reflect-metadata';
import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { Liteb, NotFoundError } from '../lib';
import { closeTestDb, createTestDb } from './helpers/test-db';

/**
 * Lo que lanza un MIDDLEWARE sale con el mismo contrato que un endpoint.
 *
 * Sin esto contestaba Express con su página HTML de stack: un cliente que sólo
 * conoce la forma de error de liteb recibe algo que no puede leer, y el stack
 * se va con la respuesta. El camino típico para toparse con eso es un origen
 * rechazado por CORS — por eso parecía que a liteb le faltaba CORS y en
 * realidad le faltaba esto.
 */
describe('un middleware que lanza', () => {
  let db: DataSource;
  let app: Liteb;

  const build = async (middleware: Parameters<Liteb['use']>[0]) => {
    db = await createTestDb();
    app = await Liteb.create({ db, modules: [], version: '2.0.0' });
    app.use(middleware);
    await app.start(0);
    return app.getApp();
  };

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    await closeTestDb();
  });

  it('un Error pelado es 500 con el contrato, no una página HTML', async () => {
    const server = await build((_req, _res, next) => {
      next(new Error('Not allowed by CORS'));
    });

    const res = await request(server).get('/api/lo-que-sea');

    expect(res.status).toBe(500);
    expect(res.type).toBe('application/json');
    expect(res.body).toEqual({
      message: 'Not allowed by CORS',
      response: null,
      errorFields: {},
      identifier: 'internal',
    });
    // Lo que se filtraba antes.
    expect(res.text).not.toContain('at ');
  });

  it('un error del framework conserva su estado', async () => {
    const server = await build((_req, _res, next) => {
      next(new NotFoundError('No existe'));
    });

    const res = await request(server).get('/api/lo-que-sea');

    expect(res.status).toBe(404);
    expect(res.body.identifier).toBe('not_found');
  });

  it('lanzar sincrónicamente cuenta igual', async () => {
    const server = await build(() => {
      throw new Error('explotó');
    });

    const res = await request(server).get('/api/lo-que-sea');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('explotó');
  });

  it('si ya salieron bytes, no escribe un JSON en el medio', async () => {
    const server = await build((_req, res, next) => {
      res.write('a medio enviar');
      next(new Error('tarde'));
    });

    // Express corta la conexión en vez de completar la respuesta, y ESO es lo
    // que impide pegar un error JSON detrás de lo que ya viajó. Un archivo a
    // medio descargar termina roto, que es honesto; con un JSON al final
    // terminaría corrupto y parecería completo.
    await expect(request(server).get('/api/lo-que-sea')).rejects.toThrow(
      /aborted/i,
    );
  });

  it('sin error, el 404 sigue siendo el de siempre', async () => {
    const server = await build((_req, _res, next) => next());

    const res = await request(server).get('/api/lo-que-sea');

    expect(res.status).toBe(404);
    expect(res.body.identifier).toBe('not_found');
  });
});
