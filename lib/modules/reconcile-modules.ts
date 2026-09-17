import semver from 'semver';
import { ResolvedModule } from './module-manifest';

/** A module as the installation remembers it. */
export interface ModuleState {
  id: string;
  version: string;
  enabled: boolean;
}

export interface ModuleInstall {
  id: string;
  version: string;
  /** Core modules arrive enabled; everything else waits to be turned on. */
  enabled: boolean;
}

export interface ModuleUpgrade {
  id: string;
  from: string;
  to: string;
  /** The code carries an older version than the one recorded. */
  downgrade: boolean;
}

/**
 * A module that is recorded but whose code is gone: an uninstalled package, a
 * renamed id, a deploy that dropped a folder. Its data is untouched.
 */
export type ModuleOrphan = ModuleState;

export interface Reconciliation {
  install: ModuleInstall[];
  upgrade: ModuleUpgrade[];
  orphaned: ModuleOrphan[];
  /** Ids that should be active, ready to hand to `resolveModules()`. */
  enabledIds: string[];
}

/**
 * Compares the modules present in the code against what the installation
 * recorded, and says what changed. Pure on purpose: the decision is the part
 * worth testing, and it can be reviewed without a database.
 *
 * Two rules shape the result:
 *
 * A module appears **disabled**, unless it is core. Shipping a release that
 * silently turns on a new package would put screens in front of an operator who
 * never asked for them — and, once packages are licensed separately, would hand
 * out something that was not paid for. Core modules have no such choice: the
 * product is not itself without them.
 *
 * A module whose code disappeared is **reported, never deleted**. Dropping the
 * row is a decision about data, and it belongs to whoever runs the install, not
 * to a boot sequence.
 */
export function reconcileModules(
  code: ResolvedModule[],
  stored: ModuleState[],
): Reconciliation {
  const storedById = new Map(stored.map((record) => [record.id, record]));
  const codeIds = new Set(code.map((mod) => mod.id));

  const install: ModuleInstall[] = [];
  const upgrade: ModuleUpgrade[] = [];
  const enabledIds: string[] = [];

  for (const mod of code) {
    const record = storedById.get(mod.id);

    if (!record) {
      install.push({ id: mod.id, version: mod.version, enabled: mod.core });
      if (mod.core) enabledIds.push(mod.id);
      continue;
    }

    if (record.version !== mod.version) {
      upgrade.push({
        id: mod.id,
        from: record.version,
        to: mod.version,
        downgrade: isOlder(mod.version, record.version),
      });
    }

    // A core module cannot stay off, even if the row says otherwise: rows get
    // edited by hand, and the system has no meaning without its core.
    if (record.enabled || mod.core) enabledIds.push(mod.id);
  }

  const orphaned = stored.filter((record) => !codeIds.has(record.id));

  return { install, upgrade, orphaned, enabledIds };
}

/** Both versions are valid semver by the time they get here, but be defensive. */
function isOlder(candidate: string, current: string): boolean {
  const a = semver.valid(candidate);
  const b = semver.valid(current);
  if (!a || !b) return false;
  return semver.lt(a, b);
}
