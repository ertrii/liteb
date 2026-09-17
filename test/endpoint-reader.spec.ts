import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { IsInt, IsString } from 'class-validator';
import EndpointReader from '../lib/core/endpoint-reader';
import { Endpoint, Body, HttpGet, Module, Params, HttpPost, Priority, Use } from '../lib';

class BodyDto {
  @IsString()
  name: string;
}

class ParamsDto {
  @IsInt()
  id: number;
}

@Module('users')
@HttpGet('list')
class ListUsersApi extends Endpoint {
  main() {
    return { ok: true };
  }
}

@Module('users')
@HttpPost(':id')
@Params(ParamsDto)
@Body(BodyDto)
@Priority(1)
@Use((_req, _res, next) => next())
class CreateUserApi extends Endpoint {
  main() {
    return { ok: true };
  }
}

/** No decorators: the reader must discard it. */
class NakedApi extends Endpoint {
  main() {
    return null;
  }
}

describe('EndpointReader', () => {
  it('lee módulo, verbo y ruta de los decoradores', () => {
    const reader = new EndpointReader(ListUsersApi);

    expect(reader.isInvalid()).toBe(false);
    expect(reader.moduleName).toBe('users');
    expect(reader.method).toBe('get');
    expect(reader.pathname).toBe('list');
  });

  it('descarta una clase sin @Module ni verbo HTTP', () => {
    expect(new EndpointReader(NakedApi).isInvalid()).toBe(true);
  });

  it('detecta esquemas, middleware y prioridad', () => {
    const reader = new EndpointReader(CreateUserApi);

    expect(reader.method).toBe('post');
    expect(reader.priority).toBe(1);
    expect(reader.hasSchema()).toBe(true);
    expect(reader.hasMiddleware()).toBe(true);
    expect(reader.BodySchema).toBe(BodyDto);
    expect(reader.ParamsSchema).toBe(ParamsDto);
    expect(reader.QuerySchema).toBeUndefined();
  });

  it('sin esquemas ni middleware no reporta ninguno', () => {
    const reader = new EndpointReader(ListUsersApi);

    expect(reader.hasSchema()).toBe(false);
    expect(reader.hasMiddleware()).toBe(false);
  });
});

describe('@Module(group, { basePath })', () => {
  @Module('pages', { basePath: '/' })
  @HttpGet('home')
  class HomeEndpoint extends Endpoint {
    main() {
      return { ok: true };
    }
  }

  @Module('pages')
  @HttpGet('other')
  class OtherEndpoint extends Endpoint {
    main() {
      return { ok: true };
    }
  }

  it('recuerda dónde montar el grupo', () => {
    expect(new EndpointReader(HomeEndpoint).mountAt).toBe('/');
  });

  it('sin opción, manda el basePath de la aplicación', () => {
    // `null` y no `''`: son cosas distintas — `''` sería "montá en la raíz".
    expect(new EndpointReader(OtherEndpoint).mountAt).toBeNull();
  });
});
