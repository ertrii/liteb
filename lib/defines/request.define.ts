import { Flow } from '../templates/flow';

//
// ===========================================
// KEYS
// ===========================================
//

export const PARAMS = Symbol('__params__');
export const BODY = Symbol('__body__');
export const QUERY = Symbol('__query__');

//
// ===========================================
// GENERAL TYPES
// ===========================================
//

export interface RequestMetadata {
  Schema: new () => Record<string, any>;
}

//
// ===========================================
// PARAMS
// ===========================================
//

export function defineParams(
  target: new () => Flow,
  metadata: RequestMetadata,
) {
  Reflect.defineMetadata(PARAMS, metadata, target);
}

export function getParams(target: new () => Flow): RequestMetadata | undefined {
  return Reflect.getMetadata(PARAMS, target);
}

//
// ===========================================
// BODY
// ===========================================
//

export function defineBody(target: new () => Flow, metadata: RequestMetadata) {
  Reflect.defineMetadata(BODY, metadata, target);
}

export function getBody(target: new () => Flow): RequestMetadata | undefined {
  return Reflect.getMetadata(BODY, target);
}

//
// ===========================================
// QUERY
// ===========================================
//

export function defineQuery(target: new () => Flow, metadata: RequestMetadata) {
  Reflect.defineMetadata(QUERY, metadata, target);
}

export function getQuery(target: new () => Flow): RequestMetadata | undefined {
  return Reflect.getMetadata(QUERY, target);
}
