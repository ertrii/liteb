import EndpointReader from '../core/endpoint-reader';
import { Endpoint } from '../templates/endpoint';
import { Listener } from '../templates/listener';
import { ON, OnMetadata } from '../decorators/on.decorator';
import type { EventToken } from './events';
import { Task } from '../templates/task';
import { ResolvedModule } from './module-manifest';
import { readExports, readFiles } from './module-files';
import { Logger } from '../utilities/logger';

export {
  MODULE_EXTENSIONS,
  pickOneFilePerModule,
  resolveModulePattern,
  withModuleExtensions,
} from './module-files';

/** A module with its endpoints already read and ordered. */
export interface LoadedModule {
  module: ResolvedModule;
  readers: EndpointReader[];
}

/**
 * Keeps the classes that are actually endpoints and orders them by `@Priority`.
 *
 * A file may export more than its class — constants, helpers, types — and
 * `Reflect.getMetadata` throws on a primitive, so anything that is not an
 * `Endpoint` subclass is ignored. A class without an HTTP verb is discarded
 * the same way: it is a file being written, not a startup failure.
 *
 * Pure, so the filter and the ordering can be tested without touching disk.
 *
 * @param defaultGroup Prefix for the classes that declare no `@Group` — the
 * module id, so the decorator is only needed to say something else.
 */
export function toEndpointReaders(
  exported: unknown[],
  defaultGroup?: string,
): EndpointReader[] {
  return exported
    .filter(
      (value): value is new () => Endpoint =>
        typeof value === 'function' && value.prototype instanceof Endpoint,
    )
    .map((value) => new EndpointReader(value, defaultGroup))
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

/** Reads and orders the endpoints a module contributes. */
export async function loadModuleEndpoints(
  mod: ResolvedModule,
): Promise<EndpointReader[]> {
  if (mod.routes.length === 0) return [];
  const { exported } = await readExports(mod.routes, mod.dir);
  return toEndpointReaders(exported, mod.id);
}

/** A listener class together with the event it declared. */
export interface LoadedListener {
  token: EventToken<unknown>;
  ListenerClass: new () => Listener<unknown>;
}

/**
 * Reads the event listeners a module contributes.
 *
 * A `Listener` without `@On` is skipped rather than fatal, the same way an
 * endpoint without a verb is: it reads as a file being written, not as a broken
 * installation.
 */
export async function loadModuleListeners(
  mod: ResolvedModule,
): Promise<LoadedListener[]> {
  if (mod.listeners.length === 0) return [];

  const { exported } = await readExports(mod.listeners, mod.dir);

  return exported
    .filter(
      (value): value is new () => Listener<unknown> =>
        typeof value === 'function' && value.prototype instanceof Listener,
    )
    .map((ListenerClass) => {
      const metadata = Reflect.getMetadata(ON, ListenerClass) as OnMetadata;
      if (!metadata) {
        Logger.warn(
          `Listener ${ListenerClass.name} in module "${mod.id}" has no @On(event) and was skipped.`,
        );
        return null;
      }
      return { token: metadata.token, ListenerClass };
    })
    .filter((loaded): loaded is LoadedListener => loaded !== null);
}

/** Reads the scheduled tasks a module contributes. */
export async function loadModuleTasks(
  mod: ResolvedModule,
): Promise<Array<new () => Task>> {
  if (mod.tasks.length === 0) return [];

  const { exported } = await readExports(mod.tasks, mod.dir);
  return exported.filter(
    (value): value is new () => Task =>
      typeof value === 'function' && value.prototype instanceof Task,
  );
}

/**
 * Says why a module mounted nothing, or stays quiet when there is nothing to
 * say.
 *
 * The two cases are not the same. A glob the author WROTE that finds nothing is
 * a mistake worth a line in the log — almost always a typo or a missing `dir`,
 * and silence turns it into endpoints that simply do not answer. The default
 * glob finding nothing just means the module has no endpoints, which is a
 * perfectly ordinary module that provides a contract.
 *
 * What is worth saying in both cases is the third one: the files ARE there and
 * none of them is an endpoint. That is a class missing `extends Endpoint` or
 * its HTTP decorator, and it is invisible from the outside.
 */
async function explainEmptyRoutes(mod: ResolvedModule): Promise<void> {
  const declared = !mod.implicit.includes('routes');

  const files = (
    await Promise.all(mod.routes.map((pattern) => readFiles(pattern, mod.dir)))
  ).flat();

  if (files.length > 0) {
    Logger.warn(
      `Module "${mod.id}": ${files.length} file(s) matched its routes but none is an Endpoint with an HTTP decorator (@HttpGet, @HttpPost, ...).`,
    );
    return;
  }

  if (declared) {
    Logger.warn(
      `Module "${mod.id}" declares routes but none were found. Check its "routes" globs and "dir".`,
    );
  }
}

/**
 * Loads every module in the order given, which is dependency order by the time
 * it gets here.
 */
export async function loadModules(
  modules: ResolvedModule[],
): Promise<LoadedModule[]> {
  const loaded: LoadedModule[] = [];

  for (const module of modules) {
    const readers = await loadModuleEndpoints(module);

    if (module.routes.length > 0 && readers.length === 0) {
      await explainEmptyRoutes(module);
    }

    loaded.push({ module, readers });
  }

  return loaded;
}
