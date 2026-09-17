import { DataSource } from 'typeorm';
import { Container, ContractError } from './container';
import { ResolvedModule } from './module-manifest';

/**
 * Builds the container from the modules that are actually active, and refuses
 * a set where something consumed is provided by nobody.
 *
 * The check runs at startup on purpose. Without it, a missing provider surfaces
 * on the first request that happens to need it — in production, on whichever
 * endpoint a user reached first. Declaring `consumes` is what buys that: the
 * framework cannot see which contracts a module calls by reading its code.
 *
 * Registration follows dependency order, so the error names the module that
 * asked before any of its dependents complicate the picture.
 */
export function buildContainer(
  modules: ResolvedModule[],
  db: DataSource,
): Container {
  const container = new Container(db);

  for (const mod of modules) {
    for (const provider of mod.provides) {
      container.register(mod.id, provider);
    }
  }

  for (const mod of modules) {
    for (const token of mod.consumes) {
      if (container.has(token)) continue;

      throw new ContractError(
        `Module "${mod.id}" consumes the contract "${token.id}", which no enabled module provides.`,
        token.id,
      );
    }
  }

  return container;
}
