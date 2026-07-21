import { Api, Get, Module } from '../../lib';

@Module('saludo')
@Get('hola')
export class HelloApi extends Api {
  main() {
    return { ok: true, msg: 'ruta viva' };
  }
}

/** Extra export on purpose: the reader must ignore it without crashing. */
export const NO_ES_UNA_API = { cualquier: 'cosa' };
