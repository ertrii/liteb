import { Api } from '../templates/api';

export const GET = Symbol('__get__');
export const POST = Symbol('__post__');
export const PUT = Symbol('__put__');
export const DELETE = Symbol('__delete__');
export const PATCH = Symbol('__patch__');

export interface HTTPMetadata {
  path: string;
}

export function Get(path: string = '') {
  return function (target: new () => Api) {
    Reflect.defineMetadata(GET, { path } as HTTPMetadata, target);
  };
}

export function Post(path: string = '') {
  return function (target: new () => Api) {
    Reflect.defineMetadata(POST, { path } as HTTPMetadata, target);
  };
}

export function Put(path: string = '') {
  return function (target: new () => Api) {
    Reflect.defineMetadata(PUT, { path } as HTTPMetadata, target);
  };
}

export function Delete(path: string = '') {
  return function (target: new () => Api) {
    Reflect.defineMetadata(DELETE, { path }, target);
  };
}

export function Patch(path: string = '') {
  return function (target: new () => Api) {
    Reflect.defineMetadata(PATCH, { path }, target);
  };
}
