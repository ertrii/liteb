import { Endpoint } from '../templates/endpoint';

export const MODULE = Symbol('__module__');

export interface ModuleMetadata {
  basePath: string;
}

export function Module(basePath: string) {
  return function (target: new () => Endpoint<any, any, any>) {
    Reflect.defineMetadata(MODULE, { basePath } as ModuleMetadata, target);
  };
}
