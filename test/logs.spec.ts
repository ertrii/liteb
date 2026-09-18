import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { defineModule, Liteb, Logger } from '../lib';
import { closeTestDb, createTestDb } from './helpers/test-db';

/**
 * `router.log` es el mapa de qué contesta dónde, en orden de registro.
 *
 * Es la respuesta más rápida a "por qué mi ruta da 404", que es la pregunta
 * que más veces se hace alguien que recién llega: una carpeta mal nombrada o
 * un grupo repetido se ven de un vistazo ahí y de ninguna otra manera.
 */
describe('archivos de log', () => {
  let db: DataSource;
  let app: Liteb | undefined;
  let dir: string;

  const site = defineModule({
    id: 'site',
    version: '1.0.0',
    core: true,
    dir: path.join(__dirname, 'fixtures/modules/site'),
  });

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    app = undefined;
    await closeTestDb();
    // Volver a consola, o el resto de la suite escribiría en el temporal.
    Logger.configure({ level: 'off' });
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('crea la carpeta y deja el mapa de rutas', async () => {
    dir = path.join(os.tmpdir(), `liteb-logs-${Date.now()}`);
    expect(fs.existsSync(dir)).toBe(false);

    db = await createTestDb();
    app = await Liteb.create({
      db,
      modules: [site],
      version: '2.0.0',
      basePath: '/api',
      // La suite silencia el logger (test/setup.ts); acá hay que volver a
      // encenderlo, que es justamente lo que se está probando.
      logs: { dir, level: 'trace' },
    });
    await app.start(0);

    expect(fs.existsSync(dir)).toBe(true);

    // El appender escribe asíncrono: sin esperar el vaciado, el archivo se
    // lee vacío. Es la misma razón por la que `shutdown()` lo espera antes de
    // salir del proceso.
    await Logger.flush();

    const mapa = fs.readFileSync(path.join(dir, 'router.log'), 'utf8');
    expect(mapa).toContain('registration order; the first match answers');
    // Verbo, ruta completa y la clase que responde: lo que hace falta para
    // entender un 404 sin adivinar.
    expect(mapa).toMatch(/GET\s+\/api\/tienda\/items\s+\(ItemsEndpoint\)/);
  });

  it('sin dir no toca el disco: es lo que quiere un contenedor', async () => {
    dir = path.join(os.tmpdir(), `liteb-logs-${Date.now()}-off`);

    db = await createTestDb();
    app = await Liteb.create({ db, modules: [site], version: '2.0.0' });
    await app.start(0);

    expect(fs.existsSync(dir)).toBe(false);
  });
});
