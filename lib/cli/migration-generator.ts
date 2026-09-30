import path from 'path';
import type { SchemaDiff, SchemaSnapshot } from '../modules/schema-diff';
import { CliError, parseTarget, toPascal } from './names';
import { Plan, plan } from './plan';

/**
 * Where a module remembers what its schema looked like.
 *
 * Inside `migrations/` because that is what it belongs to, and in a `meta/`
 * subfolder so the `migrations/*.ts` glob never sees it. One file, not one per
 * migration: the migrations themselves are the history, and this is only the
 * baseline the next diff is taken from.
 */
export const MODULE_SNAPSHOT = 'migrations/meta/snapshot.json';

/** That path inside one module's folder. */
export const snapshotPath = (modulesDir: string, moduleId: string): string =>
  path.posix.join(modulesDir.split('\\').join('/'), moduleId, MODULE_SNAPSHOT);

export interface GenerateMigrationOptions {
  /** `<module>/<name>`. */
  target: string;
  /** What Drizzle Kit says is missing, both ways. */
  diff: SchemaDiff;
  /** What the NEXT generate compares against, written beside the migration. */
  snapshot: SchemaSnapshot;
  modulesDir?: string;
  /**
   * What the generated code imports the framework from. `liteb` everywhere
   * except inside this repository, where the demo imports `lib/` by path.
   */
  from?: string;
  /** Fixed clock, for tests. */
  now?: number;
}

/** Inside a template literal, only these two can end it early. */
const escape = (sql: string): string =>
  sql.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const statements = (queries: string[]): string =>
  queries
    .map((query) => `    await db.execute(sql.raw(\`${escape(query)}\`));`)
    .join('\n');

/**
 * Turns a module's schema diff into a migration in that module.
 *
 * The split of labour is the whole idea. Drizzle Kit compares what the module's
 * tables describe against what its last snapshot described, and writes the SQL —
 * it does that far better than anything hand-rolled, and it is the part that has
 * to be right. What it does not know is that modules exist, which is why the
 * comparison is set up per module: a diff is always this module's tables against
 * this module's snapshot, so there is no attribution to get wrong and nothing
 * from another module can be filed here by accident.
 *
 * A statement may still NAME another module's table — a foreign key points
 * somewhere — and that is correct. The constraint belongs to the module that
 * declared it, and liteb migrates in dependency order, so what it points at
 * already exists.
 *
 * Two files, always. A migration written without its snapshot means the next one
 * is generated against a schema that is already out of date, and comes out
 * trying to create what exists.
 */
export function generateMigration(options: GenerateMigrationOptions): Plan {
  const target = parseTarget(options.target, 'migration');
  const modulesDir = options.modulesDir ?? 'src/modules';
  const dir = path.posix.join(modulesDir.split('\\').join('/'), target.module);

  if (options.diff.up.length === 0) {
    throw new CliError(
      `Nothing to generate: "${target.module}" has no changes since its last migration.`,
    );
  }

  const stamp = options.now ?? Date.now();
  const className = `${toPascal(target.name)}${stamp}`;
  const from = options.from ?? 'liteb';

  const content = `import { sql } from 'drizzle-orm';
import type { Migration, Transaction } from '${from}';

export class ${className} implements Migration {
  public async up(db: Transaction): Promise<void> {
${statements(options.diff.up)}
  }

  public async down(db: Transaction): Promise<void> {
${statements(options.diff.down)}
  }
}
`;

  const hints = [
    'Read it before running it: a diff cannot tell a rename from a drop plus an add, so a renamed column comes out as losing one and gaining another — and on a table with rows, that is the data.',
    `The snapshot beside it is what the next generate compares against. Commit both: without it the next migration is written against a schema that no longer matches.`,
  ];
  if (options.diff.down.length === 0) {
    hints.push(
      'It has no statements in down(): nothing here is reversible by a diff. Write the undo, or delete the method.',
    );
  }

  return plan(
    [
      { path: `${dir}/migrations/${stamp}-${target.name}.ts`, content },
      {
        path: snapshotPath(modulesDir, target.module),
        content: `${JSON.stringify(options.snapshot, null, 2)}\n`,
      },
    ],
    [],
    hints,
  );
}
