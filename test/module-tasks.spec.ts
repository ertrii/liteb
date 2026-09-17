import path from 'path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { DataSource } from 'typeorm';
import Liteb from '../lib/core/liteb';
import { defineModule } from '../lib/modules/define-module';
import { ModuleStore } from '../lib/modules/module-store';
import { beats } from './fixtures/modules/heartbeat/tasks/beat.task';
import { closeTestDb, createTestDb } from './helpers/test-db';

const heartbeatDir = path.join(__dirname, 'fixtures/modules/heartbeat');

const heartbeat = (core: boolean) =>
  defineModule({
    id: 'heartbeat',
    version: '1.0.0',
    core,
    dir: heartbeatDir,
    tasks: './tasks/*.task.ts',
  });

/** Espera a que se cumpla una condición, sin dormir a ciegas. */
async function waitFor(
  condition: () => boolean,
  timeoutMs = 4000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return condition();
}

describe('tareas de los módulos', () => {
  let db: DataSource;
  let app: Liteb | undefined;

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    app = undefined;
    await closeTestDb();
    beats.count = 0;
    beats.sawDb = false;
    beats.sawContainer = false;
  });

  it('arranca la tarea de un módulo habilitado', async () => {
    db = await createTestDb();
    app = await Liteb.create({
      db: db,
      modules: [heartbeat(true)],
      version: '2.0.0-dev.0',
    });
    await app.start(0);

    expect(await waitFor(() => beats.count > 0)).toBe(true);
  });

  it('le inyecta db y contenedor, como a un endpoint', async () => {
    db = await createTestDb();
    app = await Liteb.create({
      db: db,
      modules: [heartbeat(true)],
      version: '2.0.0-dev.0',
    });
    await app.start(0);

    await waitFor(() => beats.count > 0);

    expect(beats.sawDb).toBe(true);
    expect(beats.sawContainer).toBe(true);
  });

  it('NO arranca la tarea de un módulo apagado', async () => {
    db = await createTestDb();
    app = await Liteb.create({
      db: db,
      modules: [heartbeat(false)],
      version: '2.0.0-dev.0',
    });
    await app.start(0);

    // Un módulo apagado no puede dejar un cron corriendo.
    const corrio = await waitFor(() => beats.count > 0, 1800);
    expect(corrio).toBe(false);
  });

  it('una vez encendido, su tarea sí corre', async () => {
    db = await createTestDb();

    app = await Liteb.create({
      db: db,
      modules: [heartbeat(false)],
      version: '2.0.0-dev.0',
    });
    await app.start(0);
    await new ModuleStore(db).enable('heartbeat');
    await app.close({ database: false });

    app = await Liteb.create({
      db: db,
      modules: [heartbeat(false)],
      version: '2.0.0-dev.0',
    });
    await app.start(0);

    expect(await waitFor(() => beats.count > 0)).toBe(true);
  });

  it('cerrar la aplicación detiene la tarea', async () => {
    db = await createTestDb();
    app = await Liteb.create({
      db: db,
      modules: [heartbeat(true)],
      version: '2.0.0-dev.0',
    });
    await app.start(0);

    await waitFor(() => beats.count > 0);
    await app.close({ database: false });

    const tras = beats.count;
    await new Promise((resolve) => setTimeout(resolve, 1600));

    expect(beats.count).toBe(tras);
  });
});
