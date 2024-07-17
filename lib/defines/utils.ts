//
// ===========================================
// KEYS
// ===========================================

import { Api } from '../templates/api';

//
export const ORDER = Symbol('__order__');

//
// ===========================================
// GENERAL TYPES
// ===========================================
//

export interface OrderMetadata {
  number: number;
}

//
// ===========================================
// PARAMS
// ===========================================
//

export function defineOrder(target: new () => Api, metadata: OrderMetadata) {
  Reflect.defineMetadata(ORDER, metadata, target);
}

export function getOrder(target: new () => Api): OrderMetadata | undefined {
  return Reflect.getMetadata(ORDER, target);
}
