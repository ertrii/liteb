import { Api } from '../templates/api';

export const VERSION = Symbol('__version__');

export interface VersionMetadata {
  version: number;
}

export function Version(version: number) {
  return function (target: new () => Api<any, any, any>) {
    Reflect.defineMetadata(VERSION, { version } as VersionMetadata, target);
  };
}
