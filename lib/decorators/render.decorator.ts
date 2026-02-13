import { Api } from '../templates/api';

export const TEMPLATE = Symbol('__template__');

export interface TemplateMetadata {
  path: string;
}

export function Template(path: string) {
  return function (target: new () => Api<any, any, any>) {
    Reflect.defineMetadata(TEMPLATE, { path } as TemplateMetadata, target);
  };
}
