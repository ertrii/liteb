import 'reflect-metadata';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { buildContainer, Container, contract, defineModule, Provider } from '../lib';
import { PaymentMethod, PaymentMethods } from './fixtures/pagos/shared';

const fakeDb = {} as DataSource;
const pagos = (nombre: string) => path.join(__dirname, 'fixtures/pagos', nombre);

describe('ranuras de extensión', () => {
  it('una ranura que nadie llenó devuelve vacío, no falla', async () => {
    // Es una función que nadie instaló, no un error.
    const billing = defineModule({ id: 'billing', version: '1.0.0' });
    const container = await buildContainer([billing], fakeDb);

    expect(container.all(PaymentMethods)).toEqual([]);
    expect(container.countFor(PaymentMethods)).toBe(0);
  });

  it('acepta VARIAS: en eso se diferencia de un contrato', async () => {
    const efectivo = defineModule({
      id: 'cash',
      version: '1.0.0',
      dir: pagos('efectivo'),
    });
    const banco = defineModule({
      id: 'bank',
      version: '1.0.0',
      dir: pagos('banco'),
    });

    const container = await buildContainer([efectivo, banco], fakeDb);

    // El orden es el de los módulos, que para entonces es orden de
    // dependencias: estable entre arranques.
    expect(container.all(PaymentMethods).map((m) => m.id)).toEqual([
      'cash',
      'bank',
    ]);
  });

  it('un módulo apagado no aporta: buildContainer solo ve los activos', async () => {
    // Apagar la extensión retira lo que agregó.
    const efectivo = defineModule({
      id: 'cash',
      version: '1.0.0',
      dir: pagos('efectivo'),
    });

    expect((await buildContainer([], fakeDb)).all(PaymentMethods)).toEqual([]);
    expect(
      (await buildContainer([efectivo], fakeDb)).all(PaymentMethods),
    ).toHaveLength(1);
  });

  it('una contribución resuelve contratos como cualquier proveedor', () => {
    const Tasa = contract<{ valor: number }>('fx.rate');

    class TasaProvider extends Provider {
      public readonly valor = 3.7;
    }
    class EnDolares extends Provider implements PaymentMethod {
      public readonly id = 'usd';
      public readonly label = `Dólares a ${this.get(Tasa).valor}`;
    }

    const container = new Container(fakeDb);
    container.register('fx', Tasa, TasaProvider);
    container.contribute('pay', PaymentMethods, EnDolares);

    expect(container.all(PaymentMethods)[0].label).toBe('Dólares a 3.7');
  });

  it('se construye una sola vez y se cachea', () => {
    let veces = 0;
    class Contada extends Provider implements PaymentMethod {
      public readonly id = 'x';
      public readonly label = 'X';
      constructor() {
        super();
        veces += 1;
      }
    }

    const container = new Container(fakeDb);
    container.contribute('x', PaymentMethods, Contada);

    container.all(PaymentMethods);
    container.all(PaymentMethods);

    expect(veces).toBe(1);
  });

  it('una contribución que pide su propia ranura se reporta, no revienta la pila', () => {
    class SePideASiMisma extends Provider implements PaymentMethod {
      public readonly id = 'x';
      public readonly label = 'X';
      private readonly otras = this.all(PaymentMethods);
    }

    const container = new Container(fakeDb);
    container.contribute('x', PaymentMethods, SePideASiMisma);

    expect(() => container.all(PaymentMethods)).toThrow(
      /is being filled while it is still being filled/,
    );
  });
});
