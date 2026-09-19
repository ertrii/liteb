import type { DataSource, EntitySchema } from 'typeorm';
import type { Contract } from './container';
import type { AnyPermissionSet } from './declare-permissions';

/**
 * A database entity contributed by a module: a decorated class or a TypeORM
 * `EntitySchema`.
 *
 * It matches what TypeORM's `entities` option accepts, minus the string glob —
 * a module declares its own entities, it does not go looking for them. Keeping
 * it wider (`object`) made `collectModuleEntities()` unassignable to a
 * DataSource the application builds itself, which is a supported path.
 */
export type ModuleEntity = Function | EntitySchema<any>;

/**
 * Migrations contributed by a module. Either an array of migration classes or
 * the namespace object from `import * as migrations`. Normally neither: they
 * are found in the module's `migrations/` folder.
 */
export type ModuleMigrations = Function[] | Record<string, unknown>;

/** A glob (or list of globs), relative to the module folder. */
export type ModulePattern = string | string[];

/** The fields a module describes with globs. */
export type ModuleGlobField =
  | 'entities'
  | 'migrations'
  | 'routes'
  | 'routines'
  | 'listeners'
  | 'providers';

/**
 * Where liteb looks when the manifest says nothing.
 *
 * A module that keeps this layout declares none of these fields, which is the
 * whole point: the manifest is then only what is particular to the module —
 * its id, what it needs, what it exposes — and not a list of paths that are
 * the same in every module ever written.
 *
 * Naming a field is how you say something else. It replaces the default for
 * that field only, and the rest keep working.
 *
 * All of them need `dir`. Without it a glob resolves against whatever the
 * process's working directory happens to be, so liteb applies no default
 * rather than scanning a folder it was never pointed at.
 */
export const MODULE_LAYOUT: Readonly<Record<ModuleGlobField, string>> = {
  entities: './entities/*.entity.ts',
  migrations: './migrations/*.ts',
  routes: './endpoints/*.endpoint.ts',
  routines: './routines/*.routine.ts',
  listeners: './listeners/*.listener.ts',
  providers: './providers/*.provider.ts',
};

/**
 * A permission declared by the module that uses it.
 *
 * The key MUST be namespaced with the module id (`billing.view`, not `view`).
 * Third-party modules share one permission space, and the namespace is what
 * keeps two of them from claiming the same key.
 */
export interface ModulePermission {
  key: string;
  label: string;
}

/** What a lifecycle hook receives. */
export interface ModuleContext {
  /** The running DataSource, with every enabled module's entities registered. */
  db: DataSource;
}

export type ModuleHook = (ctx: ModuleContext) => void | Promise<void>;

/**
 * What a module declares about itself. This is the module's public face: the
 * registry reads it to resolve dependencies, run migrations and mount routes,
 * and it is readable without evaluating any decorator.
 *
 * Every field here is honored by a subsystem that exists: the manifest never
 * describes something the framework cannot do.
 */
export interface ModuleManifest {
  /** Unique id: lowercase, digits and dashes (`billing`, `customer-portal`). */
  id: string;

  /** The module's own version, independent from the host's. Semver. */
  version: string;

  /** Human-readable name, shown wherever modules are listed. */
  label?: string;

  /** A core module cannot be disabled or uninstalled. Defaults to `false`. */
  core?: boolean;

  /**
   * Host version range this module supports, e.g. `^3.0.0`. Checked at startup:
   * an incompatible module refuses to load instead of failing halfway through.
   */
  engine?: string;

  /** Ids of the modules this one needs. Resolved in topological order. */
  requires?: string[];

  /**
   * Folder the module lives in — pass `__dirname`.
   *
   * Everything liteb finds by itself is found from here: the standard layout
   * ({@link MODULE_LAYOUT}) and any glob the manifest declares. Without it
   * there is nothing to resolve against — paths would land on whatever the
   * process's working directory happens to be — so liteb looks for nothing at
   * all, and a module with no `dir` has to list its entities by hand.
   *
   * Explicit because inferring it from the call stack is fragile and silent
   * when wrong.
   */
  dir?: string;

  /**
   * The classes, or a glob that finds them. Defaults to
   * `./entities/*.entity.ts`.
   *
   * A glob is read when the manifest is — the same moment an `import` at the
   * top of this file would have been — so the DataSource still gets the full
   * list before it is built. Only decorated entities and `EntitySchema`s are
   * kept: an enum or a helper living in the same folder is ignored.
   *
   * An explicit `[]` means the module has no entities, and no default applies.
   */
  entities?: ModuleEntity[] | ModulePattern;

  /**
   * The migration classes, the namespace object from `import * as migrations`,
   * or a glob. Defaults to `./migrations/*.ts`.
   *
   * Order never comes from this field: it is the timestamp at the end of each
   * class name, which is why a glob loses nothing.
   */
  migrations?: ModuleMigrations | ModulePattern;

  /**
   * Globs for this module's endpoints, scheduled routines and event listeners.
   * Default to `./endpoints/*.endpoint.ts`, `./routines/*.routine.ts` and
   * `./listeners/*.listener.ts`.
   */
  routes?: ModulePattern;
  routines?: ModulePattern;
  listeners?: ModulePattern;

  /**
   * Glob for this module's `Provider` classes — what it answers for a contract
   * and what it contributes to someone else's extension point. Defaults to
   * `./providers/*.provider.ts`.
   *
   * There is no folder for the CONTRACTS themselves: a token is imported by
   * name, so there is nothing to discover. `contracts/` is still where they
   * go, and `liteb contract` writes them there — it is a convention for
   * people, not a glob.
   */
  providers?: ModulePattern;

  /**
   * What this module can gate. Either the entries, or a set built with
   * `declarePermissions()` — which keeps the keys in one place and hands out
   * typed ones to the endpoints and the resolver.
   */
  permissions?: ModulePermission[] | AnyPermissionSet;

  /**
   * Contracts this module calls.
   *
   * A declaration, not logic, which is why it belongs here: it turns a missing
   * provider into a refusal to start instead of a failure on the first request
   * that happens to need it. liteb cannot see which contracts a module calls
   * by reading its code.
   */
  consumes?: Contract<any>[];

  onInstall?: ModuleHook;
  onEnable?: ModuleHook;
  onDisable?: ModuleHook;
  onUninstall?: ModuleHook;
}

/**
 * A validated manifest with every default applied, which is what the registry
 * consumes. Optional collections become empty ones, so nothing downstream has
 * to guard against `undefined`.
 */
export interface ResolvedModule {
  id: string;
  version: string;
  label: string;
  core: boolean;
  engine: string | null;
  requires: string[];
  dir: string | null;
  entities: ModuleEntity[];
  migrations: Function[];
  routes: string[];
  routines: string[];
  listeners: string[];
  providers: string[];
  permissions: ModulePermission[];
  consumes: Contract<any>[];
  onInstall: ModuleHook | null;
  onEnable: ModuleHook | null;
  onDisable: ModuleHook | null;
  onUninstall: ModuleHook | null;

  /**
   * Fields that came from {@link MODULE_LAYOUT} instead of the manifest.
   *
   * What it is for: a glob the author wrote and that finds nothing is a
   * mistake worth reporting; a default that finds nothing just means the
   * module has no endpoints, or no routines, and reporting it would be noise on
   * every boot.
   */
  implicit: ModuleGlobField[];
}

/** Thrown when a manifest is malformed. Always a startup-time error. */
export class ModuleDefinitionError extends Error {
  constructor(
    message: string,
    /** Id of the offending module, when it could be read. */
    public moduleId: string | null = null,
  ) {
    super(message);
    this.name = 'ModuleDefinitionError';
  }
}
