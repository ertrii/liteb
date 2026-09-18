import { describe, expect, it } from '@jest/globals';
import { DataSource } from 'typeorm';
import {
  Container,
  ContractError,
  contract,
} from '../lib/modules/container';
import { buildContainer } from '../lib/modules/build-container';
import { defineModule } from '../lib/modules/define-module';

/** El contenedor solo pasa el DataSource al construir: alcanza con un doble. */
const fakeDb = {} as DataSource;

interface Clock {
  now(): string;
}
const Clock = contract<Clock>('demo.clock');

interface Greeter {
  hello(): string;
}
const Greeter = contract<Greeter>('demo.greeter');

describe('Container', () => {
  it('resuelve una implementación construida como valor', () => {
    const container = new Container(fakeDb);
    container.register('demo', { token: Clock, value: { now: () => 'fijo' } });

    expect(container.get(Clock).now()).toBe('fijo');
  });

  it('instancia una clase y le pasa el contexto', () => {
    class RealClock implements Clock {
      constructor(private ctx: { db: DataSource }) {}
      now() {
        return this.ctx.db === fakeDb ? 'con db' : 'sin db';
      }
    }

    const container = new Container(fakeDb);
    container.register('demo', { token: Clock, use: RealClock });

    expect(container.get(Clock).now()).toBe('con db');
  });

  it('llama a la fábrica', () => {
    const container = new Container(fakeDb);
    container.register('demo', { token: Clock, factory: () => ({ now: () => 'de fábrica' }) });

    expect(container.get(Clock).now()).toBe('de fábrica');
  });

  it('construye una sola vez y reutiliza', () => {
    let veces = 0;
    const container = new Container(fakeDb);
    container.register('demo', {
      token: Clock,
      factory: () => {
        veces += 1;
        return { now: () => 'x' };
      },
    });

    container.get(Clock);
    container.get(Clock);

    expect(veces).toBe(1);
  });

  it('no construye nada hasta que se lo piden', () => {
    let construido = false;
    const container = new Container(fakeDb);
    container.register('demo', {
      token: Clock,
      factory: () => {
        construido = true;
        return { now: () => 'x' };
      },
    });

    expect(construido).toBe(false);
  });

  it('una implementación puede pedir otro contrato', () => {
    const container = new Container(fakeDb);
    container.register('a', { token: Clock, value: { now: () => '12:00' } });
    container.register('b', {
      token: Greeter,
      factory: (ctx) => ({ hello: () => `hola, son las ${ctx.get(Clock).now()}` }),
    });

    expect(container.get(Greeter).hello()).toBe('hola, son las 12:00');
  });

  it('avisa cuando nadie provee el contrato', () => {
    const container = new Container(fakeDb);

    expect(() => container.get(Clock)).toThrow(ContractError);
    expect(() => container.get(Clock)).toThrow(
      /No module provides the contract "demo.clock"/,
    );
  });

  it('rechaza dos módulos proveyendo el mismo contrato', () => {
    const container = new Container(fakeDb);
    container.register('a', { token: Clock, value: { now: () => 'a' } });

    expect(() =>
      container.register('b', { token: Clock, value: { now: () => 'b' } }),
    ).toThrow(/provided by both "a" and "b"/);
  });

  it('detecta un ciclo al CONSTRUIR, en vez de agotar la pila', () => {
    const container = new Container(fakeDb);
    // Cada fábrica resuelve la otra mientras se construye: eso sí es un ciclo.
    container.register('a', {
      token: Clock,
      factory: (ctx) => {
        ctx.get(Greeter);
        return { now: () => 'x' };
      },
    });
    container.register('b', {
      token: Greeter,
      factory: (ctx) => {
        ctx.get(Clock);
        return { hello: () => 'y' };
      },
    });

    expect(() => container.get(Clock)).toThrow(/depends on itself/);
  });

  it('dos contratos pueden referenciarse mutuamente si se resuelven al usarse', () => {
    // Referencia mutua PEREZOSA: cada método resuelve al otro recién cuando se
    // lo llama, así que ninguna construcción depende de la otra. Es válido y
    // conviene que siga siéndolo: es como dos módulos se llaman entre sí.
    const container = new Container(fakeDb);
    container.register('a', {
      token: Clock,
      factory: (ctx) => ({ now: () => `via ${ctx.get(Greeter).hello()}` }),
    });
    container.register('b', {
      token: Greeter,
      value: { hello: () => 'saludo' },
    });

    expect(container.get(Clock).now()).toBe('via saludo');
  });

  it('dice quién provee cada contrato', () => {
    const container = new Container(fakeDb);
    container.register('billing', { token: Clock, value: { now: () => 'x' } });

    expect(container.providerOf(Clock)).toBe('billing');
    expect(container.providerOf(Greeter)).toBeNull();
    expect(container.ids()).toEqual(['demo.clock']);
  });
});

describe('buildContainer', () => {
  const proveedor = defineModule({
    id: 'billing',
    version: '1.0.0',
    provides: [{ token: Clock, value: { now: () => 'desde billing' } }],
  });

  it('registra lo que proveen los módulos activos', async () => {
    const container = await buildContainer([proveedor], fakeDb);
    expect(container.get(Clock).now()).toBe('desde billing');
  });

  it('acepta un consumidor cuyo contrato existe', async () => {
    const consumidor = defineModule({
      id: 'inventory',
      version: '1.0.0',
      requires: ['billing'],
      consumes: [Clock],
    });

    await expect(buildContainer([proveedor, consumidor], fakeDb)).resolves.toBeDefined();
  });

  it('no arranca si nadie provee lo que un módulo consume', async () => {
    const solitario = defineModule({
      id: 'inventory',
      version: '1.0.0',
      consumes: [Greeter],
    });

    await expect(buildContainer([solitario], fakeDb)).rejects.toThrow(
      /consumes the contract "demo.greeter", which no enabled module provides/,
    );
  });

  it('el orden de registro no importa para validar el consumo', async () => {
    // El consumidor va primero: igual encuentra lo que provee el otro.
    const consumidor = defineModule({
      id: 'inventory',
      version: '1.0.0',
      consumes: [Clock],
    });

    await expect(buildContainer([consumidor, proveedor], fakeDb)).resolves.toBeDefined();
  });

  it('sin módulos queda vacío', async () => {
    expect((await buildContainer([], fakeDb)).ids()).toEqual([]);
  });
});
