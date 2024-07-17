import { Request, Response } from 'express';
import { Api } from '../templates/api';
import { Middleware } from '../templates/middleware';

//
// ===========================================
// KEYS
// ===========================================
//
export const USE = Symbol('__use__');

export type MiddlewareFn = (
  req: Request,
  res: Response,
  next: () => void,
) => void;

export interface UseMetadata {
  middleware: (new () => Middleware) | MiddlewareFn;
}

export function defineUse(target: new () => Api, metadata: UseMetadata) {
  Reflect.defineMetadata(USE, metadata, target);
}

export function getUse(target: new () => Api): UseMetadata | undefined {
  return Reflect.getMetadata(USE, target);
}
