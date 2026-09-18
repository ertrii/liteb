import 'reflect-metadata';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { defineModule } from '../lib/modules/define-module';
import {
  MODULE_LAYOUT,
  ModuleDefinitionError,
} from '../lib/modules/module-manifest';
import {
  loadModuleEndpoints,
  loadModuleListeners,
  loadModuleProviders,
  loadModuleRoutines,
} from '../lib/modules/module-loader';

/**
 * La disposición estándar: un módulo que la respeta no declara ni un camino.
 *
 * Lo que se gana no es escribir menos. Es que el manifiesto pase a decir sólo
 * lo PARTICULAR del módulo — qué necesita, qué expone, qué puede gatear — en
 * vez de repetir cinco carpetas que son iguales en todos los módulos que
 * existieron y van a existir. Nombrar un campo vuelve a ser lo que debería:
 * decir algo distinto.
 */

const dir = path.join(__dirname, 'fixtures/layout');
const base = { id: 'layout', version: '1.0.0' };
const names = (values: unknown[]) => values.map((v) => (v as Function).name);

describe('disposición estándar', () => {
  it('sin declarar nada, encuentra las seis carpetas', () => {
    const mod = defineModule({ ...base, dir });

    expect(names(mod.entities)).toEqual(['Thing']);
    expect(names(mod.migrations).sort()).toEqual([
      'AddName1700000100000',
      'CreateThings1700000000000',
    ]);
    expect(mod.routes).toEqual([MODULE_LAYOUT.routes]);
    expect(mod.routines).toEqual([MODULE_LAYOUT.routines]);
    expect(mod.listeners).toEqual([MODULE_LAYOUT.listeners]);
    expect(mod.providers).toEqual([MODULE_LAYOUT.providers]);
  });

  it('y lo encontrado se monta: no son sólo rutas en un arreglo', async () => {
    const mod = defineModule({ ...base, dir });

    const endpoints = await loadModuleEndpoints(mod);
    const routines = await loadModuleRoutines(mod);
    const listeners = await loadModuleListeners(mod);
    const providers = await loadModuleProviders(mod);

    expect(endpoints).toHaveLength(1);
    // Sin `@Group`: el prefijo sale del id del módulo.
    expect(endpoints[0].group).toBe('layout');
    expect(routines).toHaveLength(1);
    expect(listeners).toHaveLength(1);

    // Y el token sale del decorador de la clase, no de una lista.
    expect(providers).toHaveLength(1);
    expect(providers[0].target.id).toBe('layout.things');
  });

  it('en la carpeta de entidades, lo que no es entidad se ignora', () => {
    // El archivo exporta además un enum, una constante y una clase pelada.
    // Pasárselos a TypeORM sería un error confuso mucho más tarde.
    const mod = defineModule({ ...base, dir });

    expect(mod.entities).toHaveLength(1);
  });

  it('una migración vista dos veces sigue siendo una', () => {
    // La carpeta tiene un index.ts que re-exporta las dos clases, que es como
    // se escribían los módulos antes. El glob lo lee igual.
    const mod = defineModule({ ...base, dir });

    expect(mod.migrations).toHaveLength(2);
  });

  it('dice cuáles campos salieron de la convención', () => {
    const mod = defineModule({ ...base, dir });

    expect(mod.implicit).toEqual([
      'entities',
      'migrations',
      'routes',
      'routines',
      'listeners',
      'providers',
    ]);
  });
});

describe('cuando el módulo está en otro lado', () => {
  it('nombrar un campo reemplaza ESE campo, no la convención entera', () => {
    const mod = defineModule({
      ...base,
      dir,
      routes: './endpoints/*.endpoint.ts',
    });

    expect(mod.implicit).not.toContain('routes');
    // Las otras cuatro siguen saliendo de la disposición estándar.
    expect(mod.implicit).toEqual([
      'entities',
      'migrations',
      'routines',
      'listeners',
      'providers',
    ]);
  });

  it('un módulo con otra disposición sigue funcionando declarándola', async () => {
    const mod = defineModule({
      id: 'legacy',
      version: '1.0.0',
      dir: path.join(__dirname, 'fixtures/layout-custom'),
      routes: './apis/*.api.ts',
    });

    expect(await loadModuleEndpoints(mod)).toHaveLength(1);
  });

  it('las entidades se pueden seguir listando a mano', () => {
    class Manual {}

    const mod = defineModule({ ...base, dir, entities: [Manual] });

    expect(mod.entities).toEqual([Manual]);
    expect(mod.implicit).not.toContain('entities');
  });

  it('un arreglo vacío es un módulo que dice no tener: no aplica el default', () => {
    const mod = defineModule({ ...base, dir, entities: [] });

    expect(mod.entities).toEqual([]);
  });

  it('sin dir no hay convención: no hay contra qué resolver', () => {
    // Un glob sin `dir` caería sobre el directorio de trabajo del proceso, que
    // es cualquier cosa. Mejor no buscar nada que buscar en el lugar de otro.
    const mod = defineModule(base);

    expect(mod.entities).toEqual([]);
    expect(mod.migrations).toEqual([]);
    expect(mod.routes).toEqual([]);
    expect(mod.implicit).toEqual([]);
  });

  it('mezclar globs con clases no pasa de defineModule', () => {
    class Manual {}

    expect(() =>
      defineModule({
        ...base,
        dir,
        entities: [Manual, './entities/*.entity.ts'] as never,
      }),
    ).toThrow(ModuleDefinitionError);
  });
});
