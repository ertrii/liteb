import { Api } from '../templates/api';

export const PRIORITY = Symbol('__priority__');

export interface PriorityMetadata {
  number: number;
}

/**
 * Orden de prioridad
 * @param number número de orden
 * @default 0 Por defecto todos tienen el valor 0
 */
export function Priority(number: number) {
  return function (target: new () => Api) {
    Reflect.defineMetadata(PRIORITY, { number } as PriorityMetadata, target);
  };
}
