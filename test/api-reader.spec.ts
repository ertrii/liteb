import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { IsInt, IsString } from 'class-validator';
import ApiReader from '../lib/core/api-reader';
import { Api, Body, Get, Module, Params, Post, Priority, Use } from '../lib';

class BodyDto {
  @IsString()
  name: string;
}

class ParamsDto {
  @IsInt()
  id: number;
}

@Module('users')
@Get('list')
class ListUsersApi extends Api {
  main() {
    return { ok: true };
  }
}

@Module('users')
@Post(':id')
@Params(ParamsDto)
@Body(BodyDto)
@Priority(1)
@Use((_req, _res, next) => next())
class CreateUserApi extends Api {
  main() {
    return { ok: true };
  }
}

/** Sin decoradores: el lector debe descartarla. */
class NakedApi extends Api {
  main() {
    return null;
  }
}

describe('ApiReader', () => {
  it('lee módulo, verbo y ruta de los decoradores', () => {
    const reader = new ApiReader(ListUsersApi);

    expect(reader.isInvalid()).toBe(false);
    expect(reader.moduleName).toBe('users');
    expect(reader.method).toBe('get');
    expect(reader.pathname).toBe('list');
  });

  it('descarta una clase sin @Module ni verbo HTTP', () => {
    expect(new ApiReader(NakedApi).isInvalid()).toBe(true);
  });

  it('detecta esquemas, middleware y prioridad', () => {
    const reader = new ApiReader(CreateUserApi);

    expect(reader.method).toBe('post');
    expect(reader.priority).toBe(1);
    expect(reader.hasSchema()).toBe(true);
    expect(reader.hasMiddleware()).toBe(true);
    expect(reader.BodySchema).toBe(BodyDto);
    expect(reader.ParamsSchema).toBe(ParamsDto);
    expect(reader.QuerySchema).toBeUndefined();
  });

  it('sin esquemas ni middleware no reporta ninguno', () => {
    const reader = new ApiReader(ListUsersApi);

    expect(reader.hasSchema()).toBe(false);
    expect(reader.hasMiddleware()).toBe(false);
  });
});
