import type { DataSource } from 'typeorm';
import type { ResolvedModule } from './module-manifest';

/**
 * What the database is missing to match the entities, as SQL.
 *
 * This is TypeORM's own work: its schema builder already knows how to read the
 * live schema, compare it against the entity metadata and emit the statements
 * that close the gap — the same machinery behind `synchronize: true`, minus the
 * part where it runs them behind your back. liteb only asks the question and
 * decides where the answer is written.
 */
export interface SchemaDiff {
  /** Statements that bring the database up to the entities. */
  up: string[];
  /** Statements that undo them, already in the order they must run. */
  down: string[];
}

/**
 * Asks TypeORM what would change, without changing anything.
 *
 * The connection has to be open: the comparison reads the live schema.
 */
export async function schemaDiff(db: DataSource): Promise<SchemaDiff> {
  const sql = await db.driver.createSchemaBuilder().log();

  return {
    up: sql.upQueries.map((query) => query.query),
    // Reversed, like TypeORM's own generator: the undo of a sequence runs
    // backwards, and a `down` in build order drops a table before the
    // constraint that points at it.
    down: sql.downQueries.map((query) => query.query).reverse(),
  };
}

/**
 * Which module owns each table, from the entities each one declares.
 *
 * This is what lets a whole-database diff be filed under the module it belongs
 * to. TypeORM has no idea modules exist — it sees one schema — so the mapping
 * has to come from this side, and it comes from the only place that knows:
 * each module's own entity list.
 *
 * Call it with the connection open; table names live in the metadata TypeORM
 * builds at initialization.
 */
export function tableOwners(
  db: DataSource,
  modules: ResolvedModule[],
): Map<string, string> {
  const owners = new Map<string, string>();

  for (const mod of modules) {
    for (const entity of mod.entities) {
      const metadata = db.entityMetadatas.find(
        (candidate) => candidate.target === entity,
      );
      if (metadata) owners.set(metadata.tableName, mod.id);
    }
  }

  return owners;
}

/**
 * Which of the known tables this SQL mentions.
 *
 * It matches NAMES WE ALREADY KNOW against the text rather than parsing the
 * statements: every dialect quotes and spells DDL differently, and a parser
 * that is 95% right is worse than a lookup that says what it recognized. A
 * table liteb does not know about simply does not appear here — which is why
 * the caller treats this as evidence and not as the whole truth.
 */
export function tablesMentioned(
  sql: string[],
  known: Iterable<string>,
): string[] {
  const text = sql.join('\n');
  const found: string[] = [];

  for (const table of known) {
    // Quoted by every dialect liteb supports (`"x"`, `` `x` ``, `[x]`), and
    // bare when nothing needed quoting.
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`["\`\\[]?\\b${escaped}\\b["\`\\]]?`).test(text)) {
      found.push(table);
    }
  }

  return found;
}
