import semver from 'semver';
import { EntitySchema, getMetadataArgsStorage } from 'typeorm';
import {
  MODULE_LAYOUT,
  ModuleDefinitionError,
  ModuleEntity,
  ModuleGlobField,
  ModuleManifest,
  ModuleMigrations,
  ModulePattern,
  ModulePermission,
  ResolvedModule,
} from './module-manifest';
import { readExportsSync } from './module-files';
import { isPermissionSet, PERMISSION_SET } from './declare-permissions';
import { Logger } from '../utilities/logger';

/** Lowercase, starting with a letter: `billing`, `customer-portal`. */
const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Dot-separated segments: `billing.view`, `billing.charge.cancel`. */
const PERMISSION_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9-]*)+$/;

const fail = (message: string, moduleId: string | null = null): never => {
  throw new ModuleDefinitionError(message, moduleId);
};

const toArray = (pattern: ModulePattern | undefined): string[] => {
  if (pattern === undefined) return [];
  return Array.isArray(pattern) ? pattern : [pattern];
};

/**
 * Migrations arrive either as an array or as the namespace object from
 * `import * as migrations`. Both are flattened to the array TypeORM wants.
 */
const toMigrations = (migrations: ModuleMigrations | undefined): Function[] => {
  if (migrations === undefined) return [];
  const values = Array.isArray(migrations)
    ? migrations
    : Object.values(migrations);
  return values.filter((value): value is Function => typeof value === 'function');
};

/**
 * Tells a glob from the thing itself.
 *
 * `entities` and `migrations` take either, and an array of strings is the only
 * ambiguous case. An EMPTY array is not a glob: it is an author saying this
 * module has none, which is exactly what stops the default from applying.
 */
const isGlob = (value: unknown): value is ModulePattern =>
  typeof value === 'string' ||
  (Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === 'string'));

/** What a field resolves to, and whether the author asked for it. */
interface Globs {
  patterns: string[];
  implicit: boolean;
}

/**
 * A field's globs: the manifest's, or the layout's.
 *
 * No `dir`, no default. A glob without one resolves against whatever the
 * process's working directory happens to be, and a framework scanning a folder
 * nobody pointed it at is worse than a module that mounts nothing.
 */
const globsFor = (
  field: ModuleGlobField,
  declared: ModulePattern | undefined,
  dir: string | null,
): Globs => {
  if (declared !== undefined) {
    return { patterns: toArray(declared), implicit: false };
  }
  if (!dir) return { patterns: [], implicit: false };
  return { patterns: [MODULE_LAYOUT[field]], implicit: true };
};

/** A decorated entity class or an `EntitySchema`, told apart from a helper. */
const isEntity = (value: unknown): value is ModuleEntity => {
  if (value instanceof EntitySchema) return true;
  if (typeof value !== 'function') return false;
  // TypeORM's decorators register here the moment the file is required, which
  // has just happened. An enum, a DTO or a plain class exported from the same
  // folder is not in this list.
  return getMetadataArgsStorage().tables.some((table) => table.target === value);
};

/**
 * A migration class.
 *
 * Only applied to what a GLOB found. With an explicit array or namespace the
 * author already said what these are, and second-guessing that would silently
 * drop a migration written in some way liteb did not foresee.
 */
const isMigration = (value: unknown): value is Function =>
  typeof value === 'function' &&
  typeof (value.prototype as { up?: unknown } | undefined)?.up === 'function';

/**
 * Loads what a glob points at, and says so when it points at nothing.
 *
 * The warning is only for a glob the AUTHOR wrote: a default finding nothing
 * means the module has no entities, which is an ordinary module.
 */
const loadFromGlobs = <T>(
  field: 'entities' | 'migrations',
  globs: Globs,
  dir: string | null,
  id: string,
  keep: (value: unknown) => value is T,
): T[] => {
  if (globs.patterns.length === 0) return [];

  const { files, exported } = readExportsSync(globs.patterns, dir);
  // A namespace index re-exporting the same classes is common and harmless:
  // the same class found twice is one class.
  const found = [...new Set(exported.filter(keep))];

  if (found.length === 0 && !globs.implicit) {
    Logger.warn(
      files.length === 0
        ? `Module "${id}": "${field}" (${globs.patterns.join(', ')}) matched no files. Check the glob and "dir".`
        : `Module "${id}": "${field}" matched ${files.length} file(s), none of which exports a${field === 'entities' ? 'n entity' : ' migration'}.`,
    );
  }

  return found;
};

const duplicates = (values: string[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
};

const validatePermissions = (
  permissions: ModulePermission[],
  id: string,
): void => {
  for (const permission of permissions) {
    if (!permission || typeof permission.key !== 'string') {
      fail(`Module "${id}": every permission needs a "key".`, id);
    }
    if (!PERMISSION_PATTERN.test(permission.key)) {
      fail(
        `Module "${id}": permission "${permission.key}" is not a dotted lowercase key (e.g. "${id}.view").`,
        id,
      );
    }
    // Third-party modules share one permission space; the namespace is what
    // stops two of them from claiming the same key.
    if (!permission.key.startsWith(`${id}.`)) {
      fail(
        `Module "${id}": permission "${permission.key}" must be namespaced as "${id}.<something>".`,
        id,
      );
    }
    if (!permission.label || typeof permission.label !== 'string') {
      fail(
        `Module "${id}": permission "${permission.key}" needs a non-empty "label".`,
        id,
      );
    }
  }

  const repeated = duplicates(permissions.map((p) => p.key));
  if (repeated.length > 0) {
    fail(
      `Module "${id}": duplicated permission keys: ${repeated.join(', ')}.`,
      id,
    );
  }
};

/**
 * Declares a module and validates everything that can be known without looking
 * at the other modules: shape, formats and internal duplicates. Relational
 * checks — that a dependency exists, that ids are unique, that the host version
 * satisfies `engine` — belong to the registry, which is the only one that sees
 * every module at once.
 *
 * Validating here means a malformed manifest fails when its file is imported,
 * pointing at the module that wrote it, instead of surfacing later as a
 * confusing startup error.
 *
 * Paths are the exception: with `dir`, the standard layout
 * ({@link MODULE_LAYOUT}) is where entities, migrations, endpoints, tasks and
 * listeners are found. A manifest names one of those fields only to put it
 * somewhere else, so what is left is what is particular to the module.
 *
 * @example
 * export default defineModule({
 *   id: 'billing',
 *   version: '2.1.0',
 *   dir: __dirname,
 *   requires: ['identity'],
 *   permissions: [{ key: 'billing.view', label: 'View billing' }],
 * });
 *
 * @example
 * // Same module, with its endpoints somewhere else.
 * export default defineModule({
 *   id: 'billing',
 *   version: '2.1.0',
 *   dir: __dirname,
 *   routes: './presentation/controllers/*.controller.ts',
 * });
 */
export function defineModule(manifest: ModuleManifest): ResolvedModule {
  if (!manifest || typeof manifest !== 'object') {
    fail('defineModule() expects a manifest object.');
  }

  const { id } = manifest;
  if (!id || typeof id !== 'string') {
    fail('A module needs a non-empty "id".');
  }
  if (!ID_PATTERN.test(id)) {
    fail(
      `Module id "${id}" must be lowercase, start with a letter and use dashes (e.g. "customer-portal").`,
    );
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    fail(`Module "${id}" needs a "version".`, id);
  }
  if (!semver.valid(manifest.version)) {
    fail(`Module "${id}": "${manifest.version}" is not a valid semver version.`, id);
  }

  if (manifest.engine !== undefined) {
    if (!semver.validRange(manifest.engine)) {
      fail(
        `Module "${id}": "${manifest.engine}" is not a valid semver range for "engine".`,
        id,
      );
    }
  }

  const requires = manifest.requires ?? [];
  if (!Array.isArray(requires)) {
    fail(`Module "${id}": "requires" must be an array of module ids.`, id);
  }
  for (const dependency of requires) {
    if (typeof dependency !== 'string' || !ID_PATTERN.test(dependency)) {
      fail(`Module "${id}": "${dependency}" is not a valid module id.`, id);
    }
    if (dependency === id) {
      fail(`Module "${id}" cannot require itself.`, id);
    }
  }
  const repeatedDeps = duplicates(requires);
  if (repeatedDeps.length > 0) {
    fail(
      `Module "${id}": duplicated dependencies: ${repeatedDeps.join(', ')}.`,
      id,
    );
  }

  const declared = manifest.permissions ?? [];
  // A set carries the id it was declared for, so a permissions file copied from
  // another module is caught here instead of namespacing keys under the wrong
  // owner.
  if (isPermissionSet(declared) && declared[PERMISSION_SET].moduleId !== id) {
    fail(
      `Module "${id}": these permissions were declared for "${declared[PERMISSION_SET].moduleId}". Pass "${id}" to declarePermissions().`,
      id,
    );
  }
  const permissions = isPermissionSet(declared)
    ? declared[PERMISSION_SET].entries
    : declared;
  if (!Array.isArray(permissions)) {
    fail(
      `Module "${id}": "permissions" must be an array, or a set from declarePermissions().`,
      id,
    );
  }
  validatePermissions(permissions, id);

  const provides = manifest.provides ?? [];
  if (!Array.isArray(provides)) {
    fail(`Module "${id}": "provides" must be an array.`, id);
  }
  for (const provider of provides) {
    if (!provider?.token?.id) {
      fail(`Module "${id}": every provider needs a contract token.`, id);
    }
  }
  const repeatedProvides = duplicates(provides.map((p) => p.token.id));
  if (repeatedProvides.length > 0) {
    fail(
      `Module "${id}": provides the same contract twice: ${repeatedProvides.join(', ')}.`,
      id,
    );
  }

  const consumes = manifest.consumes ?? [];
  if (!Array.isArray(consumes)) {
    fail(`Module "${id}": "consumes" must be an array.`, id);
  }
  for (const token of consumes) {
    if (!token?.id) {
      fail(`Module "${id}": every consumed entry must be a contract token.`, id);
    }
  }

  const dir = manifest.dir ?? null;

  const implicit: ModuleGlobField[] = [];
  const globs = (field: ModuleGlobField, declared?: ModulePattern): Globs => {
    const resolved = globsFor(field, declared, dir);
    if (resolved.implicit) implicit.push(field);
    return resolved;
  };

  const declaredEntities = manifest.entities;
  const entityGlobs = isGlob(declaredEntities) ? declaredEntities : undefined;
  let entities: ModuleEntity[];
  if (declaredEntities === undefined || entityGlobs !== undefined) {
    entities = loadFromGlobs(
      'entities',
      globs('entities', entityGlobs),
      dir,
      id,
      isEntity,
    );
  } else {
    // Not a glob, so it is the list itself — `isGlob` already ruled out the
    // string forms.
    const listed = declaredEntities as ModuleEntity[];
    if (!Array.isArray(listed)) {
      fail(`Module "${id}": "entities" must be an array, or a glob.`, id);
    }
    if (listed.some((entry) => typeof entry === 'string')) {
      fail(
        `Module "${id}": "entities" mixes globs with classes. It is one or the other.`,
        id,
      );
    }
    if (new Set(listed).size !== listed.length) {
      fail(`Module "${id}": the same entity is listed twice.`, id);
    }
    entities = listed;
  }

  const declaredMigrations = manifest.migrations;
  const migrationGlobs = isGlob(declaredMigrations)
    ? declaredMigrations
    : undefined;
  const migrations =
    declaredMigrations === undefined || migrationGlobs !== undefined
      ? loadFromGlobs(
          'migrations',
          globs('migrations', migrationGlobs),
          dir,
          id,
          isMigration,
        )
      : toMigrations(declaredMigrations as ModuleMigrations);

  const routes = globs('routes', manifest.routes);
  // `tasks` is the old name for the same field, and honouring it here is what
  // keeps an existing manifest working.
  const routines = globs('routines', manifest.routines ?? manifest.tasks);
  const listeners = globs('listeners', manifest.listeners);
  const providers = globs('providers', manifest.providers);

  return {
    id,
    version: manifest.version,
    label: manifest.label?.trim() || id,
    core: manifest.core ?? false,
    engine: manifest.engine ?? null,
    requires,
    dir,
    entities,
    migrations,
    routes: routes.patterns,
    routines: routines.patterns,
    listeners: listeners.patterns,
    providers: providers.patterns,
    implicit,
    contributes: manifest.contributes ?? [],
    permissions,
    provides,
    consumes,
    onInstall: manifest.onInstall ?? null,
    onEnable: manifest.onEnable ?? null,
    onDisable: manifest.onDisable ?? null,
    onUninstall: manifest.onUninstall ?? null,
  };
}
