import { describe, expect, it } from '@jest/globals';
import { defineModule } from '../lib/modules/define-module';
import { reconcileModules } from '../lib/modules/reconcile-modules';
import type { ModuleState } from '../lib/modules/reconcile-modules';
import type { ModuleManifest } from '../lib/modules/module-manifest';

const mod = (id: string, extra: Partial<ModuleManifest> = {}) =>
  defineModule({ id, version: '1.0.0', ...extra });

const stored = (
  id: string,
  version = '1.0.0',
  enabled = true,
): ModuleState => ({ id, version, enabled });

describe('reconcileModules — instalación', () => {
  it('un módulo nuevo se instala apagado', () => {
    const result = reconcileModules([mod('news')], []);

    expect(result.install).toEqual([
      { id: 'news', version: '1.0.0', enabled: false },
    ]);
    expect(result.enabledIds).toEqual([]);
  });

  it('un módulo core nuevo se instala encendido', () => {
    const result = reconcileModules([mod('billing', { core: true })], []);

    expect(result.install).toEqual([
      { id: 'billing', version: '1.0.0', enabled: true },
    ]);
    expect(result.enabledIds).toEqual(['billing']);
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

describe('reconcileModules — encendidos', () => {
  it('respeta lo que la instalación tenía encendido', () => {
    const result = reconcileModules(
      [mod('news'), mod('support')],
      [stored('news', '1.0.0', true), stored('support', '1.0.0', false)],
    );

    expect(result.enabledIds).toEqual(['news']);
  });

  it('un core apagado a mano en la base vuelve a encenderse', () => {
    const result = reconcileModules(
      [mod('billing', { core: true })],
      [stored('billing', '1.0.0', false)],
    );

    expect(result.enabledIds).toEqual(['billing']);
  });

  it('el resultado sirve tal cual para resolveModules', () => {
    const result = reconcileModules(
      [mod('identity', { core: true }), mod('news'), mod('support')],
      [stored('news', '1.0.0', true), stored('support', '1.0.0', false)],
    );

    expect(result.enabledIds).toEqual(['identity', 'news']);
  });
});

describe('reconcileModules — huérfanos', () => {
  it('reporta un módulo cuyo código desapareció', () => {
    const result = reconcileModules([mod('news')], [
      stored('news'),
      stored('legacy-thing'),
    ]);

    expect(result.orphaned).toEqual([
      { id: 'legacy-thing', version: '1.0.0', enabled: true },
    ]);
  });

  it('nunca lo da por habilitado', () => {
    const result = reconcileModules([], [stored('legacy-thing', '1.0.0', true)]);

    expect(result.enabledIds).toEqual([]);
    expect(result.orphaned).toHaveLength(1);
  });

  it('no lo confunde con algo a instalar', () => {
    const result = reconcileModules([], [stored('legacy-thing')]);

    expect(result.install).toEqual([]);
    expect(result.upgrade).toEqual([]);
  });
});

describe('reconcileModules — instalación en blanco', () => {
  it('sin nada registrado, instala todo y enciende solo los core', () => {
    const result = reconcileModules(
      [
        mod('identity', { core: true }),
        mod('billing', { core: true }),
        mod('news'),
        mod('support'),
      ],
      [],
    );

    expect(result.install).toHaveLength(4);
    expect(result.enabledIds).toEqual(['identity', 'billing']);
    expect(result.orphaned).toEqual([]);
  });

  it('sin módulos ni registros no pasa nada', () => {
    expect(reconcileModules([], [])).toEqual({
      install: [],
      upgrade: [],
      orphaned: [],
      enabledIds: [],
    });
  });
});
