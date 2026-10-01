import semver from 'semver';
import { ResolvedModule } from './module-manifest';

/** A module as the installation remembers it. */
export interface ModuleState {
  id: string;
  version: string;
}

export interface ModuleInstall {
  id: string;
  version: string;
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
}

/**
 * Compares the modules present in the code against what the installation
 * recorded, and says what changed. Pure on purpose: the decision is the part
 * worth testing, and it can be reviewed without a database.
 *
 * Every module present in the code runs: there is no on and off. What limits
 * who reaches what is permissions, which is the application's policy and has
 * nothing to do with what is deployed.
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

  for (const mod of code) {
    const record = storedById.get(mod.id);

    if (!record) {
      install.push({ id: mod.id, version: mod.version });
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
  }

  const orphaned = stored.filter((record) => !codeIds.has(record.id));

  return { install, upgrade, orphaned };
}

/** Both versions are valid semver by the time they get here, but be defensive. */
function isOlder(candidate: string, current: string): boolean {
  const a = semver.valid(candidate);
  const b = semver.valid(current);
  if (!a || !b) return false;
  return semver.lt(a, b);
}
