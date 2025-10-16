import { Api } from '../templates/api';

export const MODULE = Symbol('__module__');

export interface ModuleMetadata {
  basePath: string;
}

export function Module(basePath: string) {
  return function (target: new () => Api<any, any, any>) {
    Reflect.defineMetadata(MODULE, { basePath } as ModuleMetadata, target);
  };
}
