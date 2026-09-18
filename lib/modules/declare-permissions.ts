import type { ModulePermission } from './module-manifest';

/**
 * Carries the manifest entries without occupying a name, so no permission is
 * forbidden from being called `list`, `all` or anything else.
 */
export const PERMISSION_SET = Symbol('liteb.permissionSet');

export interface PermissionSetMeta {
  /** The module the keys are namespaced under. */
  moduleId: string;
  /** What the manifest needs: the keys with their labels. */
  entries: ModulePermission[];
}

/** A set with the symbol, whatever its keys are. Used where they do not matter. */
export interface AnyPermissionSet {
  readonly [PERMISSION_SET]: PermissionSetMeta;
}

/**
 * What {@link declarePermissions} returns: one typed property per permission,
 * holding its full key.
 */
export type PermissionSet<M extends string, T> = {
  readonly [K in keyof T & string]: `${M}.${K}`;
} & AnyPermissionSet & {
    /** Spreading it yields every key: `permissions: [...tasks]`. */
    [Symbol.iterator](): IterableIterator<string>;
  };

/**
 * Declares a module's permissions in ONE place, and hands out typed keys.
 *
 * A permission key used to be a bare string written three times over — in the
 * manifest, in the resolver that grants it, and in every endpoint that demands
 * it — with nothing tying the three together. Three chances to misspell it,
 * caught at run time at best. This makes the file that declares them the only
 * place the string is ever written:
 *
 * ```typescript
 * // src/modules/tasks/permissions.ts
 * export const permissions = declarePermissions('tasks', {
 *   view: 'View tasks',
 *   manage: 'Create and edit tasks',
 * });
 *
 * // module.ts — no second list to keep in sync
 * export default defineModule({ id: 'tasks', permissions, ... });
 *
 * // an endpoint — a typo here does not compile
 * this.auth.assert(permissions.manage);
 *
 * // the resolver — one key, or everything this module has
 * return { actor, permissions: [permissions.view] };
 * return { actor, permissions: [...permissions] };
 * ```
 *
 * The module id is passed because the file stands on its own, and it buys two
 * things: keys come out namespaced without anyone remembering the rule, and
 * `defineModule` refuses a set declared for a different module — which is what
 * a copied permissions file looks like.
 *
 * @param moduleId The module these belong to. Every key is prefixed with it.
 * @param labels Name to label. The name becomes the key after the prefix, so
 * `{ view: 'View tasks' }` in module `tasks` is the key `tasks.view`. A name
 * may carry dots for a deeper namespace: `{ 'board.export': '...' }`.
 */
export function declarePermissions<
  M extends string,
  T extends Record<string, string>,
>(moduleId: M, labels: T): PermissionSet<M, T> {
  const entries: ModulePermission[] = [];
  const set: Record<string, string> = {};

  for (const [name, label] of Object.entries(labels)) {
    const key = `${moduleId}.${name}`;
    entries.push({ key, label });
    set[name] = key;
  }

  // Non-enumerable so `Object.values(set)` is the keys and nothing else, and
  // so a set survives being logged or serialized without framework noise.
  Object.defineProperty(set, PERMISSION_SET, {
    value: { moduleId, entries } satisfies PermissionSetMeta,
    enumerable: false,
  });
  Object.defineProperty(set, Symbol.iterator, {
    value: () => entries.map((entry) => entry.key)[Symbol.iterator](),
    enumerable: false,
  });

  return Object.freeze(set) as PermissionSet<M, T>;
}

/** Whether a manifest's `permissions` came from {@link declarePermissions}. */
export function isPermissionSet(value: unknown): value is AnyPermissionSet {
  return (
    typeof value === 'object' &&
    value !== null &&
    PERMISSION_SET in (value as Record<symbol, unknown>)
  );
}
