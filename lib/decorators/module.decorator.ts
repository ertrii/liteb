import { Group, GROUP, GroupMetadata } from './group.decorator';

/**
 * The word "module" means the INSTALLABLE UNIT in 2.x — `defineModule({ id })`,
 * `requires`, the `_modules` row, the permission namespace. This decorator
 * never meant that: it declares a URL prefix. Everything below is the old name
 * kept working while applications move to {@link Group}, and goes away in 2.0
 * final.
 */

/** @deprecated Renamed to `GROUP`. */
export const MODULE = GROUP;

/** @deprecated Renamed to {@link GroupMetadata}. */
export type ModuleMetadata = GroupMetadata;

/** @deprecated Renamed to `GroupOptions`, and its `basePath` to `mount`. */
export interface ModuleOptions {
  /** @deprecated Renamed to `mount`. */
  basePath?: string;
}

/**
 * @deprecated Renamed to {@link Group}, and the option `basePath` to `mount`.
 * `@Module('products', { basePath: '/' })` is now
 * `@Group('products', { mount: '/' })`. A group is also optional now: drop it
 * and the endpoint hangs from the module id.
 */
export function Module(name: string, options: ModuleOptions = {}) {
  return Group(name, { mount: options.basePath });
}
