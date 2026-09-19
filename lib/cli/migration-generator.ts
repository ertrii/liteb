import path from 'path';
import type { SchemaDiff } from '../modules/schema-diff';
import { tablesMentioned } from '../modules/schema-diff';
import { CliError, parseTarget, toPascal } from './names';
import { Plan, plan } from './plan';

export interface GenerateMigrationOptions {
  /** `<module>/<name>`. */
  target: string;
  /** What TypeORM says is missing. */
  diff: SchemaDiff;
  /** Table -> module, from each module's own entities. */
  owners: Map<string, string>;
  modulesDir?: string;
  /** Fixed clock, for tests. */
  now?: number;
}

/** Inside a template literal, only these two can end it early. */
const escape = (sql: string): string =>
  sql.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const statements = (queries: string[]): string =>
  queries.map((query) => `    await runner.query(\`${escape(query)}\`);`).join('\n');

/**
 * Turns TypeORM's diff into a migration in the module that owns what changed.
 *
 * The split of labour is the whole idea: TypeORM reads the live schema, works
 * out what the entities need and writes the SQL — it does that far better than
 * anything hand-rolled, and it is the part that has to be right. What it cannot
 * do is decide WHERE the migration goes, because it sees one schema and modules
 * do not exist for it. That part is liteb's, and it is decided from the only
 * thing that knows: which module declares which entity.
 *
 * So a diff that lands entirely in another module is REFUSED rather than filed
 * under the one you named. A migration in the wrong module runs in the wrong
 * order — after a dependency that needed it, or not at all when that module is
 * disabled — and that is discovered in production, on data that already exists.
 */
export function generateMigration(options: GenerateMigrationOptions): Plan {
  const target = parseTarget(options.target, 'migration');
  const dir = path.posix.join(
    (options.modulesDir ?? 'src/modules').split('\\').join('/'),
    target.module,
  );

  if (options.diff.up.length === 0) {
    throw new CliError(
      'Nothing to generate: the database already matches the entities.',
    );
  }

  const touched = tablesMentioned(options.diff.up, options.owners.keys());
  const foreign = touched.filter(
    (table) => options.owners.get(table) !== target.module,
  );
  const own = touched.filter(
    (table) => options.owners.get(table) === target.module,
  );

  if (own.length === 0 && foreign.length > 0) {
    const byModule = new Map<string, string[]>();
    for (const table of foreign) {
      const owner = options.owners.get(table) as string;
      byModule.set(owner, [...(byModule.get(owner) ?? []), table]);
    }
    const detail = [...byModule]
      .map(([owner, tables]) => `  ${owner}: ${tables.join(', ')}`)
      .join('\n');

    throw new CliError(
      `Nothing here belongs to "${target.module}". What changed is owned by:\n${detail}\n\n` +
        `Run it for that module instead: liteb migration:generate <module>/${target.name}`,
    );
  }

  const stamp = options.now ?? Date.now();
  const className = `${toPascal(target.name)}${stamp}`;

  const content = `import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Generated from the entities by \`liteb migration:generate\`: TypeORM compared
 * them against the live schema and wrote what closes the gap.
 *
 * READ IT BEFORE RUNNING IT. A diff cannot tell a rename from a drop and an
 * add, so a renamed column comes out as losing one and gaining another — and
 * on a table with rows, that is the data.
 */
export class ${className} implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
${statements(options.diff.up)}
  }

  public async down(runner: QueryRunner): Promise<void> {
${statements(options.diff.down)}
  }
}
`;

  const hints = [
    'Read it before running it: a rename reads as a drop plus an add, which on a table with rows is the data.',
  ];
  if (foreign.length > 0) {
    const detail = foreign
      .map((table) => `${table} (${options.owners.get(table)})`)
      .join(', ');
    hints.push(
      `It also touches tables other modules own: ${detail}. Split those out, or the module that owns them cannot be installed without this one.`,
    );
  }

  return plan([{ path: `${dir}/migrations/${stamp}-${target.name}.ts`, content }], [], hints);
}
