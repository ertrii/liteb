import { event } from '../../../../lib';

/** Contadores observables: el test espera a que las cosas pasen de verdad. */
export const beats = { count: 0, sawDb: false, sawContainer: false };

/** Lo que oyó el listener. Es la prueba de que el bus llega a la rutina. */
export const heard = { count: 0 };

export const Beat = event<{ n: number }>('heartbeat.beat');
