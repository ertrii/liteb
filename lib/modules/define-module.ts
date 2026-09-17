import semver from 'semver';
import {
  ModuleDefinitionError,
  ModuleManifest,
  ModuleMigrations,
  ModulePattern,
  ModulePermission,
  ResolvedModule,
} from './module-manifest';

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
 * @example
 * export default defineModule({
 *   id: 'billing',
 *   version: '2.1.0',
 *   requires: ['identity'],
 *   entities: [Charge, Invoice],
 *   permissions: [{ key: 'billing.view', label: 'View billing' }],
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

  const permissions = manifest.permissions ?? [];
  if (!Array.isArray(permissions)) {
    fail(`Module "${id}": "permissions" must be an array.`, id);
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

  const entities = manifest.entities ?? [];
  if (!Array.isArray(entities)) {
    fail(`Module "${id}": "entities" must be an array.`, id);
  }
  if (new Set(entities).size !== entities.length) {
    fail(`Module "${id}": the same entity is listed twice.`, id);
  }

  return {
    id,
    version: manifest.version,
    label: manifest.label?.trim() || id,
    core: manifest.core ?? false,
    engine: manifest.engine ?? null,
    requires,
    dir: manifest.dir ?? null,
    entities,
    migrations: toMigrations(manifest.migrations),
    routes: toArray(manifest.routes),
    tasks: toArray(manifest.tasks),
    permissions,
    provides,
    consumes,
    onInstall: manifest.onInstall ?? null,
    onEnable: manifest.onEnable ?? null,
    onDisable: manifest.onDisable ?? null,
    onUninstall: manifest.onUninstall ?? null,
  };
}
