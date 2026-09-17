import 'reflect-metadata';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { DataSource } from 'typeorm';
import request from 'supertest';
import {
  defineModule,
  event,
  EventBus,
  Liteb,
  Listener,
  ModuleStore,
  On,
} from '../lib';
import { closeTestDb, createTestDb } from './helpers/test-db';
import { Registrado, visto } from './fixtures/events/shared';

const fakeDb = {} as DataSource;

describe('EventBus (sin servidor)', () => {
  interface Hecho {
    n: number;
  }
  const Hecho = event<Hecho>('demo.hecho');

  it('un evento que nadie escucha no es un error', async () => {
    const bus = new EventBus(fakeDb);

    await expect(bus.emit(Hecho, { n: 1 })).resolves.toBeUndefined();
    expect(bus.countFor(Hecho)).toBe(0);
  });

  it('entrega la carga a cada oyente', async () => {
    const recibido: number[] = [];

    @On(Hecho)
    class Uno extends Listener<Hecho> {
      on(p: Hecho) {
        recibido.push(p.n * 10);
      }
    }
    @On(Hecho)
    class Dos extends Listener<Hecho> {
      async on(p: Hecho) {
        recibido.push(p.n * 100);
      }
    }

    const bus = new EventBus(fakeDb);
    bus.register(Hecho, Uno, 'a');
    bus.register(Hecho, Dos, 'b');

    await bus.emit(Hecho, { n: 3 });

    expect(recibido.sort((x, y) => x - y)).toEqual([30, 300]);
  });

  it('un oyente que falla NO rompe al emisor ni a los demás', async () => {
    // La invariante que separa un evento de una llamada: "esto pasó", no
    // "hacé esto por mí". Si al emisor le importa el resultado, quiere un
    // contrato.
    const recibido: number[] = [];

    @On(Hecho)
    class Roto extends Listener<Hecho> {
      on() {
        throw new Error('revienta');
      }
    }
    @On(Hecho)
    class Sano extends Listener<Hecho> {
      on(p: Hecho) {
        recibido.push(p.n);
      }
    }

    const bus = new EventBus(fakeDb);
    bus.register(Hecho, Roto, 'roto');
    bus.register(Hecho, Sano, 'sano');

    await expect(bus.emit(Hecho, { n: 5 })).resolves.toBeUndefined();
    expect(recibido).toEqual([5]);
  });

  it('le inyecta db al oyente, como a un endpoint', async () => {
    let visto: unknown = null;

    @On(Hecho)
    class MiraDb extends Listener<Hecho> {
      on() {
        visto = this.db;
      }
    }

    const bus = new EventBus(fakeDb);
    bus.register(Hecho, MiraDb, 'a');
    await bus.emit(Hecho, { n: 1 });

    expect(visto).toBe(fakeDb);
  });
});

describe('eventos entre módulos', () => {
  let db: DataSource;
  let app: Liteb | undefined;

  const emisor = () =>
    defineModule({
      id: 'emisor',
      version: '1.0.0',
      core: true,
      dir: path.join(__dirname, 'fixtures/events/emisor'),
      routes: './*.api.ts',
    });

  // NO es core: instala apagado, que es justo lo que queremos probar.
  const oyente = () =>
    defineModule({
      id: 'oyente',
      version: '1.0.0',
      dir: path.join(__dirname, 'fixtures/events/oyente'),
      listeners: './*.listener.ts',
    });

  const boot = async () => {
    app = await Liteb.create({
      db,
      modules: [emisor(), oyente()],
      version: '2.0.0-dev.0',
    });
    await app.start(0);
    return app.getApp();
  };

  beforeEach(async () => {
    db = await createTestDb();
    visto.ids = [];
  });

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    app = undefined;
    await closeTestDb();
  });

  it('un módulo apagado no reacciona', async () => {
    const server = await boot();

    const res = await request(server).post('/api/demo/crear');

    // El emisor respondió igual: no sabe ni le importa quién escucha.
    expect(res.status).toBe(200);
    expect(visto.ids).toEqual([]);
  });

  it('encendido, reacciona — sin que el emisor lo importe', async () => {
    // Primer arranque: instala los módulos en `_modules`.
    await boot();
    await app?.close({ database: false });
    app = undefined;

    await new ModuleStore(db).enable('oyente');

    const server = await boot();
    const res = await request(server).post('/api/demo/crear');

    expect(res.status).toBe(200);
    expect(visto.ids).toEqual([7]);
  });
});
