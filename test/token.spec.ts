import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { Container, EventBus, token } from '../lib';

const fakeDb = {} as DataSource;

/**
 * `token()` reemplazó a `contract()`, `slot()` y `event()`.
 *
 * Lo que compra: el "de qué tipo es" pasa a ser una propiedad DEL TOKEN, que es
 * de donde ya lo leían el contenedor y `@Provides`. Antes se afirmaba en dos
 * lugares —el token y el nombre del decorador— y dos lugares que pueden
 * discrepar son la única razón por la que existía un error de "los cruzaste".
 */
describe('token()', () => {
  it('lleva el id y la clase que se le pidió', () => {
    expect(token('billing.service', 'contract')).toEqual({
      id: 'billing.service',
      kind: 'contract',
    });
    expect(token('billing.payment-methods', 'slot')).toEqual({
      id: 'billing.payment-methods',
      kind: 'slot',
    });
    expect(token('billing.charge.created', 'event')).toEqual({
      id: 'billing.charge.created',
      kind: 'event',
    });
  });

  it('rechaza un id vacío, que si no choca con el próximo id vacío', () => {
    expect(() => token('', 'contract')).toThrow(/non-empty string/);
    expect(() => token('   ', 'event')).toThrow(/non-empty string/);
  });

  it('rechaza una clase que no existe, nombrando las tres', () => {
    expect(() => token('demo.x', 'contrato' as never)).toThrow(
      /unknown kind "contrato"/,
    );
  });
});

/**
 * Éste es un test de TIPOS: ts-jest compila el archivo, así que un
 * `@ts-expect-error` que deja de ser necesario ROMPE la suite. Es la única
 * forma de fijar que los tres tokens no se pueden cruzar, porque el chequeo no
 * existe en tiempo de ejecución.
 */
describe('los tres tokens no se pueden cruzar (en compilación)', () => {
  const Contrato = token<{ hola(): void }>('demo.contrato', 'contract');
  const Ranura = token<{ id: string }>('demo.ranura', 'slot');
  const Aviso = token<{ n: number }>('demo.aviso', 'event');

  it('el contenedor no acepta el token equivocado', () => {
    const container = new Container(fakeDb);

    // @ts-expect-error una ranura no es un contrato
    expect(() => container.get(Ranura)).toThrow();
    // @ts-expect-error un evento no es un contrato
    expect(() => container.get(Aviso)).toThrow();
    // @ts-expect-error un contrato no es una ranura
    expect(container.all(Contrato)).toEqual([]);
  });

  it('emit() no acepta un contrato ni una ranura', async () => {
    const bus = new EventBus(fakeDb);

    // Antes de que EventToken llevara `kind`, las dos líneas de abajo
    // compilaban y después no le llegaban a nadie: no hay oyente registrado
    // bajo el id de un contrato.

    // @ts-expect-error un contrato no es un evento
    await bus.emit(Contrato, { n: 1 });
    // @ts-expect-error una ranura no es un evento
    await bus.emit(Ranura, { n: 1 });

    expect(bus.countFor(Aviso)).toBe(0);
  });
});
