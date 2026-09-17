import { Endpoint } from '../templates/endpoint';

export const MODULE = Symbol('__module__');

export interface ModuleMetadata {
  /** The group every endpoint of this class hangs from. */
  basePath: string;
  /**
   * Replaces the application's `basePath` for this group. `null` means "use
   * the application's".
   */
  mountAt: string | null;
}

export interface ModuleOptions {
  /**
   * Where this group hangs from, instead of the application's `basePath`.
   *
   * An application that serves pages AND an API cannot use one prefix for
   * both: `/api/products/page` is a URL nobody would link to. The API keeps
   * the application's prefix; the pages declare their own.
   *
   * `'/'` (or `''`) mounts at the site root.
   */
  basePath?: string;
}

/**
 * Declares the route group of an endpoint.
 *
 * @param basePath The group: `@Module('products')` + `@HttpGet(':id')` answers
 * at `<app basePath>/products/:id`.
 * @param options `basePath` overrides the application's prefix for this group.
 *
 * @example
 * @Module('products')                          // /api/products
 * @Module('products', { basePath: '/' })       // /products
 * @Module('checkout', { basePath: '/shop' })   // /shop/checkout
 */
export function Module(basePath: string, options: ModuleOptions = {}) {
  return function (target: new () => Endpoint<any, any, any>) {
    Reflect.defineMetadata(
      MODULE,
      { basePath, mountAt: options.basePath ?? null } as ModuleMetadata,
      target,
    );
  };
}
