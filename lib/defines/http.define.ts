//
// ===========================================
// KEYS
// ===========================================
//

import { Api } from 'lib/templates/api';

export const GET = Symbol('__get__');
export const POST = Symbol('__post__');
export const PUT = Symbol('__put__');
export const DELETE = Symbol('__delete__');
export const PATH = Symbol('__path__');

//
// ===========================================
// GENERAL TYPE
// ===========================================
//

export interface HTTPMetadata {
  path: string;
}

//
// ===========================================
// GET
// ===========================================
//

export function defineGet(target: new () => Api, metadata: HTTPMetadata) {
  Reflect.defineMetadata(GET, metadata, target);
}

export function getGet(target: new () => Api): HTTPMetadata | undefined {
  return Reflect.getMetadata(GET, target);
}

//
// ===========================================
// POST
// ===========================================
//

export function definePost(target: new () => Api, metadata: HTTPMetadata) {
  Reflect.defineMetadata(POST, metadata, target);
}

export function getPost(target: new () => Api): HTTPMetadata | undefined {
  return Reflect.getMetadata(POST, target);
}

//
// ===========================================
// PUT
// ===========================================
//

export function definePut(target: new () => Api, metadata: HTTPMetadata) {
  Reflect.defineMetadata(PUT, metadata, target);
}

export function getPut(target: new () => Api): HTTPMetadata | undefined {
  return Reflect.getMetadata(PUT, target);
}

//
// ===========================================
// DELETE
// ===========================================
//

export function defineDelete(target: new () => Api, metadata: HTTPMetadata) {
  Reflect.defineMetadata(DELETE, metadata, target);
}

export function getDelete(target: new () => Api): HTTPMetadata | undefined {
  return Reflect.getMetadata(DELETE, target);
}

//
// ===========================================
// PATH
// ===========================================
//

export function definePath(target: new () => Api, metadata: HTTPMetadata) {
  Reflect.defineMetadata(PATH, metadata, target);
}

export function getPath(target: new () => Api): HTTPMetadata | undefined {
  return Reflect.getMetadata(PATH, target);
}

//
// ===========================================
// HTTP
// ===========================================
//

export interface HttpMetadata {
  method: 'get' | 'post' | 'put' | 'delete' | 'path';
  path: string;
}

export function getHttp(target: new () => Api): HttpMetadata | null {
  const getMtd = getGet(target);
  if (getMtd)
    return {
      method: 'get',
      path: getMtd.path,
    };

  const postMtd = getPost(target);
  if (postMtd)
    return {
      method: 'post',
      path: postMtd.path,
    };

  const putMtd = getPut(target);
  if (putMtd)
    return {
      method: 'put',
      path: putMtd.path,
    };

  const deleteMtd = getDelete(target);
  if (deleteMtd)
    return {
      method: 'delete',
      path: deleteMtd.path,
    };

  const pathMdt = getPath(target);
  if (pathMdt)
    return {
      method: 'path',
      path: pathMdt.path,
    };

  return null;
}
