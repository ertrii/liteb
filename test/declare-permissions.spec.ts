import { describe, expect, it } from '@jest/globals';
import { declarePermissions } from '../lib/modules/declare-permissions';
import { defineModule } from '../lib/modules/define-module';
import { ModuleDefinitionError } from '../lib/modules/module-manifest';

/**
 * Un solo lugar define las claves.
 *
 * Antes la misma cadena se escribía tres veces — en el manifiesto, en el
 * resolutor que la concede y en cada endpoint que la exige — sin nada que
 * atara las tres. Tres oportunidades de escribirla mal, y la única red era un
 * 500 en tiempo de ejecución.
 */

const tasks = declarePermissions('tasks', {
  view: 'Ver tareas',
  manage: 'Crear y editar tareas',
  'board.export': 'Exportar el tablero',
});

describe('declarePermissions', () => {
  it('antepone el id del módulo: nadie tiene que recordar la regla', () => {
    expect(tasks.view).toBe('tasks.view');
    expect(tasks.manage).toBe('tasks.manage');
  });

  it('un nombre con puntos sirve para un espacio más profundo', () => {
    expect(tasks['board.export']).toBe('tasks.board.export');
  });

  it('se puede desparramar para dar todo lo del módulo', () => {
    expect([...tasks]).toEqual([
      'tasks.view',
      'tasks.manage',
      'tasks.board.export',
    ]);
  });

  it('las etiquetas viajan con las claves hasta el manifiesto', () => {
    const mod = defineModule({
      id: 'tasks',
      version: '1.0.0',
      permissions: tasks,
    });

    expect(mod.permissions).toEqual([
      { key: 'tasks.view', label: 'Ver tareas' },
      { key: 'tasks.manage', label: 'Crear y editar tareas' },
      { key: 'tasks.board.export', label: 'Exportar el tablero' },
    ]);
  });

  it('el arreglo de siempre sigue andando', () => {
    const mod = defineModule({
      id: 'billing',
      version: '1.0.0',
      permissions: [{ key: 'billing.view', label: 'Ver facturación' }],
    });

    expect(mod.permissions).toHaveLength(1);
  });

  it('rechaza un set declarado para OTRO módulo', () => {
    // Es lo que parece un archivo de permisos copiado y pegado: sin esto, las
    // claves quedarían bajo el dueño equivocado y el manifiesto las aceptaría
    // porque el prefijo es interno y consistente.
    expect(() =>
      defineModule({ id: 'billing', version: '1.0.0', permissions: tasks }),
    ).toThrow(ModuleDefinitionError);

    expect(() =>
      defineModule({ id: 'billing', version: '1.0.0', permissions: tasks }),
    ).toThrow(/declared for "tasks".*declarePermissions/s);
  });

  it('las claves siguen pasando la validación del manifiesto', () => {
    // Un nombre en mayúsculas produce una clave inválida, y eso se rechaza al
    // importar el manifiesto, no más tarde.
    const malo = declarePermissions('tasks', { Ver: 'Mal' });

    expect(() =>
      defineModule({ id: 'tasks', version: '1.0.0', permissions: malo }),
    ).toThrow(/not a dotted lowercase key/);
  });

  it('el set no expone nada del framework al enumerarlo', () => {
    // Símbolos y no nombres: así ningún permiso queda prohibido de llamarse
    // como un ayudante.
    expect(Object.keys(tasks)).toEqual(['view', 'manage', 'board.export']);
    expect(JSON.parse(JSON.stringify(tasks))).toEqual({
      view: 'tasks.view',
      manage: 'tasks.manage',
      'board.export': 'tasks.board.export',
    });
  });

  it('es inmutable: la lista de claves no se parchea en caliente', () => {
    expect(() => {
      (tasks as unknown as Record<string, string>).view = 'otra';
    }).toThrow();
  });
});
