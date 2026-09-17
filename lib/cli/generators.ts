import path from 'path';
import { plan, Plan } from './plan';
import {
  CliError,
  parseTarget,
  Target,
  timestamp,
  toCamel,
  toKebab,
  toPascal,
  toSnake,
} from './names';

/**
 * The templates.
 *
 * They are TypeScript strings and not `.txt` files on purpose. The 1.x CLI kept
 * its templates as assets, the build never copied them, and they drifted until
 * they generated decorators the framework no longer had — a generator nobody
 * could compile and nothing could test. Here they are part of the same build as
 * everything else, and `test/cli.spec.ts` scaffolds a module and BOOTS it, so a
 * template that stops matching the framework fails the suite.
 */

export interface CommonOptions {
  /** Where modules live, relative to the project root. */
  modulesDir: string;
  /**
   * What the generated code imports the framework from. `liteb` everywhere
   * except inside this repository, where the demo imports `lib/` by path.
   */
  from: string;
}

const HTTP_DECORATORS: Record<string, string> = {
  get: 'HttpGet',
  post: 'HttpPost',
  put: 'HttpPut',
  patch: 'HttpPatch',
  delete: 'HttpDelete',
  query: 'HttpQuery',
};

/** Where a module's folder is. */
const moduleDir = (options: CommonOptions, id: string): string =>
  path.posix.join(options.modulesDir.replace(/\\/g, '/'), id);

/** How deep a file inside a module sits, for a relative import of the demo. */
const relativeFrom = (from: string, depth: number): string =>
  from.startsWith('.') ? `${'../'.repeat(depth)}${from.replace(/^\.\//, '')}` : from;

export interface ModuleOptions extends CommonOptions {
  name: string;
  label?: string;
  /**
   * The file holding `Liteb.create({ modules: [...] })`. The module is
   * registered there, which is the step everyone forgets and which shows up as
   * "my routes are 404".
   */
  entry?: string;
  /**
   * An optional module installs DISABLED and has to be turned on. The default
   * is a core module, because the first one someone generates is part of their
   * own application, not an extension to it — and a scaffold that answers 404
   * until you find the right CLI command is a bad first five minutes.
   */
  optional?: boolean;
}

export function createModule(options: ModuleOptions): Plan {
  const id = toKebab(options.name);
  if (!id) throw new CliError('A module needs a name: liteb create module <name>.');

  const dir = moduleDir(options, id);
  const label = options.label ?? toPascal(id).replace(/([a-z])([A-Z])/g, '$1 $2');
  const from = relativeFrom(options.from, 2);
  const routeGroup = id;

  const manifest = `import { defineModule } from '${from}';
import * as migrations from './migrations';

/**
 * ${label}.
 *
 * The manifest is the contract between this module and the application: what
 * it owns (entities, migrations), what it exposes (routes, tasks, listeners),
 * what it needs (\`requires\`, \`consumes\`) and what it lets others do
 * (\`permissions\`, \`provides\`).
 */
export default defineModule({
  id: '${id}',
  version: '1.0.0',
  label: '${label}',
  // Core modules cannot be turned off. Set this to false for an extension
  // that installs disabled and is enabled on purpose.
  core: ${options.optional ? 'false' : 'true'},
  // Which versions of the HOST APPLICATION this module plugs into — the
  // \`version\` passed to Liteb.create(). Not liteb's own version.
  engine: '^1.0.0',
  // Always __dirname: every glob below resolves against it, so the module
  // keeps working from a build, from node_modules or from bytecode.
  dir: __dirname,

  // Other modules this one refuses to start without.
  requires: [],

  entities: [],
  migrations,
  routes: './endpoints/*.endpoint.ts',
  // tasks: './tasks/*.task.ts',
  // listeners: './listeners/*.listener.ts',

  permissions: [{ key: '${id}.view', label: 'View ${label.toLowerCase()}' }],
});
`;

  const migrationsIndex = `/**
 * Every migration this module owns.
 *
 * \`liteb create migration ${id}/<name>\` adds its line here; the order in this
 * file is the order they run in.
 */
export {};
`;

  const endpoint = endpointSource({
    className: `${toPascal(id)}Endpoint`,
    group: routeGroup,
    decorator: 'HttpGet',
    routePath: '',
    permission: `${id}.view`,
    from: relativeFrom(options.from, 3),
  });

  const entry = options.entry ?? 'src/index.ts';
  const variable = toCamel(id);
  const importPath = path.posix.relative(
    path.posix.dirname(entry.replace(/\\/g, '/')),
    `${dir}/module`,
  );

  return plan(
    [
      { path: `${dir}/module.ts`, content: manifest },
      { path: `${dir}/migrations/index.ts`, content: migrationsIndex },
      { path: `${dir}/endpoints/${id}.endpoint.ts`, content: endpoint },
    ],
    [
      {
        path: entry,
        arrayEntry: {
          field: 'modules',
          value: variable,
          importLine: `import ${variable} from '${importPath.startsWith('.') ? importPath : `./${importPath}`}';`,
        },
      },
    ],
    [
      options.optional
        ? 'It installs DISABLED (core: false): an extension is turned on on purpose.'
        : 'It is a core module: it cannot be turned off. Pass --optional for an extension that installs disabled.',
    ],
  );
}

function endpointSource(args: {
  className: string;
  group: string;
  decorator: string;
  routePath: string;
  permission: string | null;
  from: string;
}): string {
  const route = args.routePath ? `'${args.routePath}'` : '';
  const assertion = args.permission
    ? `    // Everything this endpoint needs the caller to be allowed to do.\n    this.auth.assert('${args.permission}');\n\n`
    : '';

  return `import { DataJson, Endpoint, Module, ${args.decorator} } from '${args.from}';

@Module('${args.group}')
@${args.decorator}(${route})
export default class ${args.className} extends Endpoint {
  public async main(): Promise<DataJson> {
${assertion}    return { ok: true };
  }
}
`;
}

export interface EndpointOptions extends CommonOptions {
  target: string;
  method?: string;
  /** Path under the group, e.g. \`:id\`. Empty means the group itself. */
  path?: string;
  /** Route prefix (`@Module`). Defaults to the module id. */
  group?: string;
  /** Permission to assert, or `false` for a public endpoint. */
  permission?: string | false;
}

export function createEndpoint(options: EndpointOptions): Plan {
  const target = parseTarget(options.target, 'endpoint');
  const method = (options.method ?? 'get').toLowerCase();
  const decorator = HTTP_DECORATORS[method];
  if (!decorator) {
    throw new CliError(
      `"${method}" is not an HTTP method liteb mounts. Use one of: ${Object.keys(HTTP_DECORATORS).join(', ')}.`,
    );
  }

  const dir = moduleDir(options, target.module);
  // `Endpoint`, never `Api`: `Api` was the 1.x base class, and a generator
  // that keeps writing the old name teaches the old framework.
  const className = `${toPascal(target.name)}Endpoint`;

  return plan(
    [
      {
        path: `${dir}/endpoints/${target.name}.endpoint.ts`,
        content: endpointSource({
          className,
          group: options.group ?? target.module,
          decorator,
          routePath: options.path ?? '',
          permission:
            options.permission === false
              ? null
              : (options.permission ?? `${target.module}.view`),
          from: relativeFrom(options.from, 3),
        }),
      },
    ],
    [],
    [
      'Validate what comes in with @Body(Dto) / @Params(Dto) / @Query(Dto).',
      'A literal route that a `:param` sibling would swallow needs @Priority(1); the router log shows the resulting order.',
    ],
  );
}

export interface TaskOptions extends CommonOptions {
  target: string;
  cron?: string;
}

export function createTask(options: TaskOptions): Plan {
  const target = parseTarget(options.target, 'task');
  const dir = moduleDir(options, target.module);
  const className = `${toPascal(target.name)}Task`;
  const cron = options.cron ?? '0 7 * * *';
  const from = relativeFrom(options.from, 3);

  const content = `import { Schedule, Task } from '${from}';

/**
 * Runs only while the module is ENABLED: turning "${target.module}" off stops
 * this cron without touching any data.
 */
@Schedule('${cron}')
export default class ${className} extends Task {
  public async start(now: Date | 'manual' | 'init'): Promise<void> {
    // this.db and this.get(Contract) work here exactly as in an endpoint.
    console.log('[${target.module}] ${target.name} ran', now);
  }
}
`;

  return plan(
    [{ path: `${dir}/tasks/${target.name}.task.ts`, content }],
    [
      {
        path: `${dir}/module.ts`,
        uncomment: "tasks: './tasks/*.task.ts',",
      },
    ],
    [`Cron expression: '${cron}' — change it in the @Schedule decorator.`],
  );
}

export interface ListenerOptions extends CommonOptions {
  target: string;
}

export function createListener(options: ListenerOptions): Plan {
  const target = parseTarget(options.target, 'listener');
  const dir = moduleDir(options, target.module);
  const className = `${toPascal(target.name)}Listener`;
  const tokenName = toPascal(target.name);
  const from = relativeFrom(options.from, 3);

  const content = `import { event, Listener, On } from '${from}';

/**
 * The token belongs to the module that ANNOUNCES the event, not to this one:
 * import it from there and delete this declaration. It is here so the file
 * compiles on its own.
 */
export const ${tokenName} = event<{ id: number }>('${target.module}.${target.name}');

/**
 * Reacting is not answering: throwing here does not fail whoever emitted, and
 * an event nobody listens to is normal. When the outcome matters to the
 * caller, that is a contract, not an event.
 */
@On(${tokenName})
export default class ${className} extends Listener<{ id: number }> {
  public async on(payload: { id: number }): Promise<void> {
    console.log('[${target.module}] ${target.name}', payload.id);
  }
}
`;

  return plan(
    [{ path: `${dir}/listeners/${target.name}.listener.ts`, content }],
    [
      {
        path: `${dir}/module.ts`,
        uncomment: "listeners: './listeners/*.listener.ts',",
      },
    ],
    [
      'Listeners read on their own connection: emit AFTER the transaction commits, or they cannot see the rows.',
    ],
  );
}

export interface EntityOptions extends CommonOptions {
  target: string;
  table?: string;
}

export function createEntity(options: EntityOptions): Plan {
  const target = parseTarget(options.target, 'entity');
  const dir = moduleDir(options, target.module);
  const className = toPascal(target.name);
  const table = options.table ?? `${toSnake(target.module)}_${toSnake(target.name)}`;

  const content = `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('${table}')
export class ${className} {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
}
`;

  return plan(
    [{ path: `${dir}/entities/${target.name}.entity.ts`, content }],
    [
      {
        path: `${dir}/module.ts`,
        arrayEntry: {
          field: 'entities',
          value: className,
          importLine: `import { ${className} } from './entities/${target.name}.entity';`,
        },
      },
    ],
    [
      `The table is not created by declaring it: add a migration — liteb create migration ${target.module}/create-${target.name}.`,
    ],
  );
}

export interface MigrationOptions extends CommonOptions {
  target: string;
  /** Injectable for tests; defaults to now. */
  now?: number;
}

export function createMigration(options: MigrationOptions): Plan {
  const target = parseTarget(options.target, 'migration');
  const dir = moduleDir(options, target.module);
  const stamp = options.now ?? timestamp();
  const className = `${toPascal(target.name)}${stamp}`;
  const file = `${stamp}-${target.name}`;

  const content = `import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The trailing timestamp is not decoration: it is what orders this migration
 * inside the module, and liteb refuses a migration class without one.
 */
export class ${className} implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(\`
      -- what this migration creates
    \`);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(\`
      -- how to undo it
    \`);
  }
}
`;

  return plan(
    [{ path: `${dir}/migrations/${file}.ts`, content }],
    [
      {
        path: `${dir}/migrations/index.ts`,
        append: `export * from './${file}';`,
      },
    ],
    [
      'Migrations run per module, in this order, before any route is mounted.',
    ],
  );
}

/** Everything `liteb create` can make, for the help text and for tests. */
export const GENERATORS = {
  module: createModule,
  endpoint: createEndpoint,
  task: createTask,
  listener: createListener,
  entity: createEntity,
  migration: createMigration,
} as const;

export type { Target };
