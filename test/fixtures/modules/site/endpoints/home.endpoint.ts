import { DataJson, Endpoint, HttpGet, Module } from '../../../../../lib';

/** Una vista: vive en la raíz, no bajo el prefijo de la API. */
@Module('tienda', { basePath: '/' })
@HttpGet('inicio')
export default class HomeEndpoint extends Endpoint {
  main(): DataJson {
    return { pagina: true };
  }
}
