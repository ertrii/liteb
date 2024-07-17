import { Request, Response } from 'express';
import { Middleware } from '../templates/middleware';
import { InternalError, isManagedError } from '../utilities/errors';
import { MiddlewareFn } from '../defines/use.define';

function isFunction(
  funcOrClass: (new () => Middleware) | MiddlewareFn,
): funcOrClass is MiddlewareFn {
  const propertyNames = Object.getOwnPropertyNames(funcOrClass);
  return (
    !propertyNames.includes('prototype') || propertyNames.includes('arguments')
  );
}

/**
 * Administrador de middlewares
 * @param MiddlewareConstructor
 */
export function managerMiddleware(
  MiddlewareConstructor: (new () => Middleware) | MiddlewareFn,
) {
  if (isFunction(MiddlewareConstructor)) {
    return MiddlewareConstructor;
  }

  return async function (req: Request, res: Response, next: () => void) {
    const middleware = new MiddlewareConstructor();
    middleware.request = req;
    try {
      await middleware.canContinue();
      next();
    } catch (error) {
      if (isManagedError(error)) {
        error.path = req.originalUrl;
        res.status(error.status).json(error);
        return;
      }
      const internalError = new InternalError(error);
      internalError.path = req.originalUrl;
      res.status(internalError.status).json(internalError);
    }
  };
}
