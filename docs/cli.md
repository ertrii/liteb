# The liteb CLI

Everything `liteb` writes, and nothing else. For what the framework *does* with
what it writes, see [the guide](./guide.md).

The CLI does two things and refuses to do more: it writes files, and it runs
builds and migrations.

The generators know nothing about your application — no database, no config
file, no registry of what exists. They read arguments and write files. The four
that DO reach the database (`migrate`, `migrate:status`, `migration:generate`,
and nothing else) get there the same way: they import your entry point and ask
it for the application, which already knows where its data lives.

```bash
npx liteb@alpha init my-app     # the only time you need @alpha
cd my-app
npx liteb module billing
npm run dev
```

After `init`, liteb is installed in the project, so `npx liteb` resolves the
local binary. The `@alpha` tag is only for the very first call: without it
`npx liteb` fetches the `latest` tag, which is a different major with a
different CLI.

---

## At a glance

| Command | What it writes or does |
| --- | --- |
| [`init [name]`](#liteb-init-name) | A project that runs: `package.json`, `tsconfig.json`, `.env`, entry point |
| [`module <name>`](#liteb-module-name) | A module: its manifest, its permissions and a first endpoint |
| [`endpoint <module>/<name>`](#liteb-endpoint-modulename) | An HTTP endpoint |
| [`routine <module>/<name>`](#liteb-routine-modulename) | Work on a schedule |
| [`entity <module>/<name>`](#liteb-entity-modulename) | A TypeORM entity |
| [`migration <module>/<name>`](#liteb-migration-modulename) | A timestamped migration |
| [`migration:generate <module>/<name>`](#liteb-migrationgenerate-modulename) | The same, written from your entities by TypeORM |
| [`contract <module>/<name>`](#liteb-contract-modulename) | A capability this module publishes |
| [`provider <module>/<name>`](#liteb-provider-modulename) | The class that answers it |
| [`event <module>/<name>`](#liteb-event-modulename) | Something this module announces |
| [`slot <module>/<name>`](#liteb-slot-modulename) | An extension point others may fill |
| [`listener <module>/<name>`](#liteb-listener-modulename) | A reaction to an event |
| [`migrate`](#liteb-migrate) | Runs the pending migrations |
| [`migrate:status`](#liteb-migratestatus) | What each module declares, and what already ran |
| [`build`](#liteb-build) | Compiles, optionally to V8 bytecode |

Every `create` command takes the same three flags:

| Flag | Default | What it is |
| --- | --- | --- |
| `--dir <path>` | `src/modules` | where modules live |
| `--from <specifier>` | `liteb` | what the generated code imports liteb from |
| `--force` | off | overwrite files that already exist |

`--from` exists for a repository that vendors liteb instead of installing it:
pass `--from ../../lib` and the generated imports point there. Everyone else
leaves it alone.

---

## Why most commands edit nothing

A generator writes its file and stops. There is no list in `module.ts` to keep
in sync, because **the folder is what registers the file**:

```
billing/
├── module.ts                   ← only the wiring
├── permissions.ts
├── entities/*.entity.ts        migrations/*.ts
├── endpoints/*.endpoint.ts     routines/*.routine.ts     listeners/*.listener.ts
├── providers/*.provider.ts
└── contracts/*.contract.ts     events/*.event.ts         slots/*.slot.ts
```

The first two rows are globs liteb reads at boot. The last row is not: a token
is imported by name, so there is nothing to discover — those folders exist so
you can find them, and the CLI is what keeps them consistent.

Only two edits touch a file the generator did not write, and both have a shape
certain enough to do without parsing TypeScript:

- `create module` adds the module to `modules: [ ]` in `src/index.ts`, and
  appends a block to `src/config/permissions.ts`.
- `create endpoint --permission` adds the key to the module's
  `declarePermissions({ ... })`.

Anything less certain is printed as an instruction instead. A scaffolder that
silently mangles a file you wrote is worse than one that tells you what to add.

---

## `liteb init [name]`

```bash
npx liteb@alpha init my-app                 # into ./my-app
npx liteb@alpha init                        # into the current folder
npx liteb@alpha init my-app --skip-install  # write the files, run npm install yourself
npx liteb@alpha init my-app --dir src/bc    # modules live somewhere else
```

| Flag | Effect |
| --- | --- |
| `--skip-install` | write the files and stop |
| `--dir <path>` | where modules will live (default `src/modules`) |

Writes:

```
package.json          scripts, and the dependencies the framework needs
tsconfig.json         the two decorator flags, and the @/ alias
.env  .env.template   NODE_ENV, ports, CORS origins, database
.gitignore
src/index.ts          createApp() separated from main()
src/config/permissions.ts
src/config/auth.ts
```

Three things in there are worth knowing about, because getting any of them
wrong costs an evening.

**The decorator flags.** `experimentalDecorators` and `emitDecoratorMetadata`.
Remove either and every route and every entity becomes a silent no-op —
nothing fails, nothing answers.

**`strictPropertyInitialization: false`.** TypeORM entities and validated DTOs
declare fields the constructor never assigns; the ORM fills them. With the flag
on, every one of them is an error.

**`createApp()` is separated from `main()`**, and `main()` only runs under
`if (require.main === module)`. Importing the entry file must not start a
server — that is what lets a test, a script and `liteb migrate` build the
application without listening on a port.

**Permissions and `auth` are written, not commented.** `src/config/auth.ts`
holds a resolver that lets **everyone** through with every permission, and
`src/index.ts` passes it. That is not authentication — it is what makes
`this.auth`, `this.auth.assert(...)` and the compiler-checked permission keys
all work on the first request, so replacing it later is one file and not a
migration of every endpoint you wrote in the meantime. It says so in the log,
once, the first time it lets a request through.

`src/config/permissions.ts` starts with its `declare global` block already
open. It is empty until the first module; `liteb module` appends one
block per module and interface merging joins them, so no line in that file is
ever reopened.

It also wires three things every backend ends up needing, so they are not a
task for later:

| | Where |
| --- | --- |
| **Health check** | `/health` |
| **API docs** | `/docs`, spec at `/docs.json` |
| **Log files** | `logs/` — `app`, `info`, `warn`, `error`, `router` |

All three are **on**, in every environment. Turning one off is a decision you
make looking at `src/index.ts`, not one that comes made from the factory and
surprises you the first time you deploy.

**`/health`** answers 200 while the application can serve and 503 while it
cannot — which is what a load balancer, a container runtime or an uptime check
reads. It sits outside `basePath`, needs no credentials (a balancer cannot sign
in) and is kept out of the access log, because a probe every few seconds
otherwise buries every real request.

Two details it gets right and a hand-written one usually does not: the database
check is a **round trip**, not `isInitialized` — that flag stays true after a
connection drops, so a health check reading it reports `pass` through the one
outage it exists for. And it flips to 503 **as soon as shutdown begins**, before
the server stops accepting, which is the window a balancer needs to drain.

The body is deliberately thin: `{ status, uptime }`, plus `checks` naming what
failed. Versions and module counts are a map of your installation for whoever
finds it; `details: true` adds them, for when it is behind a gate.

liteb can only answer for the process and the database. Anything else this
application needs to serve goes in `health.checks` — the generated `index.ts`
shows where:

```typescript
health: { path: '/health', checks: { queue: () => bridge.isConnected() } }
```

**`/docs`** is generated from the same decorators that mount the routes, so it
cannot drift from what the API does. Worth knowing before you deploy: it
publishes the full shape of your API to anyone who finds the URL. Put it behind
your own gate, or drop the option, if that is not what you want.

Every line in those logs — and every failed response — carries the id of the
request it belongs to, read from `x-request-id` or generated. Nothing to
configure; it is what ties a user saying "it failed" to the lines that say why.

**`logs/`** holds the rotating files, and they all exist from the first boot,
empty — an empty `error.log` says nothing went wrong, while a missing one says
nothing at all:

```
logs/
├─ app.log        every level, in one chronological stream
├─ info.log
├─ warn.log
├─ error.log
└─ router.log     the route map — the only one with something in it on boot
```

`router.log` is the one worth knowing about: the map of what answers where, in
registration order — the fastest answer to "why is my route a 404". `app.log`
is where you read what happened; the split files are for grepping one kind of
thing.

This is on by default, so the option is only for moving it (`dir`), renaming or
dropping a file (`files: { error: 'errores' }`, `files: { info: false }`) or
writing none at all with `dir: null` — which is what a container wants, where
the disk is not where anyone reads logs and the files go with the container.

### The `@/` alias

`init` writes it:

```jsonc
// tsconfig.json
"baseUrl": ".",
"paths": { "@/*": ["src/modules/*"] },
"ts-node": { "require": ["tsconfig-paths/register"] }
```

So the one import that crosses modules stops being a staircase:

```typescript
import { UserDirectory } from '@/identity/contracts/user-directory.contract';
//                            ^ src/modules/, however deep the file is
```

Only cross-module imports need it. Inside a module, `../entities/charge.entity`
is shorter and says more.

**A `paths` alias is compile-time only.** `tsc` type-checks it and then emits
`require("@/…")` verbatim, which Node has never heard of — a build that
type-checks and dies on its first require. liteb closes that on both sides:

- `npm run dev` — `ts-node` resolves it, via the `ts-node.require` line above.
- `liteb build` — rewrites aliased specifiers to relative paths **in the
  output**, so the built application needs no loader hook, no wrapper and no
  flag.

If you change the alias in `tsconfig.json`, that is all you change: the build
reads it from there.

---

## `liteb module <name>`

```bash
npx liteb module billing
npx liteb module reports --optional --label "Reports"
```

| Flag | Effect |
| --- | --- |
| `--label <text>` | human name, for a "modules" screen |
| `--optional` | installs **disabled**, and is turned on on purpose |
| `--entry <file>` | the file holding `Liteb.create({ modules: [...] })` (default `src/index.ts`) |

Writes `module.ts`, `permissions.ts` and a first endpoint that answers at
`/api/<name>`, then registers the module in the entry point and declares its
permission keys in `src/config/permissions.ts`.

**`--optional` is the difference between a feature and an update that turns
itself on.** A module without `core: true` installs disabled: it is in the
code, its tables exist, its permissions are in the catalog, and nothing of it
runs until someone enables it. Core modules cannot be turned off at all.

The generated endpoint carries its `this.auth.assert(...)` line **live**. It
works from the first request because `init` wrote a resolver that lets everyone
through — the gate is in place and open, which is the only order in which
closing it is a one-line change. Pass `--public` for the ones that are meant to
be open.

---

## `liteb endpoint <module>/<name>`

```bash
npx liteb endpoint billing/issue-charge --method post
npx liteb endpoint billing/find-one --path ":id"
npx liteb endpoint billing/list --permission billing.view
npx liteb endpoint public/health --public
```

| Flag | Effect |
| --- | --- |
| `--method <verb>` | `get`, `post`, `put`, `patch`, `delete`, `query` (default `get`) |
| `--path <path>` | path under the group, e.g. `:id` |
| `--group <name>` | route prefix (`@Group`); defaults to the module id |
| `--permission <key>` | assert this key from the start |
| `--public` | no permission line at all |

The URL is `<basePath>/<group>/<path>`, and **the group defaults to the module
id**, so the scaffold writes no `@Group` at all. Pass `--group` only when the
URL should not carry the module's name — a module serving two resources, or
two modules contributing to one prefix.

The assertion is written **live** either way. Without `--permission` it asserts
`<module>.view`, the key a module starts with; with one, it asserts that key
and **declares it** in the module's `permissions.ts` in the same pass — a key
no module declares is a 500 and not a 403, on purpose, because it is a typo and
not a missing grant.

An endpoint that WRITES wants its own key, so pass `--permission`. `--public`
leaves the line out entirely.

---

## `liteb routine <module>/<name>`

```bash
npx liteb routine billing/nightly
npx liteb routine billing/hourly --cron "0 * * * *"
```

| Flag | Effect |
| --- | --- |
| `--cron <expression>` | node-cron expression (default `0 7 * * *`) |

Work the application does on its own, on a clock. It runs only while the module
is **enabled**, so turning a module off stops its schedule without touching any
data.

Two things the generated file reminds you of: set a `timezone` in `@Cron`, or
the expression is read in the timezone of whatever machine the process ended up
on; and `now` is not always a `Date` — it is `'init'` when the routine was
declared with `{ runOnInit: true }`.

---

## `liteb entity <module>/<name>`

```bash
npx liteb entity billing/charge
npx liteb entity billing/charge --table facturacion_cargos
```

| Flag | Effect |
| --- | --- |
| `--table <name>` | table name (default `<module>_<name>`, snake_cased) |

Writes the class and edits nothing: `entities/*.entity.ts` is where liteb
looks.

**Declaring an entity does not create its table.** liteb does not turn
`synchronize` on for you — every table comes from a migration, which is what an
installation is. Follow it with `create migration`.

---

## `liteb migration <module>/<name>`

```bash
npx liteb migration billing/create-charges
```

Writes `migrations/<timestamp>-<name>.ts`. Nothing lists it.

**The trailing timestamp in the class name is the order**, inside that module —
liteb refuses a migration class without one, because declaration order is not a
contract. Between modules the order is dependency order, so a module's tables
exist before a dependent touches them. TypeORM's own runner cannot do that: it
sorts every migration in the DataSource globally, and a module written last
year would migrate before the dependency it needs.

**It THROWS until you write its SQL**, and that is not politeness. An empty
migration SUCCEEDS: a query that is only a comment runs fine, so liteb records
it as applied and from then on has no reason to run it again — the SQL you write
afterwards never executes, and `liteb migrate` keeps answering *nothing to
migrate* about a table that was never created. Failing instead rolls the whole
thing back and leaves no row behind. Delete the `throw` when the SQL is there.

---

## `liteb migration:generate <module>/<name>`

```bash
npx liteb migration:generate billing/add-due-date
npx liteb migration:generate billing/add-due-date --print
```

| Flag | Effect |
| --- | --- |
| `--entry <file>` | file exporting `createApp()` |
| `--dir <path>` | where modules live (default `src/modules`) |
| `--print` | show the SQL and write nothing |
| `--force` | overwrite a file that already exists |

**This is TypeORM's generator, filed by module.** It connects, has TypeORM read
the live schema, compare it against your entities and write the SQL that closes
the gap — the same machinery behind `synchronize: true`, minus the part where it
runs behind your back. That half is TypeORM's and it does it better than anything
hand-rolled.

What TypeORM cannot do is decide **where** the migration goes: it sees one
schema, and modules do not exist for it. That half is liteb's, and it is decided
from the only thing that knows — which module declares which entity. So:

- a diff that lands entirely in another module is **refused**, and names the
  module that owns it. A migration in the wrong module runs in the wrong order,
  or not at all when that module is disabled, and that surfaces in production on
  data that already exists;
- one that touches another module's tables as well is written, with a warning
  naming them. Splitting it is a judgement call and liteb does not make it.

It **refuses while migrations are pending**. A pending migration is a change the
database has not seen, so the diff would describe it a second time and you would
run the same DDL twice. `liteb migrate` first.

> **Read what it writes.** A diff cannot tell a rename from a drop plus an add,
> so a renamed column comes out as losing one and gaining another — and on a
> table with rows, that is the data.

---

## `liteb contract <module>/<name>`

```bash
npx liteb contract identity/directory
```

What other modules may ask this one for. Writes
`contracts/<name>.contract.ts` with the interface and the token sharing a name
— TypeScript keeps types and values in separate namespaces, so one import gives
you both the shape the compiler checks and the identity the container resolves.

The consumer imports this file and nothing else from your module. Change how it
works and nothing outside your module moves.

---

## `liteb provider <module>/<name>`

```bash
npx liteb provider identity/directory              # answers a contract
npx liteb provider reports/low-stock --slot badges # fills an extension point
```

| Flag | Effect |
| --- | --- |
| `--slot <name>` | fill an extension point instead of answering a contract |

The class that keeps the promise. Writes `providers/<name>.provider.ts` with
`@Provides(Token)`, or `@Contributes(Slot)` with `--slot`.

`this.db`, `this.get(Contract)`, `this.all(Slot)` and `this.emit(Event)` are
injected **before** the instance is built, so a field initializer can already
reach for a repository:

```typescript
@Provides(UserDirectory)
export class UserDirectoryProvider extends Provider implements UserDirectory {
  private readonly users = this.db.getRepository(User);
}
```

It is built the first time someone asks for it, then reused — a contract nobody
calls costs nothing.

With `--slot`, the generated import is a placeholder pointing at
`@/<module>/slots/…`: the slot belongs to the module that **opened** it, and an
extension imports that token, never the other way round.

---

## `liteb event <module>/<name>`

```bash
npx liteb event billing/charge-issued
```

Something this module announces, for whoever is listening. Writes
`events/<name>.event.ts`.

**An event is not a call.** There is no answer, a listener that throws does not
fail whoever emitted, and an event nobody listens to is normal. When the
outcome matters to the caller, that is a contract.

The payload has to carry what a listener needs: listeners read on their own
connection, so they cannot see rows a transaction has not committed yet.

---

## `liteb slot <module>/<name>`

```bash
npx liteb slot catalog/product-badges
```

An extension point this module opens for others to fill. Writes
`slots/<name>.slot.ts` with two names: the interface is the shape of **one**
contribution, the token names the collection.

**Watch the direction.** The module that opens the slot is the one extensions
depend on: it knows nothing about who fills it, which is what lets it be core
while every contributor stays removable. Backwards, core would depend on its
own extensions and none of them could be removed.

Read it with `this.all(Token)`. An empty array is a normal answer.

---

## `liteb listener <module>/<name>`

```bash
npx liteb listener reports/restock-log
```

Reacts to an event another module announced. Writes
`listeners/<name>.listener.ts`.

The generated file declares a placeholder token so it compiles on its own —
replace it with the real import from the module that announces the event:

```typescript
import { ChargeIssued } from '@/billing/events/charge-issued.event';
```

Listeners run only while their module is **enabled**, and they read on their
own connection: emit **after** the transaction commits, or they cannot see the
rows.

---

## `liteb migrate`

```bash
npx liteb migrate
npx liteb migrate --dry-run
npx liteb migrate --entry src/main.ts
```

| Flag | Effect |
| --- | --- |
| `--entry <file>` | file exporting `createApp()` (default `src/index.ts`) |
| `--dry-run` | say what would run, change nothing |

Runs the pending migrations of every **enabled** module, in dependency order,
without starting a server. The CLI never needs to know where your database is:
it asks **your** entry point for the application, which is why the `init`
template separates `createApp()` from `main()`.

The database itself has to exist. liteb creates tables, not databases.

---

## `liteb migrate:status`

```bash
npx liteb migrate:status
```

| Flag | Effect |
| --- | --- |
| `--entry <file>` | file exporting `createApp()` |

Lists what each module declares and what of it already ran, marking disabled
modules — whose migrations do not run — as such.

Reading the state never creates anything: on a database that has never
migrated, the registry table does not exist and the answer is simply that
everything is pending.

---

## `liteb build`

```bash
npx liteb build
npx liteb build --out dist
npx liteb build --bytecode
npx liteb build --bytecode --only modules/billing
```

| Flag | Effect |
| --- | --- |
| `--project <file>` | tsconfig to compile with (default `tsconfig.json`) |
| `--out <dir>` | where the build goes (default `build`) |
| `--assets <dir>` | folder holding what was never TypeScript (default `src`) |
| `--bytecode` | compile to `.jsc` and delete the readable `.js` |
| `--only <dir>` | limit the bytecode step to this part of the output |

Three steps, and two of them are the reason this command exists instead of a
bare `tsc`:

1. **Compile** with the project's own TypeScript.
2. **Copy what was never TypeScript** — templates, static files, JSON. `tsc`
   leaves them behind, and a build missing its views is a build that starts and
   then 500s.
3. **Resolve the path aliases.** `tsc` emits `require("@/…")` verbatim; this
   rewrites them to relative paths so the output runs under plain `node`.

### `--bytecode`

Compiles the output to V8 bytecode and deletes the readable `.js`. Two things
it is your call to accept:

- **A `.jsc` is tied to the Node/V8 that produced it.** Ship the runtime with
  the build, or it will not load on the target.
- **It is opacity, not encryption.** Strings, identifiers and class names
  survive, and templates, SQL and static files were never bytecode at all.

The application must `require('bytenode')` before `start()`. liteb does not
depend on it: what a `.jsc` file is depends on the Node that produced it, and a
framework has no business deciding that for its consumer.

---

## What the CLI will not do

- **It does not know your application.** No database connection, no config
  file, no registry. `migrate` is the exception, and even there it asks your
  entry point rather than reading your `.env` itself.
- **It does not rewrite code it did not write**, beyond the two edits listed
  above. When it cannot be certain, it prints the line for you to add.
- **It does not create databases.** Only tables, and only through migrations.

> The 1.x CLI was deleted because its templates were loose assets nobody
> compiled, and they drifted until they generated decorators the framework no
> longer had. These templates are part of the same build as everything else,
> and `test/cli.spec.ts` scaffolds a module and **boots it** — a template that
> stops matching the framework fails the suite.
