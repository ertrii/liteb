import { Api } from '../templates/api';

export const VIEW = Symbol('__view__');

export interface ViewMetadata {
  path: string;
}

export function View(path: string) {
  return function (target: new () => Api<any, any, any>) {
    Reflect.defineMetadata(VIEW, { path } as ViewMetadata, target);
  };
}
