import { IsOptional, IsString } from 'class-validator';
import { Api, Body, HttpQuery, Module } from '../../lib';

export class SearchBodyDto {
  @IsString()
  termino: string;

  @IsOptional()
  @IsString()
  ciudad?: string;
}

/**
 * HTTP QUERY method: safe and idempotent like GET, but with criteria in the
 * body (`@Body`) instead of the query string.
 */
@Module('busqueda')
@HttpQuery('clientes')
@Body(SearchBodyDto)
export class SearchCustomersApi extends Api<null, SearchBodyDto> {
  main() {
    return { buscado: this.body.termino, ciudad: this.body.ciudad ?? null };
  }
}
