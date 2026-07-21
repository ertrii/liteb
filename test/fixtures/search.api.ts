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
 * Método HTTP QUERY: seguro e idempotente como GET, pero con criterios en el
 * cuerpo (`@Body`) en vez del query-string.
 */
@Module('busqueda')
@HttpQuery('clientes')
@Body(SearchBodyDto)
export class SearchCustomersApi extends Api<null, SearchBodyDto> {
  main() {
    return { buscado: this.body.termino, ciudad: this.body.ciudad ?? null };
  }
}
