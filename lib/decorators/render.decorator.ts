import { Endpoint } from '../templates/endpoint';

export const TEMPLATE = Symbol('__template__');

export interface TemplateMetadata {
  path: string;
}

export function Template(path: string) {
  return function (target: new () => Endpoint<any, any, any>) {
    Reflect.defineMetadata(TEMPLATE, { path } as TemplateMetadata, target);
  };
}
