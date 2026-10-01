import semver from 'semver';
import { ResolvedModule } from './module-manifest';

/** Thrown when a set of modules cannot be resolved into a startup order. */
export class ModuleResolutionError extends Error {
  constructor(
    message: string,
    /** Id of the offending module, when there is a single one. */
    public moduleId: string | null = null,
  ) {
    super(message);
    this.name = 'ModuleResolutionError';
  }
}

export interface ResolveModulesOptions {
  /**
   * Host version, checked against each module's `engine` range. When omitted
   * the check is skipped, which is what tests and embedded uses want.
   */
  hostVersion?: string;
}

/**
 * Orders a set of modules so that every module comes after the ones it depends
 * on, and refuses the set when it cannot be started safely.
 *
 * It checks what only becomes visible with every module in hand — duplicate
 * ids, missing dependencies, cycles and host compatibility — while
 * `defineModule()` already checked each manifest on its own. Everything here is
 * a startup error: the process must fail before serving a request, never
 * halfway through mounting routes.
 *
 * The order is deterministic: modules with no relation between them keep the
 * order they were given, so two runs of the same installation migrate and mount
 * in the same sequence.
 */
export function resolveModules(
  modules: ResolvedModule[],
  options: ResolveModulesOptions = {},
): ResolvedModule[] {
  const byId = new Map<string, ResolvedModule>();
  for (const mod of modules) {
    if (byId.has(mod.id)) {
      throw new ModuleResolutionError(
        `Two modules share the id "${mod.id}".`,
        mod.id,
      );
    }
    byId.set(mod.id, mod);
  }

  assertHostCompatibility(modules, options.hostVersion);

  return sortByDependency(modules);
}

/**
 * A module declares the host range it supports. Checking it up front turns a
 * subtle runtime failure into a clear refusal to start.
 *
 * The comparison drops the host's prerelease tag: `2.0.0-dev.0` is checked as
 * `2.0.0`. Strict semver puts a prerelease *below* its own release, so a host
 * at `2.0.0-dev.0` would satisfy no module asking for `^2.0.0` — the whole
 * system would be unusable exactly while 2.0 is being built. A module targets
 * a host's feature set, and a prerelease of 2.0.0 already has it.
 */
function assertHostCompatibility(
  modules: ResolvedModule[],
  hostVersion: string | undefined,
): void {
  if (!hostVersion) return;

  if (!semver.valid(hostVersion)) {
    throw new ModuleResolutionError(
      `The host version "${hostVersion}" is not a valid semver version.`,
    );
  }

  const comparable = semver.coerce(hostVersion)?.version ?? hostVersion;

  for (const mod of modules) {
    if (!mod.engine) continue;
    if (!semver.satisfies(comparable, mod.engine)) {
      throw new ModuleResolutionError(
        `Module "${mod.id}" needs a host matching "${mod.engine}", but this one is "${hostVersion}".`,
        mod.id,
      );
    }
  }
}

/**
 * Depth-first topological sort. DFS over Kahn's algorithm because it can name
 * the cycle it found: "a -> b -> c -> a" is actionable, "there is a cycle" is
 * not.
 *
 * It is also what refuses a module whose dependency is not there: the edge has
 * to be followed to be sorted, so a missing one cannot slip past.
 */
function sortByDependency(modules: ResolvedModule[]): ResolvedModule[] {
  const byId = new Map(modules.map((mod) => [mod.id, mod]));
  const sorted: ResolvedModule[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const trail: string[] = [];

  const visit = (mod: ResolvedModule): void => {
    if (done.has(mod.id)) return;

    if (visiting.has(mod.id)) {
      const cycle = [...trail.slice(trail.indexOf(mod.id)), mod.id];
      throw new ModuleResolutionError(
        `Dependency cycle: ${cycle.join(' -> ')}.`,
        mod.id,
      );
    }

    visiting.add(mod.id);
    trail.push(mod.id);

    for (const dependency of mod.requires) {
      const next = byId.get(dependency);
      if (!next) {
        throw new ModuleResolutionError(
          `Module "${mod.id}" requires "${dependency}", which is not installed.`,
          mod.id,
        );
      }
      visit(next);
    }

    trail.pop();
    visiting.delete(mod.id);
    done.add(mod.id);
    sorted.push(mod);
  };

  for (const mod of modules) visit(mod);

  return sorted;
}
