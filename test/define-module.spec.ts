import { describe, expect, it } from '@jest/globals';
import { defineModule } from '../lib/modules/define-module';
import { ModuleDefinitionError } from '../lib/modules/module-manifest';

const base = { id: 'billing', version: '1.0.0' };

describe('defineModule — identidad', () => {
  it('acepta un manifiesto mínimo y aplica los valores por defecto', () => {
    const mod = defineModule(base);

    expect(mod.id).toBe('billing');
    expect(mod.version).toBe('1.0.0');
    expect(mod.label).toBe('billing');
    expect(mod.core).toBe(false);
    expect(mod.engine).toBeNull();
    expect(mod.requires).toEqual([]);
    expect(mod.entities).toEqual([]);
    expect(mod.migrations).toEqual([]);
    expect(mod.routes).toEqual([]);
    expect(mod.permissions).toEqual([]);
    expect(mod.onEnable).toBeNull();
  });

  it('exige un id', () => {
    expect(() => defineModule({ ...base, id: '' })).toThrow(ModuleDefinitionError);
  });

  it.each(['Billing', 'customer_portal', '1billing', 'customer-', 'cliente ñ'])(
    'rechaza el id inválido %s',
    (id) => {
      expect(() => defineModule({ ...base, id })).toThrow(/must be lowercase/);
    },
  );

  it('acepta ids con guiones', () => {
    expect(defineModule({ ...base, id: 'customer-portal' }).id).toBe(
      'customer-portal',
    );
  });

  it('usa el label cuando viene, y el id cuando no', () => {
    expect(defineModule({ ...base, label: 'Facturación' }).label).toBe(
      'Facturación',
    );
    expect(defineModule({ ...base, label: '   ' }).label).toBe('billing');
  });
});

describe('defineModule — versiones', () => {
  it('exige una versión semver', () => {
    expect(() => defineModule({ id: 'billing', version: '' })).toThrow(
      /needs a "version"/,
    );
    expect(() => defineModule({ id: 'billing', version: '2.1' })).toThrow(
      /not a valid semver version/,
    );
  });

  it('acepta una versión con prerelease', () => {
    expect(defineModule({ ...base, version: '2.0.0-dev.0' }).version).toBe(
      '2.0.0-dev.0',
    );
  });

  it('valida el rango de engine', () => {
    expect(defineModule({ ...base, engine: '^3.0.0' }).engine).toBe('^3.0.0');
    expect(defineModule({ ...base, engine: '>=3 <5' }).engine).toBe('>=3 <5');
    expect(() => defineModule({ ...base, engine: 'la 3' })).toThrow(
      /not a valid semver range/,
    );
  });
});

describe('defineModule — dependencias', () => {
  it('conserva las dependencias declaradas', () => {
    expect(defineModule({ ...base, requires: ['identity', 'customers'] }).requires)
      .toEqual(['identity', 'customers']);
  });

  it('un módulo no puede requerirse a sí mismo', () => {
    expect(() => defineModule({ ...base, requires: ['billing'] })).toThrow(
      /cannot require itself/,
    );
  });

  it('rechaza dependencias duplicadas', () => {
    expect(() =>
      defineModule({ ...base, requires: ['identity', 'identity'] }),
    ).toThrow(/duplicated dependencies: identity/);
  });

  it('rechaza un id de dependencia inválido', () => {
    expect(() => defineModule({ ...base, requires: ['Identity'] })).toThrow(
      /is not a valid module id/,
    );
  });
});

describe('defineModule — permisos', () => {
  it('acepta permisos con el espacio de nombres del módulo', () => {
    const mod = defineModule({
      ...base,
      permissions: [
        { key: 'billing.view', label: 'Ver facturación' },
        { key: 'billing.charge.cancel', label: 'Anular cargos' },
      ],
    });

    expect(mod.permissions).toHaveLength(2);
  });

  it('exige que la clave lleve el id del módulo por delante', () => {
    expect(() =>
      defineModule({
        ...base,
        permissions: [{ key: 'invoices.view', label: 'Ver' }],
      }),
    ).toThrow(/must be namespaced as "billing\./);
  });

  it('exige una clave con puntos', () => {
    expect(() =>
      defineModule({ ...base, permissions: [{ key: 'billing', label: 'Ver' }] }),
    ).toThrow(/not a dotted lowercase key/);
  });

  it('exige una etiqueta', () => {
    expect(() =>
      defineModule({ ...base, permissions: [{ key: 'billing.view', label: '' }] }),
    ).toThrow(/needs a non-empty "label"/);
  });

  it('rechaza claves duplicadas', () => {
    expect(() =>
      defineModule({
        ...base,
        permissions: [
          { key: 'billing.view', label: 'Ver' },
          { key: 'billing.view', label: 'Ver otra vez' },
        ],
      }),
    ).toThrow(/duplicated permission keys: billing\.view/);
  });
});

describe('defineModule — aportes', () => {
  class Charge {}
  class Invoice {}

  it('rechaza la misma entidad dos veces', () => {
    expect(() =>
      defineModule({ ...base, entities: [Charge, Charge] }),
    ).toThrow(/the same entity is listed twice/);
  });

  it('conserva las entidades declaradas', () => {
    expect(defineModule({ ...base, entities: [Charge, Invoice] }).entities)
      .toHaveLength(2);
  });

  it('normaliza un glob suelto a un arreglo', () => {
    const mod = defineModule({ ...base, routes: './controllers/**/*.ts' });
    expect(mod.routes).toEqual(['./controllers/**/*.ts']);
  });

  it('acepta varios globs', () => {
    const mod = defineModule({ ...base, tasks: ['./a/*.ts', './b/*.ts'] });
    expect(mod.tasks).toEqual(['./a/*.ts', './b/*.ts']);
  });

  it('aplana el objeto de "import * as migrations" a un arreglo', () => {
    class CreateCharges {}
    class AddDueDate {}
    // Lo que entrega un namespace import: clases más lo que no lo es.
    const migrations = { CreateCharges, AddDueDate, __esModule: true };

    const mod = defineModule({ ...base, migrations });

    expect(mod.migrations).toEqual([CreateCharges, AddDueDate]);
  });

  it('acepta migraciones ya en arreglo', () => {
    class CreateCharges {}
    expect(defineModule({ ...base, migrations: [CreateCharges] }).migrations)
      .toEqual([CreateCharges]);
  });
});

describe('defineModule — errores', () => {
  it('el error dice de qué módulo se trata', () => {
    try {
      defineModule({ ...base, requires: ['billing'] });
      throw new Error('debió lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(ModuleDefinitionError);
      expect((error as ModuleDefinitionError).moduleId).toBe('billing');
    }
  });

  it('un manifiesto que no es objeto falla claro', () => {
    expect(() => defineModule(undefined as never)).toThrow(
      /expects a manifest object/,
    );
  });
});
