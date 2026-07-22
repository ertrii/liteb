import { Api } from '../templates/api';

export const PRIORITY = Symbol('__priority__');

export interface PriorityMetadata {
  number: number;
}

/**
 * Registration priority order.
 * @param number order number
 * @default 0 Everything defaults to 0
 */
export function Priority(number: number) {
  return function (target: new () => Api<any, any, any>) {
    Reflect.defineMetadata(PRIORITY, { number } as PriorityMetadata, target);
  };
}
