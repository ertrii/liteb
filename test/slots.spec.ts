import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import type { DataSource } from 'typeorm';
import {
  buildContainer,
  contract,
  ContainerContext,
  defineModule,
  slot,
} from '../lib';

const fakeDb = {} as DataSource;

interface PaymentMethod {
  id: string;
  label: string;
}
const PaymentMethods = slot<PaymentMethod>('billing.payment-methods');

describe('ranuras de extensión', () => {
  it('una ranura que nadie llenó devuelve vacío, no falla', () => {
    // Es una función que nadie instaló, no un error.
    const billing = defineModule({ id: 'billing', version: '1.0.0' });
    const container = buildContainer([billing], fakeDb);

    expect(container.all(PaymentMethods)).toEqual([]);
    expect(container.countFor(PaymentMethods)).toBe(0);
  });

  it('acepta VARIAS contribuciones: en eso se diferencia de un contrato', () => {
    const efectivo = defineModule({
      id: 'cash',
      version: '1.0.0',
      contributes: [
        { slot: PaymentMethods, value: { id: 'cash', label: 'Efectivo' } },
      ],
    });
    const banco = defineModule({
      id: 'bank',
      version: '1.0.0',
      contributes: [
        { slot: PaymentMethods, value: { id: 'bank', label: 'Transferencia' } },
      ],
    });

    const container = buildContainer([efectivo, banco], fakeDb);

    expect(container.all(PaymentMethods).map((m) => m.id)).toEqual([
      'cash',
      'bank',
    ]);
  });

  it('acepta clase y fábrica, con el contexto del contenedor', () => {
    const Tasa = contract<number>('fx.rate');
    const fx = defineModule({
      id: 'fx',
      version: '1.0.0',
      provides: [{ token: Tasa, value: 3.7 }],
    });

    class PorClase implements PaymentMethod {
      id = 'clase';
      label: string;
      constructor(ctx: ContainerContext) {
        this.label = `Clase a ${ctx.get(Tasa)}`;
      }
    }

    const porClase = defineModule({
      id: 'a',
      version: '1.0.0',
      contributes: [{ slot: PaymentMethods, use: PorClase }],
    });
    const porFabrica = defineModule({
      id: 'b',
      version: '1.0.0',
      contributes: [
        {
          slot: PaymentMethods,
          factory: (ctx) => ({ id: 'fab', label: `Fábrica a ${ctx.get(Tasa)}` }),
        },
      ],
    });

    const container = buildContainer([fx, porClase, porFabrica], fakeDb);

    expect(container.all(PaymentMethods).map((m) => m.label)).toEqual([
      'Clase a 3.7',
      'Fábrica a 3.7',
    ]);
  });

  it('se construye una sola vez y se cachea', () => {
    let veces = 0;
    const mod = defineModule({
      id: 'x',
      version: '1.0.0',
      contributes: [
        {
          slot: PaymentMethods,
          factory: () => {
            veces += 1;
            return { id: 'x', label: 'X' };
          },
        },
      ],
    });

    const container = buildContainer([mod], fakeDb);
    container.all(PaymentMethods);
    container.all(PaymentMethods);

    expect(veces).toBe(1);
  });

  it('una contribución que pide su propia ranura se reporta, no revienta la pila', () => {
    const mod = defineModule({
      id: 'x',
      version: '1.0.0',
      contributes: [
        {
          slot: PaymentMethods,
          factory: (ctx) => {
            ctx.all(PaymentMethods);
            return { id: 'x', label: 'X' };
          },
        },
      ],
    });

    const container = buildContainer([mod], fakeDb);

    expect(() => container.all(PaymentMethods)).toThrow(
      /is being filled while it is still being filled/,
    );
  });

  it('un módulo apagado no aporta: buildContainer solo ve los activos', () => {
    // `buildContainer` recibe los módulos ACTIVOS, así que apagar la extensión
    // retira lo que agregó — el método de pago desaparece.
    const efectivo = defineModule({
      id: 'cash',
      version: '1.0.0',
      contributes: [
        { slot: PaymentMethods, value: { id: 'cash', label: 'Efectivo' } },
      ],
    });

    expect(buildContainer([], fakeDb).all(PaymentMethods)).toEqual([]);
    expect(buildContainer([efectivo], fakeDb).all(PaymentMethods)).toHaveLength(1);
  });
});
