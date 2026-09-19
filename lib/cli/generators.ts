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
  if (!id) throw new CliError('A module needs a name: liteb module <name>.');

  const dir = moduleDir(options, id);
  const label = options.label ?? toPascal(id).replace(/([a-z])([A-Z])/g, '$1 $2');
  const from = relativeFrom(options.from, 2);

  const permissionsFile = `import { declarePermissions } from '${from}';

/**
 * Everything this module can gate, declared ONCE — this is where to start.
 *
 * The manifest lists these, the endpoints demand them and the application
 * grants them, all by importing from here. The key is written in one place,
 * so a typo anywhere else does not compile instead of surfacing as a 500.
 *
 * \`liteb endpoint ${id}/<name> --permission ${id}.<key>\` adds a line
 * here. The label is what a person reads on a roles screen: write it the way
 * you would say it out loud.
 */
export const permissions = declarePermissions('${id}', {
  view: 'View ${label.toLowerCase()}',
});
`;

  const manifest = `import { defineModule } from '${from}';
import { permissions } from './permissions';

/**
 * ${label}.
 *
 * The manifest is the contract between this module and the application: what
 * it owns (entities, migrations), what it exposes (routes, routines, listeners),
 * what it needs (\`requires\`, \`consumes\`) and what it lets others do
 * (\`permissions\`, \`provides\`).
 *
 * What it does NOT have is paths. The folders below are the standard layout
 * and liteb finds them from \`dir\`:
 *
 *     entities/*.entity.ts      migrations/*.ts      endpoints/*.endpoint.ts
 *     routines/*.routine.ts     listeners/*.listener.ts
 *     providers/*.provider.ts   (contracts/ and slots/ hold the tokens)
 *
 * Name a field — \`routes: './apis/*.api.ts'\` — only to say something else.
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
  // Always __dirname: this is what the layout resolves against, so the module
  // keeps working from a build, from node_modules or from bytecode.
  dir: __dirname,

  // Other modules this one refuses to start without.
  requires: [],

  // Declared in ./permissions.ts, so the keys have one home.
  permissions,
});
`;

  const endpoint = endpointSource({
    className: `${toPascal(id)}Endpoint`,
    // No `@Group`: the id is the prefix, so the scaffold does not repeat it.
    group: null,
    decorator: 'HttpGet',
    routePath: '',
    // Declared in ./permissions.ts, and asserted from the start: `init` writes
    // a resolver that grants everything, so the gate exists and is open.
    permission: { key: `${id}.view` },
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
      { path: `${dir}/permissions.ts`, content: permissionsFile },
      { path: `${dir}/module.ts`, content: manifest },
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
      {
        // Without this the module's keys stay unchecked: `assert` falls back to
        // accepting any string, and a typo goes back to being a 500.
        path: 'src/config/permissions.ts',
        append: permissionsDeclaration(id, options.modulesDir),
      },
    ],
    [
      options.optional
        ? 'It installs DISABLED (core: false): an extension is turned on on purpose.'
        : 'It is a core module: it cannot be turned off. Pass --optional for an extension that installs disabled.',
    ],
  );
}

/**
 * The permission line.
 *
 * It is LIVE, because `liteb init` writes a resolver that lets everyone
 * through: the gate is in place and open, which is the only order in which
 * closing it is a one-line change. A scaffold that ships the assertion
 * commented teaches that endpoints are ungated by default, and the day
 * somebody writes real authentication every endpoint written until then is
 * still open.
 *
 * `--public` leaves it out, for the handful that are meant to be.
 */
function permissionBlock(permission: { key: string } | null): string {
  if (!permission) return '';
  return `    // Everything this endpoint needs the caller to be allowed to do.\n    this.auth.assert('${permission.key}');\n\n`;
}

/**
 * Teaches the compiler one module's keys, by appending to the application's
 * `config/permissions.ts`.
 *
 * One `declare global` block per module, merged by TypeScript, and the import
 * is inline — so adding a module is a pure APPEND and no existing line in that
 * file ever has to be reopened.
 */
function permissionsDeclaration(id: string, modulesDir: string): string {
  const from = path.posix.relative(
    'src/config',
    `${modulesDir.replace(/\\/g, '/')}/${id}/permissions`,
  );
  // The module is reached with an inline `import(...)`, so a new block needs no
  // new import line. `PermissionsOf` cannot be: an interface may only extend an
  // identifier, so that one comes from the file's own import, which `init`
  // writes.
  return `
declare global {
  namespace LitebAuth {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Permissions
      extends PermissionsOf<
        typeof import('${from.startsWith('.') ? from : `./${from}`}').permissions
      > {}
  }
}
`;
}

function endpointSource(args: {
  className: string;
  /** `null` leaves the decorator out: the module id is already the prefix. */
  group: string | null;
  decorator: string;
  routePath: string;
  permission: { key: string } | null;
  from: string;
}): string {
  const route = args.routePath ? `'${args.routePath}'` : '';
  const assertion = permissionBlock(args.permission);
  const imports = ['DataJson', 'Endpoint', args.decorator];
  if (args.group) imports.splice(2, 0, 'Group');
  const group = args.group ? `@Group('${args.group}')\n` : '';
  return `import { ${imports.join(', ')} } from '${args.from}';

${group}@${args.decorator}(${route})
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
  /** Route prefix (`@Group`). Defaults to the module id, with no decorator. */
  group?: string;
  /**
   * A key to assert LIVE, or `false` for an endpoint with no permission line
   * at all. Left out, the key is `<module>.view` and the assertion is written
   * commented, because asserting needs an `auth` resolver and a fresh project
   * has none.
   */
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

  const asked = typeof options.permission === 'string';
  const permission =
    options.permission === false
      ? null
      : { key: asked ? (options.permission as string) : `${target.module}.view` };

  // A key that no module declares is a 500, not a 403 — on purpose, because it
  // is a typo and not a missing grant. So asking for one here has to DECLARE
  // it too, or the generator would write code that cannot run.
  const own = permission?.key.startsWith(`${target.module}.`) ?? false;
  const raw = own ? permission!.key.slice(target.module.length + 1) : '';
  // Quoted only when it has to be: a deeper namespace carries a dot.
  const name = /^[a-z][a-zA-Z0-9]*$/.test(raw) ? raw : `'${raw}'`;
  const edits =
    permission && own
      ? [
          {
            path: `${dir}/permissions.ts`,
            objectEntry: {
              after: `declarePermissions('${target.module}', {`,
              value: `  ${name}: '${permissionLabel(permission.key)}',`,
              unless: `${name}:`,
            },
          },
        ]
      : [];

  const hints = [
    'Validate what comes in with @Body(Dto) / @Params(Dto) / @Query(Dto).',
    'A literal route that a `:param` sibling would swallow needs @Priority(1); the router log shows the resulting order.',
  ];
  if (permission && !own) {
    hints.push(
      `"${permission.key}" belongs to another module, so it was not declared here. It must exist in that module's permissions or the assertion is a 500, not a 403.`,
    );
  } else if (permission && asked) {
    hints.push(
      `The label of "${permission.key}" in permissions.ts is a guess: it is what a roles screen shows, so make it read the way you would explain it.`,
    );
  } else if (permission) {
    hints.push(
      `It asserts "${permission.key}" because that is the key a module starts with. An endpoint that WRITES wants its own: pass --permission ${target.module}.<key>.`,
    );
  }

  return plan(
    [
      {
        path: `${dir}/endpoints/${target.name}.endpoint.ts`,
        content: endpointSource({
          className,
          group: options.group ?? null,
          decorator,
          routePath: options.path ?? '',
          permission,
          from: relativeFrom(options.from, 3),
        }),
      },
    ],
    edits,
    hints,
  );
}

/**
 * A first label for a permission key: last segment is the action, the rest is
 * what it acts on. `catalog.products.manage` -> "Manage catalog products".
 *
 * It is a placeholder that reads like a sentence, not a guess at intent — the
 * label is what a roles screen shows a human, so it is meant to be edited.
 */
function permissionLabel(key: string): string {
  const parts = key.split('.');
  if (parts.length < 2) return toPascal(key).replace(/([a-z])([A-Z])/g, '$1 $2');
  const action = parts[parts.length - 1];
  const subject = parts.slice(0, -1).join(' ').replace(/-/g, ' ');
  return `${action.charAt(0).toUpperCase()}${action.slice(1)} ${subject}`;
}

export interface RoutineOptions extends CommonOptions {
  target: string;
  cron?: string;
}

export function createRoutine(options: RoutineOptions): Plan {
  const target = parseTarget(options.target, 'routine');
  const dir = moduleDir(options, target.module);
  const className = `${toPascal(target.name)}Routine`;
  const cron = options.cron ?? '0 7 * * *';
  const from = relativeFrom(options.from, 3);

  const content = `import { Cron, Routine } from '${from}';

/**
 * Runs only while the module is ENABLED: turning "${target.module}" off stops
 * this schedule without touching any data.
 */
@Cron('${cron}')
export default class ${className} extends Routine {
  public async start(now: Date | 'manual' | 'init'): Promise<void> {
    // this.db, this.get(Contract) and this.emit(Event) work here exactly as in
    // an endpoint. \`now\` is a Date, or 'init' when @Cron got runOnInit.
    console.log('[${target.module}] ${target.name} ran', now);
  }
}
`;

  return plan(
    [{ path: `${dir}/routines/${target.name}.routine.ts`, content }],
    [],
    [
      `Cron expression: '${cron}' — change it in the @Cron decorator. Set a timezone there too, or it follows the server's.`,
    ],
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
 * The token belongs to the module that ANNOUNCES the event, not to this one.
 * Replace this with the real import — \`@/\` is the alias for your modules
 * folder, so it reads:
 *
 *     import { ${tokenName} } from '@/<module>/events/${target.name}.event';
 *
 * It is declared here only so the file compiles on its own.
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
    [],
    [
      'Listeners read on their own connection: emit AFTER the transaction commits, or they cannot see the rows.',
    ],
  );
}

export interface ContractOptions extends CommonOptions {
  target: string;
}

/**
 * A contract: the token and the shape, and nothing else.
 *
 * It goes in `contracts/` because it is the module's public face — the one
 * file another module imports. liteb does NOT glob that folder: a token is
 * imported by name, so there is nothing to discover. The folder is for people.
 */
export function createContract(options: ContractOptions): Plan {
  const target = parseTarget(options.target, 'contract');
  const dir = moduleDir(options, target.module);
  const name = toPascal(target.name);
  const from = relativeFrom(options.from, 3);

  const content = `import { contract } from '${from}';

/**
 * What other modules may ask "${target.module}" for — WITHOUT importing
 * anything else from it. They import this file; the implementation stays
 * private, in ./providers.
 *
 * The interface and the token share a name on purpose: TypeScript keeps types
 * and values in separate namespaces, so one import gives you both the shape
 * the compiler checks and the identity the container resolves.
 */
export interface ${name} {
  /** Rename this: it is the promise the rest of the application relies on. */
  describe(): Promise<string>;
}

export const ${name} = contract<${name}>('${target.module}.${target.name}');
`;

  return plan(
    [{ path: `${dir}/contracts/${target.name}.contract.ts`, content }],
    [],
    [
      `Answer it: liteb provider ${target.module}/${target.name}`,
      `A module that CALLS it should list it in \`consumes\`, so a missing provider stops the boot instead of the first request that needs it.`,
    ],
  );
}

export interface ProviderOptions extends CommonOptions {
  target: string;
  /** Fills an extension point instead of answering a contract. */
  slot?: string;
}

export function createProvider(options: ProviderOptions): Plan {
  const target = parseTarget(options.target, 'provider');
  const dir = moduleDir(options, target.module);
  const name = toPascal(target.name);
  const from = relativeFrom(options.from, 3);

  const fillsSlot = options.slot !== undefined;

  let tokenImport: string;
  let decorator: string;
  let token: string;
  let implemented: string;
  let body: string;

  if (fillsSlot) {
    // A slot has TWO names: the token is the collection, the interface is one
    // contribution. A contributor implements the interface and is registered
    // under the token — mixing them up does not compile, so the template must
    // not.
    const slotFile = toKebab(options.slot as string);
    token = toPascal(options.slot as string);
    implemented = token.endsWith('s') ? token.slice(0, -1) : `${token}Entry`;
    decorator = 'Contributes';
    tokenImport = `// The slot belongs to the module that OPENED it: replace <module> with the one
// that declared it. \`@/\` is the alias for your modules folder.
import { ${implemented}, ${token} } from '@/<module>/slots/${slotFile}.slot';`;
    body = `  public readonly id = '${target.name}';`;
  } else {
    token = name;
    implemented = name;
    decorator = 'Provides';
    tokenImport = `import { ${token} } from '../contracts/${target.name}.contract';`;
    body = `  public async describe(): Promise<string> {
    return '${target.module}';
  }`;
  }

  const content = `import { ${decorator}, Provider } from '${from}';
${tokenImport}

/**
 * The half the consumer never sees. Change how this works and nothing outside
 * this file moves.
 *
 * \`this.db\`, \`this.get(Contract)\`, \`this.all(Slot)\` and
 * \`this.emit(Event)\` are injected BEFORE the instance is built, so a field
 * initializer can already reach for a repository. Built the first time someone
 * asks for it, then reused.
 */
@${decorator}(${token})
export class ${name}Provider extends Provider implements ${implemented} {
  // private readonly things = this.db.getRepository(Thing);

${body}
}
`;

  return plan(
    [{ path: `${dir}/providers/${target.name}.provider.ts`, content }],
    [],
    [
      fillsSlot
        ? 'Point the import at the module that opened the slot: an extension imports the token, never the other way round.'
        : 'Nothing lists it: the folder is what registers it, and the decorator says which contract it answers.',
    ],
  );
}

export interface EventOptions extends CommonOptions {
  target: string;
}

/**
 * An event this module announces.
 *
 * It goes in `events/` next to `contracts/` and `slots/`: the three are the
 * module's public face, the only files another module imports. liteb does not
 * glob them — a token is imported by name, so there is nothing to discover.
 */
export function createEvent(options: EventOptions): Plan {
  const target = parseTarget(options.target, 'event');
  const dir = moduleDir(options, target.module);
  const name = toPascal(target.name);
  const from = relativeFrom(options.from, 3);

  const content = `import { event } from '${from}';

/**
 * Announced after it happened. "${target.module}" does not know or care who
 * reacts — that is the difference with a contract, where it would be asking
 * someone in particular to do something and waiting for the answer.
 *
 * The payload has to carry what a listener needs: listeners read on their own
 * connection, so they cannot see rows a transaction has not committed yet.
 */
export interface ${name} {
  id: number;
}

export const ${name} = event<${name}>('${target.module}.${target.name}');
`;

  return plan(
    [{ path: `${dir}/events/${target.name}.event.ts`, content }],
    [],
    [
      `Announce it: await this.emit(${name}, { id }) from an endpoint, a routine or a provider.`,
      `React to it from any module: liteb listener <module>/<name>, then import this token.`,
    ],
  );
}

export interface SlotOptions extends CommonOptions {
  target: string;
}

/**
 * An extension point this module opens for others to fill.
 *
 * Note the direction: the module that OPENS the slot is the one extensions
 * depend on. It knows nothing about who fills it, which is what lets it be
 * core while every contributor stays removable.
 */
export function createSlot(options: SlotOptions): Plan {
  const target = parseTarget(options.target, 'slot');
  const dir = moduleDir(options, target.module);
  const collection = toPascal(target.name);
  // The token names the collection, the interface names ONE contribution.
  // A trailing "s" is the usual difference; rename if it guessed wrong.
  const item = collection.endsWith('s')
    ? collection.slice(0, -1)
    : `${collection}Entry`;
  const from = relativeFrom(options.from, 3);

  const content = `import { slot } from '${from}';

/**
 * The shape of ONE contribution.
 */
export interface ${item} {
  id: string;
}

/**
 * The point itself: "${target.module}" reads whoever is installed with
 * \`this.all(${collection})\`, and an empty array is a normal answer — a slot
 * nobody filled is a feature nobody installed.
 */
export const ${collection} = slot<${item}>('${target.module}.${target.name}');
`;

  return plan(
    [{ path: `${dir}/slots/${target.name}.slot.ts`, content }],
    [],
    [
      `Read it: const filled = this.all(${collection});`,
      `Fill it from another module: liteb provider <module>/<name> --slot ${target.name}`,
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
    [],
    [
      `The table is not created by declaring it: add a migration — liteb migration ${target.module}/create-${target.name}.`,
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
    [],
    [
      'Migrations run per module, before any route is mounted. Inside a module the trailing timestamp is the order — nothing lists them.',
    ],
  );
}

/** Everything the CLI can scaffold, for the help text and for tests. */
export const GENERATORS = {
  module: createModule,
  endpoint: createEndpoint,
  routine: createRoutine,
  contract: createContract,
  provider: createProvider,
  event: createEvent,
  slot: createSlot,
  listener: createListener,
  entity: createEntity,
  migration: createMigration,
} as const;

export type { Target };
