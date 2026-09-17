import type { DataSource, EntitySchema } from 'typeorm';
import type { Contract, Provider } from './container';

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
 * the namespace object you get from `import * as migrations from './migrations'`.
 */
export type ModuleMigrations = Function[] | Record<string, unknown>;

/** A glob (or list of globs), relative to the module folder. */
export type ModulePattern = string | string[];

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
 * Contracts, events and extension slots are not here yet — each one lands with
 * its own subsystem, so that the manifest never describes something the
 * framework cannot honor.
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
   * Folder the module's globs resolve against — pass `__dirname`.
   *
   * Without it they resolve against the process's working directory, which
   * breaks the moment a module is moved or published as a package. Explicit
   * because inferring it from the call stack is fragile and silent when wrong.
   */
  dir?: string;

  entities?: ModuleEntity[];
  migrations?: ModuleMigrations;

  /** Globs for this module's endpoints, scheduled tasks and event listeners. */
  routes?: ModulePattern;
  tasks?: ModulePattern;
  listeners?: ModulePattern;

  permissions?: ModulePermission[];

  /** Contracts this module implements for the rest of the application. */
  provides?: Provider<any>[];

  /**
   * Contracts this module calls. Optional, but declaring them turns a missing
   * provider into a refusal to start instead of a failure on the first request
   * that happens to need it.
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
  tasks: string[];
  listeners: string[];
  permissions: ModulePermission[];
  provides: Provider<any>[];
  consumes: Contract<any>[];
  onInstall: ModuleHook | null;
  onEnable: ModuleHook | null;
  onDisable: ModuleHook | null;
  onUninstall: ModuleHook | null;
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
