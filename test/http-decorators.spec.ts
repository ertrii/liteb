import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import ApiReader from '../lib/core/api-reader';
import {
  Api,
  HttpDelete,
  HttpGet,
  HttpPatch,
  HttpPost,
  HttpPut,
  HttpQuery,
  Module,
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

  it('el path por defecto es vacío', () => {
    expect(build((t) => HttpQuery()(t)).pathname).toBe('');
  });
});
