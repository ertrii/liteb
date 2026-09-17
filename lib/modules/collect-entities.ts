import { ModuleDefinitionError, ModuleEntity, ResolvedModule } from './module-manifest';

/**
 * Gathers the entities contributed by every module, for the DataSource.
 *
 * Note it takes **every module present in the code**, enabled or not. That is
 * deliberate: if a disabled module's entities were left out, its tables would
 * fall out of TypeORM's view and turning the module back on would be a gamble.
 * Disabling decides what *runs*, never what data exists — the tables and their
 * contents stay reachable throughout.
 *
 * The same class contributed by two modules is an error. It means one of them
 * is reaching into the other's domain, and left alone it surfaces later as a
 * confusing TypeORM failure about a duplicate table.
 */
export function collectModuleEntities(
  modules: ResolvedModule[],
): ModuleEntity[] {
  const owner = new Map<ModuleEntity, string>();
  const entities: ModuleEntity[] = [];

  for (const mod of modules) {
    for (const entity of mod.entities) {
      const previous = owner.get(entity);
      if (previous) {
        const name = (entity as { name?: string }).name ?? String(entity);
        throw new ModuleDefinitionError(
          `Entity "${name}" is declared by both "${previous}" and "${mod.id}". An entity belongs to exactly one module.`,
          mod.id,
        );
      }
      owner.set(entity, mod.id);
      entities.push(entity);
    }
  }

  return entities;
}
