import { event } from '../../../lib';

export interface Registrado {
  id: number;
}

/** Lo único que comparten emisor y oyente. Ninguno importa al otro. */
export const Registrado = event<Registrado>('demo.registrado');

/** Espía: el oyente escribe acá y la prueba lee. */
export const visto: { ids: number[] } = { ids: [] };
