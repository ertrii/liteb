import { Api } from '../templates/api';

//
// ===========================================
// KEYS
// ===========================================
//

export const MODULE = Symbol('__module__');

//
// ===========================================
// GENERAL TYPE
// ===========================================
//

export interface ModuleMetadata {
  basePath: string;
}

//
// ===========================================
// PARAMS
// ===========================================
//

export function defineModule(target: new () => Api, metadata: ModuleMetadata) {
  Reflect.defineMetadata(MODULE, metadata, target);
}

export function getModule(target: new () => Api): ModuleMetadata | undefined {
  return Reflect.getMetadata(MODULE, target);
}
