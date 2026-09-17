import path from 'path';
import fs from 'fs';
import os from 'os';
import slash from 'slash';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { defineModule } from '../lib/modules/define-module';
import {
  loadModuleEndpoints,
  loadModules,
  pickOneFilePerModule,
  resolveModulePattern,
  toEndpointReaders,
  withModuleExtensions,
} from '../lib/modules/module-loader';
import { Endpoint, HttpGet, Module, Priority } from '../lib';

const billingDir = path.join(__dirname, 'fixtures/modules/billing');

describe('resolveModulePattern', () => {
  it('resuelve contra la carpeta del módulo, no contra el cwd', () => {
    const resolved = resolveModulePattern('./controllers/*.ts', '/modules/billing');
    expect(resolved).toBe(path.resolve('/modules/billing', './controllers/*.ts'));
  });

  it('deja intacto un patrón absoluto', () => {
    const absolute = path.resolve('/otro/lugar/*.ts');
    expect(resolveModulePattern(absolute, '/modules/billing')).toBe(absolute);
  });

  it('sin dir cae en el directorio del proceso', () => {
    expect(resolveModulePattern('./x/*.ts', null)).toBe(
      path.resolve(process.cwd(), './x/*.ts'),
    );
  });
});

describe('toEndpointReaders', () => {
  @HttpGet('uno')
  @Module('demo')
  class Uno extends Endpoint {
    main() {
      return null;
    }
  }

  @Priority(1)
  @HttpGet('dos')
  @Module('demo')
  class Dos extends Endpoint {
    main() {
      return null;
    }
  }

  /** Sin verbo ni módulo: el lector la da por inválida. */
  class Incompleta extends Endpoint {
    main() {
      return null;
    }
  }

  it('ignora lo que no es un Endpoint', () => {
    const readers = toEndpointReaders([
      Uno,
      'una cadena',
      42,
      null,
      undefined,
      { objeto: true },
      class Suelta {},
    ]);

    expect(readers).toHaveLength(1);
  });

  it('descarta un endpoint sin verbo o sin módulo', () => {
    expect(toEndpointReaders([Incompleta])).toHaveLength(0);
  });

  it('pone primero los que declaran prioridad', () => {
    const readers = toEndpointReaders([Uno, Dos]);
    expect(readers[0].pathname).toBe('dos');
  });

  it('sin nada que cargar devuelve vacío', () => {
    expect(toEndpointReaders([])).toEqual([]);
  });
});

describe('loadModuleEndpoints', () => {
  const billing = defineModule({
    id: 'billing',
    version: '1.0.0',
    dir: billingDir,
    routes: './controllers/*.controller.ts',
  });

  it('lee los endpoints del módulo desde el disco', async () => {
    const readers = await loadModuleEndpoints(billing);
    expect(readers).toHaveLength(2);
  });

  it('los ordena por prioridad', async () => {
    const readers = await loadModuleEndpoints(billing);
    expect(readers.map((r) => r.method)).toEqual(['get', 'post']);
  });

  it('ignora los archivos sin endpoints y las constantes exportadas', async () => {
    const todos = defineModule({
      id: 'billing',
      version: '1.0.0',
      dir: billingDir,
      routes: './controllers/*.ts', // incluye not-an-endpoint.ts
    });

    expect(await loadModuleEndpoints(todos)).toHaveLength(2);
  });

  it('un módulo sin rutas no lee nada', async () => {
    const sinRutas = defineModule({ id: 'quieto', version: '1.0.0' });
    expect(await loadModuleEndpoints(sinRutas)).toEqual([]);
  });

  it('un glob que no encuentra nada devuelve vacío, no falla', async () => {
    const vacio = defineModule({
      id: 'vacio',
      version: '1.0.0',
      dir: billingDir,
      routes: './no-existe/*.controller.ts',
    });

    expect(await loadModuleEndpoints(vacio)).toEqual([]);
  });
});

describe('loadModules', () => {
  it('conserva el orden recibido', async () => {
    const billing = defineModule({
      id: 'billing',
      version: '1.0.0',
      dir: billingDir,
      routes: './controllers/*.controller.ts',
    });
    const identity = defineModule({ id: 'identity', version: '1.0.0' });

    const loaded = await loadModules([identity, billing]);

    expect(loaded.map((l) => l.module.id)).toEqual(['identity', 'billing']);
    expect(loaded[1].readers).toHaveLength(2);
  });

  it('un módulo sin rutas queda con una lista vacía', async () => {
    const loaded = await loadModules([
      defineModule({ id: 'quieto', version: '1.0.0' }),
    ]);

    expect(loaded[0].readers).toEqual([]);
  });
});

describe('withModuleExtensions', () => {
  it('cambia la extensión declarada por el juego completo', () => {
    expect(withModuleExtensions('./apis/*.api.ts')).toBe(
      './apis/*.api.{ts,js,cjs,mjs}',
    );
  });

  it('acepta un patrón sin extensión', () => {
    expect(withModuleExtensions('./apis/*.api')).toBe(
      './apis/*.api.{ts,js,cjs,mjs}',
    );
  });

  it('respeta el resto del glob', () => {
    expect(withModuleExtensions('./controllers/**/*.controller.js')).toBe(
      './controllers/**/*.controller.{ts,js,cjs,mjs}',
    );
  });
});

describe('pickOneFilePerModule', () => {
  it('con fuente y build lado a lado, carga uno solo', () => {
    // Compilar en el mismo sitio alcanza para que aparezcan los dos, y cargar
    // ambos registraría cada ruta dos veces.
    const elegidos = pickOneFilePerModule([
      '/m/apis/user.api.js',
      '/m/apis/user.api.ts',
    ]);

    expect(elegidos).toEqual(['/m/apis/user.api.ts']);
  });

  it('descarta las declaraciones de tipos', () => {
    // `*.api.d.ts` matchea la rama .ts del glob pero no es un módulo.
    expect(
      pickOneFilePerModule(['/m/apis/user.api.d.ts', '/m/apis/user.api.js']),
    ).toEqual(['/m/apis/user.api.js']);
  });

  it('deja pasar archivos distintos', () => {
    const elegidos = pickOneFilePerModule([
      '/m/apis/a.api.js',
      '/m/apis/b.api.js',
    ]);

    expect(elegidos).toHaveLength(2);
  });
});

describe('un módulo ya compilado, dentro de node_modules', () => {
  // Reproduce la entrega real: el autor escribió el manifiesto con globs `.ts`,
  // lo publicó compilado, y el consumidor lo tiene bajo node_modules. Antes
  // esto cargaba CERO rutas y solo dejaba un warning.
  let raiz: string;
  let paquete: string;

  beforeAll(() => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'liteb-pkg-'));
    paquete = path.join(raiz, 'node_modules/@demo/billing');
    fs.mkdirSync(path.join(paquete, 'apis'), { recursive: true });

    const lib = slash(path.join(__dirname, '../lib'));
    fs.writeFileSync(
      path.join(paquete, 'apis/charges.api.js'),
      `const { Endpoint, HttpGet, Module } = require('${lib}');

class ChargesApi extends Endpoint {
  main() {
    return { fromPackage: true };
  }
}
// Lo que emite tsc para los decoradores: aplicarlos como las funciones que son.
Module('cargos')(ChargesApi);
HttpGet('lista')(ChargesApi);

module.exports = { ChargesApi };
`,
    );
  });

  afterAll(() => {
    fs.rmSync(raiz, { recursive: true, force: true });
  });

  it('carga sus endpoints aunque el manifiesto diga .ts', async () => {
    const mod = defineModule({
      id: 'billing-pkg',
      version: '1.0.0',
      core: true,
      dir: paquete,
      // Tal cual lo escribió el autor, en TypeScript.
      routes: './apis/*.api.ts',
    });

    const readers = await loadModuleEndpoints(mod);

    expect(readers).toHaveLength(1);
    expect(readers[0].moduleName).toBe('cargos');
    expect(readers[0].pathname).toBe('lista');
  });
});
