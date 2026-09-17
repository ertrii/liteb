import path from 'path';
import request from 'supertest';
import { afterEach, describe, expect, it } from '@jest/globals';
import { DataSource } from 'typeorm';
import Liteb from '../lib/core/liteb';
import { defineModule } from '../lib/modules/define-module';
import { ModuleStore } from '../lib/modules/module-store';
import { BillingService } from './fixtures/modules/contracts';
import { closeTestDb, createTestDb } from './helpers/test-db';

const salesDir = path.join(__dirname, 'fixtures/modules/sales');

/** La implementación vive en el módulo que la publica, y solo ahí. */
class BillingServiceImpl implements BillingService {
  async emitirCargo(input: { cliente: string; monto: number }) {
    return { id: `cargo-${input.cliente}-${input.monto}` };
  }
}

const billing = () =>
  defineModule({
    id: 'billing',
    version: '1.0.0',
    core: true,
    provides: [{ token: BillingService, use: BillingServiceImpl }],
  });

const sales = () =>
  defineModule({
    id: 'sales',
    version: '1.0.0',
    core: true,
    dir: salesDir,
    requires: ['billing'],
    consumes: [BillingService],
    routes: './controllers/*.controller.ts',
  });

describe('contratos entre módulos', () => {
  let db: DataSource;
  let app: Liteb | undefined;

  afterEach(async () => {
    await app?.close({ database: false }).catch(() => undefined);
    app = undefined;
    await closeTestDb();
  });

  const boot = async (modules: ReturnType<typeof billing>[]) => {
    app = await Liteb.create({
      db: db,
      modules: modules,
      version: '2.0.0-dev.0',
    });
    await app.start(0);
    return app.getApp();
  };

  it('un módulo llama al contrato de otro sin importarlo', async () => {
    db = await createTestDb();
    const server = await boot([billing(), sales()]);

    const res = await request(server).post('/api/inventario/ventas');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ venta: 'v1', cargoId: 'cargo-c1-120' });
  });

  it('no arranca si el proveedor del contrato está apagado', async () => {
    db = await createTestDb();

    // billing deja de ser core: entra instalado pero apagado.
    const billingOpcional = defineModule({
      id: 'billing',
      version: '1.0.0',
      provides: [{ token: BillingService, use: BillingServiceImpl }],
    });

    app = await Liteb.create({
      db: db,
      modules: [billingOpcional, sales()],
      version: '2.0.0-dev.0',
    });

    // sales lo requiere, así que la falla llega antes: el grafo no resuelve.
    await expect(app.start(0)).rejects.toThrow(/requires "billing", which is disabled/);
  });

  it('no arranca si nadie provee el contrato que se consume', async () => {
    db = await createTestDb();

    // sales declara que consume, pero billing no lo provee.
    const billingMudo = defineModule({
      id: 'billing',
      version: '1.0.0',
      core: true,
    });

    app = await Liteb.create({
      db: db,
      modules: [billingMudo, sales()],
      version: '2.0.0-dev.0',
    });

    await expect(app.start(0)).rejects.toThrow(
      /consumes the contract "billing.service", which no enabled module provides/,
    );
  });

  it('el contrato queda registrado y se sabe quién lo provee', async () => {
    db = await createTestDb();
    await boot([billing(), sales()]);

    const stored = await new ModuleStore(db).list();
    expect(stored.map((m) => m.id).sort()).toEqual(['billing', 'sales']);
  });

  it('sin módulos, pedir un contrato explica qué falta', async () => {
    db = await createTestDb();
    app = await Liteb.create({ db, modules: [] });
    await app.start(0);

    // Un endpoint suelto sin contenedor: el mensaje debe decir qué hacer.
    const { Endpoint } = await import('../lib');
    class Suelto extends Endpoint {
      main() {
        return null;
      }
      probar() {
        return (this as unknown as { get: (t: unknown) => unknown }).get(
          BillingService,
        );
      }
    }

    expect(() => new Suelto().probar()).toThrow(
      /this application has no modules/,
    );
  });
});
