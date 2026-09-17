import path from 'path';
import EndpointReader from '../core/endpoint-reader';
import PatternResolve from '../core/pattern-resolver';
import { Endpoint } from '../templates/endpoint';
import { Task } from '../templates/task';
import { ResolvedModule } from './module-manifest';
import { Logger } from '../utilities/logger';

/** A module with its endpoints already read and ordered. */
export interface LoadedModule {
  module: ResolvedModule;
  readers: EndpointReader[];
}

/**
 * Turns a module's glob into an absolute one, resolved against the module's own
 * folder rather than the process's working directory — so a module keeps
 * working wherever it is mounted from, and whatever `cwd` the process has.
 *
 * Exported for testing: path handling is where this quietly goes wrong.
 */
export function resolveModulePattern(
  pattern: string,
  dir: string | null,
): string {
  if (path.isAbsolute(pattern)) return pattern;
  return path.resolve(dir ?? process.cwd(), pattern);
}

/**
 * Keeps the classes that are actually endpoints and orders them by `@Priority`.
 *
 * A file may export more than its class — constants, helpers, types — and
 * `Reflect.getMetadata` throws on a primitive, so anything that is not an
 * `Endpoint` subclass is ignored. A class without a verb or a module is
 * discarded the same way: it is a file being written, not a startup failure.
 *
 * Pure, so the filter and the ordering can be tested without touching disk.
 */
export function toEndpointReaders(exported: unknown[]): EndpointReader[] {
  return exported
    .filter(
      (value): value is new () => Endpoint =>
        typeof value === 'function' && value.prototype instanceof Endpoint,
    )
    .map((value) => new EndpointReader(value))
    .filter((reader) => !reader.isInvalid())
    .sort(byPriority);
}

/** `@Priority` first, in ascending order; everything else keeps its place. */
function byPriority(a: EndpointReader, b: EndpointReader): number {
  if (a.priority === null && b.priority === null) return 0;
  if (a.priority === null) return 1;
  if (b.priority === null) return -1;
  return a.priority - b.priority;
}

/** Reads every export matching the module's patterns. */
async function readExports(
  patterns: string[],
  dir: string | null,
): Promise<unknown[]> {
  const found: unknown[] = [];

  for (const pattern of patterns) {
    const resolver = new PatternResolve(resolveModulePattern(pattern, dir));
    await resolver.readModule();
    if (!resolver.hasExport()) continue;
    found.push(...resolver.getModules().flat());
  }

  return found;
}

/** Reads and orders the endpoints a module contributes. */
export async function loadModuleEndpoints(
  mod: ResolvedModule,
): Promise<EndpointReader[]> {
  if (mod.routes.length === 0) return [];
  return toEndpointReaders(await readExports(mod.routes, mod.dir));
}

/** Reads the scheduled tasks a module contributes. */
export async function loadModuleTasks(
  mod: ResolvedModule,
): Promise<Array<new () => Task>> {
  if (mod.tasks.length === 0) return [];

  const exported = await readExports(mod.tasks, mod.dir);
  return exported.filter(
    (value): value is new () => Task =>
      typeof value === 'function' && value.prototype instanceof Task,
  );
}

/**
 * Loads every module in the order given, which is dependency order by the time
 * it gets here. A module that declares routes but resolves to none is reported:
 * it is almost always a wrong glob or a missing `dir`, and staying silent turns
 * that into endpoints that simply do not answer.
 */
export async function loadModules(
  modules: ResolvedModule[],
): Promise<LoadedModule[]> {
  const loaded: LoadedModule[] = [];

  for (const module of modules) {
    const readers = await loadModuleEndpoints(module);

    if (module.routes.length > 0 && readers.length === 0) {
      Logger.warn(
        `Module "${module.id}" declares routes but none were found. Check its "routes" globs and "dir".`,
      );
    }

    loaded.push({ module, readers });
  }

  return loaded;
}
