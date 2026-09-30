import { token } from '../../../lib';

export interface Registrado {
  id: number;
}

/** Lo único que comparten emisor y oyente. Ninguno importa al otro. */
export const Registrado = token<Registrado>('demo.registrado', 'event');

/** Espía: el oyente escribe acá y la prueba lee. */
export const visto: { ids: number[] } = { ids: [] };
