import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { connect, loadApp } from './app-loader';
import { runBuild } from './build';
import { createProject, GitResult, initGit, install } from './init';
import {
  createEndpoint,
  createTable,
  createListener,
  createMigration,
  createModule,
  createProvider,
  createRoutine,
  createToken,
} from './generators';
import { generateMigration, snapshotPath } from './migration-generator';
import { CliError, parseTarget } from './names';
import { Plan } from './plan';
import type Liteb from '../core/liteb';
import { emptySnapshot } from '../modules/schema-diff';
import type { SchemaSnapshot } from '../modules/schema-diff';
import { apply } from './writer';

/**
 * `npx liteb ...`
 *
 * What it is for: a module is a SHAPE — a manifest, globs that must match, a
 * migrations index, permission keys namespaced by module id — and every one of
 * those is a place to be off by one convention and find out at boot, or worse,
 * not at all (a routes glob that matches nothing starts fine and answers 404).
 * The CLI writes the shape; the author writes the code.
 *
 * It deliberately does NOT know about the running application: no database, no
 * config file, no registry of what exists. It reads arguments and writes files.
 */

const version = (): string => {
  let dir = __dirname;
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (pkg.name === 'liteb') return pkg.version;
    }
    dir = path.dirname(dir);
  }
  return '2.x';
};

interface CommonFlags {
  dir: string;
  from: string;
  force?: boolean;
}

/** Writes a plan and says what happened, in the order it happened. */
function report(target: Plan, flags: CommonFlags): void {
  const result = apply(target, { root: process.cwd(), force: flags.force });

  result.created.forEach((file) => console.log(`  created  ${file}`));
  result.edited.forEach((file) => console.log(`  updated  ${file}`));
  if (result.hints.length > 0) {
    console.log('');
    result.hints.forEach((hint) => console.log(`  next     ${hint}`));
  }
}

/**
 * The snapshot a module last recorded, or the empty one.
 *
 * A module with no snapshot has never generated a migration, so its first diff
 * is against nothing — which is exactly what an empty snapshot says. A file that
 * is there but unreadable is an error, though: silently treating corruption as
 * "no history" would generate a migration that recreates every table.
 */
function readSnapshot(modulesDir: string, moduleId: string): SchemaSnapshot {
  const file = path.join(process.cwd(), snapshotPath(modulesDir, moduleId));
  if (!fs.existsSync(file)) return emptySnapshot();

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SchemaSnapshot;
  } catch (error) {
    throw new CliError(
      `${snapshotPath(modulesDir, moduleId)} is not readable JSON: ${
        (error as Error).message
      }\\nFix it, or delete it to start the history over.`,
    );
  }
}

/** What the live database is missing, for `--check`. */
async function reportDrift(app: Liteb): Promise<void> {
  const drift = await app.schemaDrift();

  console.log('');
  if (drift.length === 0) {
    console.log('  checked   the live database matches the code.');
    return;
  }
  console.log(
    `  checked   the live database is missing ${drift.length} statement(s):`,
  );
  drift.forEach((query) => console.log(`            ${query}`));
}

/** What happened with git, in the one line that follows the created files. */
function gitLine(result: GitResult): string {
  if (result.status === 'committed') {
    return 'repository created, and the scaffold is its first commit — the next diff is only your own work.';
  }
  if (result.status === 'initialized') {
    return `repository created, nothing committed: ${result.reason}`;
  }
  return `no repository: ${result.reason}`;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('liteb')
    .description('Scaffolding and builds for a liteb application.')
    .version(version());

  program
    .command('init [name]')
    .description(
      'A project that runs: package.json, tsconfig, .env, entry point',
    )
    .option('--skip-install', 'write the files and stop')
    .option('--no-git', 'do not create a repository, or the first commit')
    .option('--dir <path>', 'where modules will live', 'src/modules')
    .action((name: string | undefined, flags) => {
      const project = name ?? path.basename(process.cwd());
      // With a name, the project is a NEW folder; without one, it is this one.
      const root = name ? path.resolve(process.cwd(), name) : process.cwd();

      const result = apply(
        createProject({
          name: project,
          litebVersion: `^${version()}`,
          modulesDir: flags.dir,
        }),
        { root },
      );
      result.created.forEach((file) => console.log(`  created  ${file}`));

      if (!flags.skipInstall) {
        console.log('\nInstalling dependencies...');
        install(root);
      }

      // After the install, so the lockfile is in the first commit.
      const git = flags.git ? initGit(root) : null;

      console.log('');
      if (git) console.log(`  git      ${gitLine(git)}`);
      if (name) console.log(`  next     cd ${name}`);
      // Until the dependencies are installed, `npx liteb` would go to the
      // registry and resolve the `latest` tag — a different major, with a
      // different CLI. With them in place, the local one answers.
      if (flags.skipInstall) console.log('  next     npm install');
      result.hints.forEach((hint) => console.log(`  next     ${hint}`));
    });

  const common = (command: Command): Command =>
    command
      .option('--dir <path>', 'where modules live', 'src/modules')
      .option(
        '--from <specifier>',
        'what the generated code imports liteb from',
        'liteb',
      )
      .option('--force', 'overwrite files that already exist');

  common(
    program
      .command('module <name>')
      .description(
        'A module: its manifest, its permissions and a first endpoint',
      )
      .option('--label <text>', 'human name, for a "modules" screen')
      .option(
        '--entry <file>',
        'file holding Liteb.create({ modules: [...] })',
        'src/index.ts',
      )
      .option(
        '--optional',
        'an extension: installs DISABLED and is turned on on purpose',
      ),
  ).action((name, flags) => {
    report(
      createModule({
        name,
        modulesDir: flags.dir,
        from: flags.from,
        label: flags.label,
        entry: flags.entry,
        optional: flags.optional,
      }),
      flags,
    );
  });

  common(
    program
      .command('endpoint <module/name>')
      .description('An HTTP endpoint inside a module')
      .option('--method <verb>', 'get, post, put, patch, delete, query', 'get')
      .option('--path <path>', 'path under the group, e.g. ":id"')
      .option(
        '--group <name>',
        'route prefix (@Group); defaults to the module id',
      )
      .option(
        '--permission <key>',
        'assert this key instead of the module default, declaring it too',
      )
      .option('--public', 'no permission line at all'),
  ).action((target, flags) => {
    report(
      createEndpoint({
        target,
        modulesDir: flags.dir,
        from: flags.from,
        method: flags.method,
        path: flags.path,
        group: flags.group,
        permission: flags.public ? false : flags.permission,
      }),
      flags,
    );
  });

  common(
    program
      .command('routine <module/name>')
      .description(
        'Work on a schedule, started only while the module is enabled',
      )
      .option('--cron <expression>', 'node-cron expression', '0 7 * * *'),
  ).action((target, flags) => {
    report(
      createRoutine({
        target,
        modulesDir: flags.dir,
        from: flags.from,
        cron: flags.cron,
      }),
      flags,
    );
  });

  common(
    program
      .command('token <module/name> <kind>')
      .description(
        'What this module shares: contract (one answers), slot (many do) or event (nobody does)',
      ),
  ).action((target, kind, flags) => {
    if (kind !== 'contract' && kind !== 'slot' && kind !== 'event') {
      // The same three the runtime takes, in the same order as token(id, kind),
      // so the command reads like the call it writes.
      throw new CliError(
        `liteb token ${target} <kind>: the kind is 'contract' (exactly one provider), 'slot' (as many as are installed) or 'event' (a notification with no answer), and got "${kind}".`,
      );
    }

    report(
      createToken({ target, kind, modulesDir: flags.dir, from: flags.from }),
      flags,
    );
  });

  common(
    program
      .command('provider <module/name>')
      .description('The class that answers a contract, found by its folder')
      .option(
        '--slot <name>',
        'fill an extension point instead of answering a contract',
      ),
  ).action((target, flags) => {
    report(
      createProvider({
        target,
        modulesDir: flags.dir,
        from: flags.from,
        slot: flags.slot,
      }),
      flags,
    );
  });

  common(
    program
      .command('listener <module/name>')
      .description('Reacts to an event, without answering whoever emitted'),
  ).action((target, flags) => {
    report(
      createListener({ target, modulesDir: flags.dir, from: flags.from }),
      flags,
    );
  });

  common(
    program
      .command('table <module/name>')
      .description('A table, found by its folder')
      .option('--name <name>', 'the table name in SQL'),
  ).action((target, flags) => {
    report(
      createTable({
        target,
        modulesDir: flags.dir,
        from: flags.from,
        table: flags.name,
      }),
      flags,
    );
  });

  common(
    program
      .command('migration <module/name>')
      .description("A migration, added to the module's own ledger"),
  ).action((target, flags) => {
    report(
      createMigration({ target, modulesDir: flags.dir, from: flags.from }),
      flags,
    );
  });

  program
    .command('migration:generate <module/name>')
    .description(
      "The SQL that takes this module's schema to what its code says",
    )
    .option('--entry <file>', 'file exporting createApp()')
    .option('--dir <path>', 'where modules live', 'src/modules')
    .option('--print', 'show the SQL and write nothing')
    .option('--check', 'also report what the live database is missing')
    .option('--force', 'overwrite a file that already exists')
    .action(async (target: string, flags) => {
      const app = await loadApp({ root: process.cwd(), entry: flags.entry });
      try {
        const { module: moduleId } = parseTarget(target, 'migration');
        // No connection. The comparison is between what the module's tables say
        // and what its last snapshot said, and neither of those is in a
        // database — which is what makes writing a migration something you can
        // do with nothing running.
        const previous = readSnapshot(flags.dir, moduleId);
        const diff = await app.pendingSchema(moduleId, previous);

        if (flags.print) {
          if (diff.up.length === 0) {
            console.log(
              `Nothing to generate: "${moduleId}" has no changes since its last migration.`,
            );
          } else {
            diff.up.forEach((query) => console.log(`  ${query}`));
          }
          if (flags.check) await reportDrift(app);
          return;
        }

        report(
          generateMigration({
            target,
            diff,
            snapshot: app.snapshotOf(moduleId, previous),
            modulesDir: flags.dir,
          }),
          flags,
        );

        if (flags.check) await reportDrift(app);
      } finally {
        await app.close();
      }
    });

  program
    .command('migrate')
    .description('Runs the pending migrations of every enabled module')
    .option('--entry <file>', 'file exporting createApp()')
    .option('--dry-run', 'say what would run, change nothing')
    .action(async (flags) => {
      const app = await loadApp({ root: process.cwd(), entry: flags.entry });
      try {
        await connect(app);
        const ran = await app.migrate({ dryRun: flags.dryRun });

        if (ran.length === 0) {
          console.log(
            flags.dryRun
              ? 'Nothing pending.'
              : 'Nothing to migrate: everything already ran.',
          );
          return;
        }

        const verb = flags.dryRun ? 'pending' : 'applied';
        ran.forEach((entry) =>
          console.log(`  ${verb}  ${entry.module}:${entry.name}`),
        );
        console.log(`
${ran.length} migration(s) ${verb}.`);
      } finally {
        await app.close();
      }
    });

  program
    .command('migrate:status')
    .description('What each module declares, and what of it already ran')
    .option('--entry <file>', 'file exporting createApp()')
    .action(async (flags) => {
      const app = await loadApp({ root: process.cwd(), entry: flags.entry });
      try {
        await connect(app);
        const status = await app.migrationStatus();

        if (status.length === 0) {
          console.log('This application declares no modules.');
          return;
        }

        for (const mod of status) {
          const state = mod.enabled
            ? 'enabled'
            : 'DISABLED — its migrations do not run';
          console.log(`
${mod.module}  (${state})`);

          if (mod.migrations.length === 0) {
            // The one failure that looks identical from the database: the
            // file is written, but liteb is not looking where it landed.
            console.log(
              "  none declared  (wrote one? it goes in the module's migrations/ folder)",
            );
            continue;
          }

          for (const migration of mod.migrations) {
            console.log(
              `  ${migration.applied ? '[x]' : '[ ]'}  ${migration.name}`,
            );
          }
        }
        console.log('');
      } finally {
        await app.close();
      }
    });

  program
    .command('build')
    .description('Compiles the application, optionally to V8 bytecode')
    .option('--project <file>', 'tsconfig to compile with', 'tsconfig.json')
    .option('--out <dir>', 'where the build goes', 'build')
    .option('--assets <dir>', 'folder holding what was never TypeScript', 'src')
    .option('--bytecode', 'compile to .jsc and delete the readable .js')
    .option(
      '--only <dir>',
      'limit the bytecode step to this part of the output',
    )
    .action(async (flags) => {
      const result = await runBuild({
        root: process.cwd(),
        project: flags.project,
        out: flags.out,
        assets: flags.assets,
        bytecode: flags.bytecode,
        bytecodeDir: flags.only,
        log: (message) => console.log(message),
      });
      console.log(
        `\nBuild at ${path.relative(process.cwd(), result.out) || '.'}`,
      );
      if (flags.bytecode) {
        console.log(
          'Remember: the application must require("bytenode") before start(), and the .jsc is tied to this Node version.',
        );
      }
    });

  return program;
}

/** Entry point. Errors meant for the author print as one line, not a stack. */
export async function main(argv: string[] = process.argv): Promise<void> {
  try {
    await buildProgram().parseAsync(argv);
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`\n${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
