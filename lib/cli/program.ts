import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { runBuild } from './build';
import { createProject, install } from './init';
import {
  createEndpoint,
  createEntity,
  createListener,
  createMigration,
  createModule,
  createTask,
} from './generators';
import { CliError } from './names';
import { Plan } from './plan';
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

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('liteb')
    .description('Scaffolding and builds for a liteb application.')
    .version(version());

  program
    .command('init [name]')
    .description('A project that runs: package.json, tsconfig, .env, entry point')
    .option('--skip-install', 'write the files and stop')
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

      console.log('');
      if (name) console.log(`  next     cd ${name}`);
      result.hints.forEach((hint) => console.log(`  next     ${hint}`));
    });

  const create = program
    .command('create')
    .description('Writes the shape of a module, or of something inside one.');

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
    create
      .command('module <name>')
      .description('A module: manifest, first endpoint and migrations index')
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
    create
      .command('endpoint <module/name>')
      .description('An HTTP endpoint inside a module')
      .option('--method <verb>', 'get, post, put, patch, delete, query', 'get')
      .option('--path <path>', 'path under the group, e.g. ":id"')
      .option('--group <name>', 'route prefix (@Module); defaults to the module id')
      .option('--public', 'no permission assertion'),
  ).action((target, flags) => {
    report(
      createEndpoint({
        target,
        modulesDir: flags.dir,
        from: flags.from,
        method: flags.method,
        path: flags.path,
        group: flags.group,
        permission: flags.public ? false : undefined,
      }),
      flags,
    );
  });

  common(
    create
      .command('task <module/name>')
      .description('A scheduled task, started only while the module is enabled')
      .option('--cron <expression>', 'node-cron expression', '0 7 * * *'),
  ).action((target, flags) => {
    report(
      createTask({
        target,
        modulesDir: flags.dir,
        from: flags.from,
        cron: flags.cron,
      }),
      flags,
    );
  });

  common(
    create
      .command('listener <module/name>')
      .description('A listener for an event another module announces'),
  ).action((target, flags) => {
    report(
      createListener({ target, modulesDir: flags.dir, from: flags.from }),
      flags,
    );
  });

  common(
    create
      .command('entity <module/name>')
      .description('A TypeORM entity, registered in the manifest')
      .option('--table <name>', 'table name'),
  ).action((target, flags) => {
    report(
      createEntity({
        target,
        modulesDir: flags.dir,
        from: flags.from,
        table: flags.table,
      }),
      flags,
    );
  });

  common(
    create
      .command('migration <module/name>')
      .description("A migration, added to the module's own ledger"),
  ).action((target, flags) => {
    report(
      createMigration({ target, modulesDir: flags.dir, from: flags.from }),
      flags,
    );
  });

  program
    .command('build')
    .description('Compiles the application, optionally to V8 bytecode')
    .option('--project <file>', 'tsconfig to compile with', 'tsconfig.json')
    .option('--out <dir>', 'where the build goes', 'build')
    .option('--assets <dir>', 'folder holding what was never TypeScript', 'src')
    .option('--bytecode', 'compile to .jsc and delete the readable .js')
    .option('--only <dir>', 'limit the bytecode step to this part of the output')
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
      console.log(`\nBuild at ${path.relative(process.cwd(), result.out) || '.'}`);
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
