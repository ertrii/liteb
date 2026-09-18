import 'reflect-metadata';
import path from 'path';
import { beforeEach, describe, expect, it } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { buildContainer } from '../lib/modules/build-container';
import { defineModule } from '../lib/modules/define-module';
import { contract, ContractError } from '../lib/modules/container';
import { slot } from '../lib/modules/slots';
import { Provider } from '../lib/templates/provider';
import { Contributes, Provides } from '../lib/decorators/provides.decorator';
import { Badges, built, Clock, Greeter } from './fixtures/proveedores/shared';

/**
 * La implementación de un contrato es una CLASE en `providers/`, y el token
 * sale de su decorador.
 *
 * Lo que compra: `module.ts` vuelve a ser sólo el lugar donde se enlazan las
 * piezas. Donde antes había una fábrica dentro del manifiesto —el lugar donde
 * más código de un módulo terminaba viviendo— ahora hay un archivo con nombre,
 * en una carpeta que se encuentra sola.
 */

/** El contenedor sólo pasa el DataSource al construir: alcanza con un doble. */
const fakeDb = { marca: 'la de verdad' } as unknown as DataSource;

const demo = defineModule({
  id: 'demo',
  version: '1.0.0',
  dir: path.join(__dirname, 'fixtures/proveedores'),
});

describe('proveedores por carpeta', () => {
  beforeEach(() => {
    built.greeter = 0;
    built.clock = 0;
  });

  it('registra el contrato sin que el manifiesto lo nombre', async () => {
    // El manifiesto de `demo` no dice `provides` en ninguna parte.
    const container = await buildContainer([demo], fakeDb);

    expect(container.providerOf(Greeter)).toBe('demo');
    expect(container.get(Greeter).hello()).toBe('hola fijo');
  });

  it('le inyecta db antes de construir, como a un endpoint', async () => {
    // `sawDb` es un inicializador de campo: si `db` llegara en el constructor
    // o después, sería false y `this.db.getRepository(...)` no compilaría como
    // patrón.
    const container = await buildContainer([demo], fakeDb);

    expect((container.get(Greeter) as unknown as { sawDb: boolean }).sawDb).toBe(
      true,
    );
  });

  it('sigue construyéndose al primer uso, y una sola vez', async () => {
    const container = await buildContainer([demo], fakeDb);

    // Cargar la carpeta no construye nada: un contrato que nadie llama no
    // cuesta.
    expect(built.greeter).toBe(0);

    container.get(Greeter).hello();
    container.get(Greeter).hello();

    expect(built.greeter).toBe(1);
    // Y `hello()` resolvió Clock por su cuenta.
    expect(built.clock).toBe(1);
  });

  it('@Contributes llena la ranura de otro módulo', async () => {
    const container = await buildContainer([demo], fakeDb);

    expect(container.all(Badges).map((badge) => badge.id)).toEqual(['loud']);
  });

  it('un Provider sin decorador se salta, no rompe el arranque', async () => {
    // `naked.provider.ts` está en la carpeta a propósito.
    const container = await buildContainer([demo], fakeDb);

    expect(container.ids().sort()).toEqual(['demo.clock', 'demo.greeter']);
  });
});

describe('los decoradores no dejan cruzar los conceptos', () => {
  it('@Provides rechaza una ranura', () => {
    const Ranura = slot<{ id: string }>('demo.ranura');

    expect(() => {
      @Provides(Ranura as never)
      class Mal extends Provider {}
      return Mal;
    }).toThrow(/@Provides\(\) takes a contract, and got a slot/);
  });

  it('@Contributes rechaza un contrato', () => {
    const Contrato = contract<{ id: string }>('demo.contrato');

    expect(() => {
      @Contributes(Contrato as never)
      class Mal extends Provider {}
      return Mal;
    }).toThrow(/@Contributes\(\) takes a slot, and got a contract/);
  });
});

describe('un contrato tiene exactamente un proveedor', () => {
  it('dos módulos respondiendo el mismo es un error de arranque', async () => {
    // El MISMO directorio montado dos veces: dos módulos con la misma clase.
    // Sin esto, el consumidor recibiría uno u otro según el orden de carga, que
    // es la clase de error que cambia entre despliegues.
    const otro = defineModule({
      id: 'otro',
      version: '1.0.0',
      dir: path.join(__dirname, 'fixtures/proveedores'),
    });

    await expect(buildContainer([demo, otro], fakeDb)).rejects.toThrow(
      ContractError,
    );
  });
});
