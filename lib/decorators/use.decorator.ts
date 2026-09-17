import { Request, Response } from 'express';
import { Api } from '../templates/api';

export const USE = Symbol('__use__');

export type MiddlewareFn = (
  req: Request,
  res: Response,
  next: () => void,
) => void;

export interface UseMetadata {
  middleware: MiddlewareFn;
}

export function Use(middleware: MiddlewareFn) {
  return function (target: new () => Api<any, any, any>) {
    Reflect.defineMetadata(USE, { middleware } as UseMetadata, target);
  };
}
