import 'reflect-metadata';
import http from 'http';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { defineModule, Liteb } from '../lib';
import { ErrorIdentifier } from '../lib/interfaces/type-error';
import { closeTestDb, createTestDb } from './helpers/test-db';

/**
 * The fixtures mounted as what they would be in a real app: a module. Since
 * `setApis` went away there is no other way in, which is the point — these
 * tests now exercise the same path consumers do, `_modules` ledger included.
 */
const fixtures = defineModule({
  id: 'fixtures',
  version: '1.0.0',
  core: true,
  dir: path.join(__dirname, 'fixtures'),
  routes: './*.api.ts',
});

let liteb: Liteb;
const app = () => liteb.getApp();

/** Access the internal (protected) `http.Server` to learn the ephemeral port. */
const internalServer = () =>
  (liteb as unknown as { server: http.Server }).server;

/**
 * Request with an arbitrary verb. Needed for QUERY: supertest's `.query()` is
 * superagent's query-string setter, not the HTTP method, so that verb cannot be
 * emitted with supertest.
 */
const rawRequest = (method: string, pathname: string, body?: unknown) =>
  new Promise<{ status: number; body: any }>((resolve, reject) => {
    const { port } = internalServer().address() as { port: number };
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: payload
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
            }
          : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode as number,
            body: raw ? JSON.parse(raw) : null,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(payload);
  });

beforeAll(async () => {
  const db = await createTestDb();
  liteb = await Liteb.create({
    db,
    modules: [fixtures],
    version: '2.0.0-dev.0',
  });
  // Port 0 = ephemeral, so it doesn't clash with anything on the machine.
  await liteb.start(0);
});

afterAll(async () => {
  // `shutdown()` calls process.exit and would kill jest: close by hand.
  await liteb.close({ database: false }).catch(() => undefined);
  await closeTestDb();
});

describe('ruteo', () => {
  it('registra la ruta componiendo basePath + @Module + @Get', async () => {
    const res = await request(app()).get('/api/saludo/hola');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, msg: 'ruta viva' });
  });

  it('responde 404 con el contrato de error del framework', async () => {
    const res = await request(app()).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
    expect(res.body).toMatchObject({
      identifier: ErrorIdentifier.NOT_FOUND,
      message: 'Cannot GET /api/no-existe',
    });
  });
});

describe('validación de esquema', () => {
  it('rechaza un body inválido con 422 y detalle por campo', async () => {
    const res = await request(app()).post('/api/clientes').send({ name: 123 });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ type: ErrorIdentifier.SCHEMA });
    expect(res.body.errors).toHaveProperty('name');
  });

  it('acepta un body válido', async () => {
    const res = await request(app())
      .post('/api/clientes')
      .send({ name: 'Erick' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 'Erick' });
  });
});

describe('errores de dominio', () => {
  it('mapea un NotFoundError lanzado en main() a 404', async () => {
    const res = await request(app()).post('/api/clientes/falla');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      message: 'cliente no existe',
      identifier: ErrorIdentifier.NOT_FOUND,
    });
  });
});

describe('método HTTP QUERY', () => {
  it('rutea un endpoint QUERY y recibe los criterios en el cuerpo', async () => {
    const res = await rawRequest('QUERY', '/api/busqueda/clientes', {
      termino: 'erick',
      ciudad: 'California',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ buscado: 'erick', ciudad: 'California' });
  });

  it('valida el cuerpo del QUERY con @Body', async () => {
    const res = await rawRequest('QUERY', '/api/busqueda/clientes', {
      ciudad: 'California',
    });

    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('termino');
  });
});

describe('aislamiento de estado por petición', () => {
  // Regression: request state was assigned on the prototype, so two concurrent
  // requests to the SAME endpoint overwrote each other and both ended up seeing
  // the last one's data.
  it('dos peticiones concurrentes no se pisan el query', async () => {
    const lenta = request(app()).get('/api/eco').query({ value: 'a', delay: '60' });
    const rapida = request(app()).get('/api/eco').query({ value: 'b', delay: '0' });

    const [resA, resB] = await Promise.all([lenta, rapida]);

    expect(resA.body).toEqual({ value: 'a' });
    expect(resB.body).toEqual({ value: 'b' });
  });
});
