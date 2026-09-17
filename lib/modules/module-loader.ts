import path from 'path';
import { Glob } from 'glob';
import slash from 'slash';
import EndpointReader from '../core/endpoint-reader';
import { Endpoint } from '../templates/endpoint';
import { Listener } from '../templates/listener';
import { ON, OnMetadata } from '../decorators/on.decorator';
import type { EventToken } from './events';
import { Task } from '../templates/task';
import { ResolvedModule } from './module-manifest';
import { Logger } from '../utilities/logger';

/** A module with its endpoints already read and ordered. */
export interface LoadedModule {
  module: ResolvedModule;
  readers: EndpointReader[];
}

/**
 * Extensions a module's files may have, in the order liteb prefers them when
 * the same file exists more than once.
 *
 * `.jsc` is V8 bytecode (bytenode) and comes LAST on purpose: when a readable
 * file sits beside the compiled one, the readable one wins, so a developer
 * stepping through a module is not handed the opaque copy. The application
 * must `require('bytenode')` before `start()` — liteb does not depend on it,
 * because what a `.jsc` file is depends on the Node that produced it, and a
 * framework has no business deciding that for its consumer.
 */
const MODULE_EXTENSIONS = ['.ts', '.js', '.cjs', '.mjs', '.jsc'] as const;

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
 * Makes a glob indifferent to the extension, so ONE manifest works from source
 * and from a build.
 *
 * `routes: './apis/*.api.ts'` used to find nothing once compiled: `dir` is
 * `__dirname`, which after `tsc` points at the build output where every file
 * ends in `.js`. liteb warned and started with zero routes — an installation
 * that boots and answers 404 to everything, with one line in the log. The same
 * thing blocked a module shipped as a package, which is only ever `.js`.
 *
 * The author declares WHICH files, liteb decides the extension.
 *
 * Exported for testing.
 */
export function withModuleExtensions(pattern: string): string {
  const known = MODULE_EXTENSIONS.find((ext) => pattern.endsWith(ext));
  const base = known ? pattern.slice(0, -known.length) : pattern;
  return `${base}.{${MODULE_EXTENSIONS.map((ext) => ext.slice(1)).join(',')}}`;
}

/**
 * One file per module, when a source tree and its build sit side by side.
 *
 * Matching every extension means `user.api.ts` and `user.api.js` can both turn
 * up — compiling in place is enough — and loading both would register every
 * route twice. Type declarations are dropped for the same reason: `*.api.d.ts`
 * matches the `.ts` branch but is not a module.
 *
 * Exported for testing.
 */
export function pickOneFilePerModule(paths: string[]): string[] {
  const rank = (file: string) => {
    const index = MODULE_EXTENSIONS.findIndex((ext) => file.endsWith(ext));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  const chosen = new Map<string, string>();
  for (const file of paths) {
    if (file.endsWith('.d.ts')) continue;

    const ext = MODULE_EXTENSIONS.find((candidate) => file.endsWith(candidate));
    const key = ext ? file.slice(0, -ext.length) : file;
    const current = chosen.get(key);
    if (!current || rank(file) < rank(current)) chosen.set(key, file);
  }

  return [...chosen.values()];
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

/**
 * Every file matching the module's glob, whatever extension it ended up with.
 *
 * The `node_modules` exclusion is anchored to the module's own folder, NOT
 * global: a module installed as a package LIVES under `node_modules`, and an
 * unanchored ignore of that name would silently match none of its files.
 * Anchored, it still keeps a broad glob from descending into a nested one.
 */
async function readFiles(
  pattern: string,
  dir: string | null,
): Promise<string[]> {
  const resolved = withModuleExtensions(resolveModulePattern(pattern, dir));
  const ignore = dir ? [slash(path.join(dir, '**/node_modules/**'))] : [];

  const found: string[] = [];
  for await (const file of new Glob(slash(resolved), { ignore, absolute: true })) {
    found.push(file);
  }

  return pickOneFilePerModule(found);
}

/** Reads every export matching the module's patterns. */
async function readExports(
  patterns: string[],
  dir: string | null,
): Promise<unknown[]> {
  const found: unknown[] = [];

  for (const pattern of patterns) {
    for (const file of await readFiles(pattern, dir)) {
      const exported = await require(file);
      found.push(...Object.values(exported));
    }
  }

  return found;
}

/** Reads and orders the endpoints a module contributes. */
export async function loadModuleEndpoints(
  mod: ResolvedModule,
): Promise<EndpointReader[]> {
  if (mod.routes.length === 0) return [];
  return toEndpointReaders(await readExports(mod.routes, mod.dir), mod.id);
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

  const exported = await readExports(mod.listeners, mod.dir);

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
