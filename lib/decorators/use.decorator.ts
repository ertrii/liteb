import { MiddlewareFn, defineUse } from '../defines/use.define';
import { Api } from '../templates/api';
import { Middleware } from '../templates/middleware';

export function Use(middleware: (new () => Middleware) | MiddlewareFn) {
  return function (target: new () => Api) {
    defineUse(target, {
      middleware,
    });
  };
}
