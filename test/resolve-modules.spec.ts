import { describe, expect, it } from '@jest/globals';
import { defineModule } from '../lib/modules/define-module';
import {
  ModuleResolutionError,
  resolveModules,
} from '../lib/modules/resolve-modules';
import type { ModuleManifest } from '../lib/modules/module-manifest';

const mod = (id: string, extra: Partial<ModuleManifest> = {}) =>
  defineModule({ id, version: '1.0.0', ...extra });

const ids = (modules: ReturnType<typeof mod>[]) => modules.map((m) => m.id);

describe('resolveModules — orden', () => {
  it('pone la dependencia antes que quien la pide', () => {
    const billing = mod('billing', { requires: ['identity'] });
    const identity = mod('identity');

    expect(ids(resolveModules([billing, identity]))).toEqual([
      'identity',
      'billing',
    ]);
  });

  it('ordena una cadena larga', () => {
    const c = mod('c', { requires: ['b'] });
    const b = mod('b', { requires: ['a'] });
    const a = mod('a');

    expect(ids(resolveModules([c, b, a]))).toEqual(['a', 'b', 'c']);
  });

  it('respeta un diamante de dependencias', () => {
    const top = mod('top', { requires: ['left', 'right'] });
    const left = mod('left', { requires: ['base'] });
    const right = mod('right', { requires: ['base'] });
    const base = mod('base');

    const order = ids(resolveModules([top, left, right, base]));

    expect(order[0]).toBe('base');
    expect(order[3]).toBe('top');
    expect(order).toHaveLength(4);
  });

  it('los módulos sin relación conservan el orden de entrada', () => {
    const order = ids(resolveModules([mod('a'), mod('b'), mod('c')]));
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('es determinista entre corridas', () => {
    const build = () => [
      mod('billing', { requires: ['identity'] }),
      mod('support', { requires: ['identity'] }),
      mod('identity'),
    ];

    expect(ids(resolveModules(build()))).toEqual(ids(resolveModules(build())));
  });
});

describe('resolveModules — grafos inválidos', () => {
  it('rechaza dos módulos con el mismo id', () => {
    expect(() => resolveModules([mod('billing'), mod('billing')])).toThrow(
      /share the id "billing"/,
    );
  });

  it('rechaza una dependencia que no está instalada', () => {
    expect(() => resolveModules([mod('billing', { requires: ['ghost'] })]))
      .toThrow(/requires "ghost", which is not installed/);
  });

  it('nombra el ciclo que encontró', () => {
    const a = mod('a', { requires: ['b'] });
    const b = mod('b', { requires: ['c'] });
    const c = mod('c', { requires: ['a'] });

    expect(() => resolveModules([a, b, c])).toThrow(
      /Dependency cycle: a -> b -> c -> a/,
    );
  });

  it('detecta un ciclo de dos', () => {
    const a = mod('a', { requires: ['b'] });
    const b = mod('b', { requires: ['a'] });

    expect(() => resolveModules([a, b])).toThrow(/Dependency cycle: a -> b -> a/);
  });

  it('el error es un ModuleResolutionError y dice de qué módulo se trata', () => {
    try {
      resolveModules([mod('billing', { requires: ['ghost'] })]);
      throw new Error('debió lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(ModuleResolutionError);
      expect((error as ModuleResolutionError).moduleId).toBe('billing');
    }
  });
});

describe('resolveModules — compatibilidad con el anfitrión', () => {
  it('acepta un módulo cuyo rango se satisface', () => {
    const billing = mod('billing', { engine: '^3.0.0' });
    expect(ids(resolveModules([billing], { hostVersion: '3.2.1' }))).toEqual([
      'billing',
    ]);
  });

  it('rechaza un módulo pensado para otro anfitrión', () => {
    const billing = mod('billing', { engine: '^4.0.0' });
    expect(() => resolveModules([billing], { hostVersion: '3.2.1' })).toThrow(
      /needs a host matching "\^4.0.0", but this one is "3.2.1"/,
    );
  });

  it('una prerelease del anfitrión satisface el rango', () => {
    // Durante el desarrollo el anfitrión vive en 2.0.0-dev.N: si las
    // prereleases no contaran, ningún módulo cargaría.
    const billing = mod('billing', { engine: '^2.0.0' });
    expect(ids(resolveModules([billing], { hostVersion: '2.0.0-dev.0' })))
      .toEqual(['billing']);
  });

  it('ignorar la prerelease no ablanda el resto del rango', () => {
    // 3.0.0-alpha se compara como 3.0.0, que sigue quedando fuera de ^2.0.0.
    const billing = mod('billing', { engine: '^2.0.0' });
    expect(() => resolveModules([billing], { hostVersion: '3.0.0-alpha.1' }))
      .toThrow(/needs a host matching "\^2.0.0"/);
  });

  it('sin hostVersion no se comprueba nada', () => {
    const billing = mod('billing', { engine: '^9.0.0' });
    expect(ids(resolveModules([billing]))).toEqual(['billing']);
  });

  it('un módulo sin engine acepta cualquier anfitrión', () => {
    expect(ids(resolveModules([mod('billing')], { hostVersion: '3.0.0' })))
      .toEqual(['billing']);
  });

  it('rechaza una versión de anfitrión inválida', () => {
    expect(() => resolveModules([mod('billing')], { hostVersion: '3' })).toThrow(
      /not a valid semver version/,
    );
  });
});

describe('resolveModules — habilitados', () => {
  it('sin lista, todos entran', () => {
    expect(ids(resolveModules([mod('a'), mod('b')]))).toEqual(['a', 'b']);
  });

  it('deja fuera lo que no está habilitado', () => {
    const order = resolveModules([mod('a'), mod('b')], { enabled: ['a'] });
    expect(ids(order)).toEqual(['a']);
  });

  it('un módulo core entra aunque no esté en la lista', () => {
    const order = resolveModules([mod('billing', { core: true }), mod('news')], {
      enabled: ['news'],
    });

    expect(ids(order)).toEqual(['billing', 'news']);
  });

  it('una lista vacía deja solo los core', () => {
    const order = resolveModules([mod('billing', { core: true }), mod('news')], {
      enabled: [],
    });

    expect(ids(order)).toEqual(['billing']);
  });

  it('rechaza depender de un módulo instalado pero apagado', () => {
    const support = mod('support', { requires: ['inventory'] });
    const inventory = mod('inventory');

    expect(() =>
      resolveModules([support, inventory], { enabled: ['support'] }),
    ).toThrow(/requires "inventory", which is disabled/);
  });

  it('distingue apagado de no instalado', () => {
    const support = mod('support', { requires: ['ghost'] });

    expect(() => resolveModules([support], { enabled: ['support'] })).toThrow(
      /requires "ghost", which is not installed/,
    );
  });

  it('un módulo apagado que depende de uno encendido simplemente se omite', () => {
    const identity = mod('identity');
    const news = mod('news', { requires: ['identity'] });

    expect(ids(resolveModules([identity, news], { enabled: ['identity'] })))
      .toEqual(['identity']);
  });
});
