import { describe, expect, it } from '@jest/globals';
import { defineModule } from '../lib/modules/define-module';
import { reconcileModules } from '../lib/modules/reconcile-modules';
import type { ModuleState } from '../lib/modules/reconcile-modules';
import type { ModuleManifest } from '../lib/modules/module-manifest';

const mod = (id: string, extra: Partial<ModuleManifest> = {}) =>
  defineModule({ id, version: '1.0.0', ...extra });

const stored = (id: string, version = '1.0.0'): ModuleState => ({
  id,
  version,
});

describe('reconcileModules — instalación', () => {
  it('registra un módulo nuevo', () => {
    const result = reconcileModules([mod('news')], []);

    expect(result.install).toEqual([{ id: 'news', version: '1.0.0' }]);
  });

  it('no reinstala lo que ya está registrado', () => {
    const result = reconcileModules([mod('news')], [stored('news')]);

    expect(result.install).toEqual([]);
    expect(result.upgrade).toEqual([]);
  });
});

describe('reconcileModules — versiones', () => {
  it('detecta una actualización', () => {
    const result = reconcileModules(
      [mod('billing', { version: '2.1.0' })],
      [stored('billing', '2.0.0')],
    );

    expect(result.upgrade).toEqual([
      { id: 'billing', from: '2.0.0', to: '2.1.0', downgrade: false },
    ]);
  });

  it('marca cuando el código trae una versión anterior', () => {
    // Pasa al revertir un despliegue: hay que poder avisarlo.
    const result = reconcileModules(
      [mod('billing', { version: '2.0.0' })],
      [stored('billing', '2.1.0')],
    );

    expect(result.upgrade[0]).toMatchObject({ downgrade: true });
  });

  it('la misma versión no genera nada', () => {
    const result = reconcileModules(
      [mod('billing', { version: '2.1.0' })],
      [stored('billing', '2.1.0')],
    );

    expect(result.upgrade).toEqual([]);
  });
});

describe('reconcileModules — huérfanos', () => {
  it('reporta un módulo cuyo código desapareció', () => {
    const result = reconcileModules(
      [mod('news')],
      [stored('news'), stored('legacy-thing')],
    );

    expect(result.orphaned).toEqual([{ id: 'legacy-thing', version: '1.0.0' }]);
  });

  it('no lo confunde con algo a instalar', () => {
    const result = reconcileModules([], [stored('legacy-thing')]);

    expect(result.install).toEqual([]);
    expect(result.upgrade).toEqual([]);
  });

  it('no lo borra: reportarlo es todo lo que hace', () => {
    // La fila se queda, y sus tablas también. Qué hacer con esos datos es una
    // decisión de quien opera la instalación, no de una secuencia de arranque.
    const result = reconcileModules([], [stored('legacy-thing')]);

    expect(result.orphaned).toHaveLength(1);
  });
});

describe('reconcileModules — instalación en blanco', () => {
  it('sin nada registrado, instala todo', () => {
    const result = reconcileModules(
      [mod('identity'), mod('billing'), mod('news'), mod('support')],
      [],
    );

    expect(result.install).toHaveLength(4);
    expect(result.orphaned).toEqual([]);
  });

  it('sin módulos ni registros no pasa nada', () => {
    expect(reconcileModules([], [])).toEqual({
      install: [],
      upgrade: [],
      orphaned: [],
    });
  });
});
