import { Api, Get, Module } from '../../lib';

@Module('saludo')
@Get('hola')
export class HelloApi extends Api {
  main() {
    return { ok: true, msg: 'ruta viva' };
  }
}

/** Export extra a propósito: el lector debe ignorarlo sin reventar. */
export const NO_ES_UNA_API = { cualquier: 'cosa' };
