import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import ApiReader from '../lib/core/api-reader';
import {
  Api,
  Get,
  HttpDelete,
  HttpGet,
  HttpPatch,
  HttpPost,
  HttpPut,
  HttpQuery,
  Module,
  Patch,
} from '../lib';

const build = (decorate: (target: any) => void) => {
  @Module('demo')
  class Endpoint extends Api {
    main() {
      return null;
    }
  }
  decorate(Endpoint);
  return new ApiReader(Endpoint as unknown as new () => Api);
};

describe('decoradores HTTP', () => {
  it.each([
    ['get', HttpGet],
    ['post', HttpPost],
    ['put', HttpPut],
    ['delete', HttpDelete],
    ['patch', HttpPatch],
    ['query', HttpQuery],
  ])('Http* registra el verbo %s', (esperado, decorator) => {
    const reader = build((target) => decorator('ruta')(target));

    expect(reader.method).toBe(esperado);
    expect(reader.pathname).toBe('ruta');
    expect(reader.isInvalid()).toBe(false);
  });

  it('los alias deprecados son los mismos decoradores', () => {
    // Guarantees existing code keeps working unchanged.
    expect(Get).toBe(HttpGet);
    expect(Patch).toBe(HttpPatch);
  });

  it('un alias deprecado produce el mismo metadato que su equivalente Http*', () => {
    expect(build((t) => Get('vieja')(t)).method).toBe('get');
    expect(build((t) => HttpGet('nueva')(t)).method).toBe('get');
  });

  it('el path por defecto es vacío', () => {
    expect(build((t) => HttpQuery()(t)).pathname).toBe('');
  });
});
