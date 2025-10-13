import { Request, Response } from 'express';
import { Api } from '../templates/api';
import { Middleware } from '../templates/middleware';

export const USE = Symbol('__use__');

export type MiddlewareFn = (
  req: Request,
  res: Response,
  next: () => void,
) => void;

export interface UseMetadata {
  middleware: (new () => Middleware) | MiddlewareFn;
}

export function Use(middleware: (new () => Middleware) | MiddlewareFn) {
  return function (target: new () => Api) {
    Reflect.defineMetadata(USE, { middleware } as UseMetadata, target);
  };
}
