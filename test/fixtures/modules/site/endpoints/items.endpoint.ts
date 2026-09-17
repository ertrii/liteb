import { DataJson, Endpoint, HttpGet, Module } from '../../../../../lib';

/** El mismo módulo, pero esto sí es API: conserva el prefijo. */
@Module('tienda')
@HttpGet('items')
export default class ItemsEndpoint extends Endpoint {
  main(): DataJson {
    return { items: [] };
  }
}
