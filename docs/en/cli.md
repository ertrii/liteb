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
| [`table <module>/<name>`](#liteb-table-modulename) | A table, with its row types |
| [`migration <module>/<name>`](#liteb-migration-modulename) | A timestamped migration |
| [`migration:generate <module>/<name>`](#liteb-migrationgenerate-modulename) | The same, written from your tables |
| [`token <module>/<name> <kind>`](#liteb-token-modulename-kind) | What this module shares: a contract, a slot or an event |
| [`provider <module>/<name>`](#liteb-provider-modulename) | The class that answers a contract or fills a slot |
| [`listener <module>/<name>`](#liteb-listener-modulename) | A reaction to an event |
| [`migrate`](#liteb-migrate) | Runs the pending migrations |
| [`migrate:status`](#liteb-migratestatus) | What each module declares, and what already ran |
| [`build`](#liteb-build) | Compiles, optionally to V8 bytecode |

Every generator takes the same three flags:

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
├── module.ts                   ← the wiring, and the permission keys
├── tables/*.table.ts           migrations/*.ts
├── endpoints/*.endpoint.ts     routines/*.routine.ts     listeners/*.listener.ts
├── providers/*.provider.ts
└── tokens/*.token.ts           (contracts, slots and events)
```

The first two rows are globs liteb reads at boot. The last row is not: a token
is imported by name, so there is nothing to discover — those folders exist so
you can find them, and the CLI is what keeps them consistent.

Only two edits touch a file the generator did not write, and both have a shape
certain enough to do without parsing TypeScript:

- `liteb module` adds the module to `modules: [ ]` in `src/index.ts`, and
  appends a block to `src/config/permissions.ts`.
- `liteb endpoint --permission` adds the key to the module manifest's
  `permissions: []`.

Anything less certain is printed as an instruction instead. A scaffolder that
silently mangles a file you wrote is worse than one that tells you what to add.

---

## What it generates carries no comments

A generated file is code and nothing else. The only command that explains itself
is `liteb init`, and it is the only one that writes a file once.

A generator runs every day. Its explanation ends up copied into the tenth
endpoint, the fifth token and the third migration, where it teaches nobody
anything: it is text to read past or delete by hand, and it becomes a lie the day
the framework changes and the old files are still there.

What you have to know is said once, where it is new — the command prints it when
it is done:

```bash
$ npx liteb token catalog/product-badges slot

  created  src/modules/catalog/tokens/product-badges.token.ts

  next     ProductBadge is the shape of ONE contribution; ProductBadges is the collection.
  next     Read it: const filled = this.all(ProductBadges). An empty array is a normal answer — a slot nobody filled is a feature nobody installed.
  next     Fill it from another module: liteb provider <module>/<name> --slot product-badges
  next     Note the direction: "catalog" opens it and knows nothing about who fills it, which is what keeps the host independent of its own extensions.
```

And the reasoning lives on this page and in the guide: one place, which can be
corrected.

---

## `liteb init [name]`

```bash
npx liteb@alpha init my-app                 # into ./my-app
npx liteb@alpha init                        # into the current folder
npx liteb@alpha init my-app --skip-install  # write the files, run npm install yourself
npx liteb@alpha init my-app --dir src/bc    # modules live somewhere else
npx liteb@alpha init my-app --no-git        # no repository, no first commit
```

| Flag | Effect |
| --- | --- |
| `--skip-install` | write the files and stop |
| `--no-git` | do not create a repository, or the first commit |
| `--dir <path>` | where modules will live (default `src/modules`) |

Writes:

```
package.json          scripts, and the dependencies the framework needs
tsconfig.json         the two decorator flags, and the @/ alias
.env  .env.template   NODE_ENV, ports, CORS origins, database
.gitignore
.gitattributes        the working tree is LF, on every machine
.editorconfig         the shape of a file, for editors that run no tooling
.prettierrc           .prettierignore
eslint.config.mjs     flat config; formatting left to Prettier
.vscode/              format on save, and the extensions that do it
src/index.ts          createApp() separated from main()
src/config/permissions.ts
src/config/auth.ts
src/config/session.ts cookie sessions, and what they carry
```

Three things in there are worth knowing about, because getting any of them
wrong costs an evening.

**The decorator flags.** `experimentalDecorators` and `emitDecoratorMetadata`.
Remove either and every route and every entity becomes a silent no-op —
nothing fails, nothing answers.

**`strictPropertyInitialization: false`.** Validated DTOs
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

**Sessions are wired.** `src/config/session.ts` mounts `express-session` with an
`httpOnly` cookie and none handed to visitors who never sign in, declares what
the session carries — `userId`, to start — and `src/index.ts` mounts it ahead of
the routes. `.env` gets a `SESSION_SECRET` generated for that project. Without
this the generated resolver could not read `request.session?.userId` and a login
could not write `this.request.session`: the type does not exist until the
package **and** its types are installed.

> The default store lives in memory: it is lost on every restart, and a second
> process does not see the first one's sessions. When this has users, put the
> sessions in the database you already run and pass it as `store`.

**And it is born under version control.** It runs `git init` on branch `main` and
leaves the scaffold as the first commit, after `npm install` so the lockfile is in
it. The commit is the point: sixteen files nobody typed are not your work, and
with no commit of their own they end up inside the first real one, where nobody
reviewing it can tell the two apart. With it, your first `git diff` is only what
you wrote, and `git checkout .` has somewhere to go back to from minute one.

Three things stop it, none of them an error, and each is reported in one line:
there is no git on the machine; the folder is **already** inside a repository
(`liteb init my-app` inside a monorepo is a normal thing to do, and a nested
repository hides the project from the one that already tracks it); or the commit
itself fails, most often because git has no identity there — the repository still
stands, and the reason is git's own words, not ours. `--no-git` skips all of it.

`src/config/permissions.ts` starts with its `declare global` block already
open. It is empty until the first module; `liteb module` appends one block per
module and interface merging joins them, so no line in that file is ever
reopened. Each block **reads** the keys off that module's manifest rather than
restating them, so a key is spelled once.

### The shape of a file, decided once

Four files, and each exists because a different reader needs it. They all carry
the same values, and those values match what the generators emit — so the first
`npm run format` never rewrites a file `liteb module` just wrote.

| File | Read by |
| --- | --- |
| `.editorconfig` | every editor, including ones that run no tooling. Prettier reads it too |
| `.prettierrc` | Prettier, which **overrides** `.editorconfig` where they overlap |
| `eslint.config.mjs` | ESLint: what the code MEANS |
| `.gitattributes` | git, when it writes files to disk |

**`.gitattributes` is the one people skip.** `* text=auto eol=lf` makes the
working tree LF on every machine. Without it, git on Windows checks files out as
CRLF while `.editorconfig` and `.prettierrc` both say LF: the formatter wants to
rewrite every line of half the project, and every diff is noise. `eol=lf` wins
over whatever `core.autocrlf` happens to be locally, so two machines agree
without anybody configuring git.

**Prettier does not run as an ESLint rule**, which is what
[Prettier itself recommends](https://prettier.io/docs/integrating-with-linters):
running it as a rule is slower, fills the editor with red squiggles over things
that fix themselves on save, and adds a layer that can break.
`eslint-config-prettier/flat` only turns OFF the stylistic rules that would argue
with the formatter, and it goes last in the array because that is how it works.
`npm run format` is what formats.

`eslint.config.mjs` is flat config, because `.eslintrc` was removed in ESLint 10
— and `package.json` declares `node >=22.13`. That floor is not ESLint's: Node
20 went end-of-life in April 2026, and 22 is the oldest line still getting
security fixes. Run 24, which is the active LTS.

TypeScript is pinned to `^6`, not `^7`. TypeScript 7 exists, but
`typescript-eslint` — the only way to get type-aware rules — peer-requires
`typescript <6.1.0`, so 7 would mean giving up `no-floating-promises`. The
scaffolded `tsconfig.json` is written for the move all the same: no `baseUrl`
(deprecated in 6, gone in 7), `paths` relative to the file, and `rootDir`
explicit. `moduleResolution` is still `node10` behind an `ignoreDeprecations`,
because changing the resolver changes how every package resolves and that is its
own piece of work.

Three rules are set rather than left to the preset, and each is a decision:

- **`no-namespace` with `allowDeclarations: true`.** `declare global { namespace
  LitebAuth { ... } }` is how an application says what an actor is and which
  permission keys exist. Ambient declarations stay allowed; a namespace used as a
  value does not.
- **`no-empty-object-type` with `allowInterfaces: 'with-single-extends'`.**
  `interface Permissions extends PermissionsOf<typeof mod> {}` is empty *because*
  the keys come from the `extends`, and there is one such block per module.
  Configuring the rule beats disabling it: a real `{}` is still reported.
- **`no-floating-promises` as an error.** The one type-aware rule worth what type
  information costs: a repository call whose promise nobody awaited is data that
  silently did not get written, and nothing else can see it. `await-thenable`
  comes along for the same reason. Everything else type-aware is in
  `tseslint.configs.recommendedTypeChecked`, commented in the file, for when the
  codebase is ready to answer for the `any`s an ORM hands back.

`no-explicit-any` and `no-unused-vars` are **warnings**. A build that fails on
`any` teaches people to write `as unknown as T`, which is worse than the `any`.

Four scripts: `lint`, `lint:fix`, `format`, `format:check`.

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
import { UserDirectory } from '@/identity/tokens/user-directory.token';
//                            ^ src/modules/, however deep the file is
```

Only cross-module imports need it. Inside a module, `../tables/charge.table`
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
| `--entry <file>` | the file holding `Liteb.create({ modules: [...] })` (default `src/index.ts`) |

Writes `module.ts` and a first endpoint that answers at `/api/<name>`, then
registers the module in the entry point and appends a block to
`src/config/permissions.ts` that carries its keys into the type system.

The keys live in the manifest, as strings: `permissions: ['billing.view']`. A
key can carry text for a roles screen when it cannot say it alone —
`{ key: 'billing.void', label: 'Void a charge already collected' }` — and the
`label` is optional precisely because most keys can.

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
`<module>.view`, the key a module starts with; with one, it asserts that key and
**adds it** to the module manifest's `permissions` array in the same pass — a key
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
is deployed, so a routine lives and dies with the module that declares it
data.

Two things the generated file reminds you of: set a `timezone` in `@Cron`, or
the expression is read in the timezone of whatever machine the process ended up
on; and `now` is not always a `Date` — it is `'init'` when the routine was
declared with `{ runOnInit: true }`.

---

## `liteb table <module>/<name>`

```bash
npx liteb table billing/charge
npx liteb table billing/charge --name facturacion_cargos
```

| Flag | Effect |
| --- | --- |
| `--name <name>` | the name in SQL (default `<module>_<name>`, snake_cased) |

Writes the table and the two row types that go with it, and edits nothing:
`tables/*.table.ts` is where liteb looks.

```typescript
export const charge = pgTable('billing_charge', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

export type Charge = typeof charge.$inferSelect;
export type NewCharge = typeof charge.$inferInsert;
```

The types are written out because they are what the rest of the module passes
around: a function taking a row wants the type, and deriving it at each call site
is how two of them end up disagreeing.

**The prefix is not decoration.** Every module's tables share one namespace, and
`billing_charge` is what keeps two modules from both wanting `charge`. It is also
what makes a database readable by module at a glance.

**An enum is exported here too**, not only used by a column. A table with an enum
column generates `"status" "billing_status" NOT NULL`, which **references** the
type: with the enum missing from the schema, the migration comes out creating a
table that points at a type nothing created, and fails when it runs.

**Declaring a table does not create it.** Every table comes from a migration,
which is what an installation is. Follow it with `liteb migration:generate`.

---

## `liteb migration <module>/<name>`

```bash
npx liteb migration billing/create-charges
```

Writes `migrations/<timestamp>-<name>.ts`. Nothing lists it.

**The trailing timestamp in the class name is the order**, inside that module —
liteb refuses a migration class without one, because declaration order is not a
contract. Between modules the order is dependency order, so a module's tables
exist before a dependent touches them. An ORM's own runner cannot do that: it
sorts every migration it knows about globally, and a module written last
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
| `--check` | also report what the live database is missing |
| `--force` | overwrite a file that already exists |

**It needs no database.** It compares the module's tables against that module's
**snapshot**, which is a file:

```
src/modules/billing/
├── tables/*.table.ts
└── migrations/
    ├── 1790000000000-add-due-date.ts
    └── meta/snapshot.json        ← what the next one compares against
```

It writes **two** files: the migration and the new snapshot. **Commit both** —
without the snapshot the next migration is written against a schema that no
longer matches, and comes out creating what already exists.

Comparing two descriptions of a schema and writing the SQL is Drizzle Kit's work,
and it does it better than anything hand-rolled. What liteb decides is **what**
gets compared, and that is per module: this module's tables against this module's
snapshot. Which means there is nothing to attribute — a whole-schema diff would
have to be split up, and where each piece lands decides what order it runs in.

A statement may still **name** another module's table, because a foreign key
points somewhere, and that is correct: the constraint belongs to the module that
declared it, and liteb migrates in dependency order, so what it points at already
exists by the time it runs.

**`down()` comes out too**, being the same question asked backwards — which is
why it is trustworthy in the same measure the `up` is.

With `--check` it also connects and says whether the live database has drifted
from the code: a migration applied by hand, a column dropped in a console, or a
snapshot nobody committed show up there and nowhere else.

It **refuses while migrations are pending**. A pending migration is a change the
database has not seen, so the diff would describe it a second time and you would
run the same DDL twice. `liteb migrate` first.

> **Read what it writes.** A diff cannot tell a rename from a drop plus an add,
> so a renamed column comes out as losing one and gaining another — and on a
> table with rows, that is the data.

---

## `liteb token <module>/<name> <kind>`

```bash
npx liteb token identity/directory contract   # exactly one answers it
npx liteb token catalog/product-badges slot   # however many are installed fill it
npx liteb token billing/charge-issued event   # nobody answers it
```

The one thing two modules share. Writes `tokens/<name>.token.ts`, and the second
argument is the same one `token(id, kind)` takes inside the file: the three
differ in exactly one thing, how many may answer.

| kind | Who answers | How it is read |
| --- | --- | --- |
| `contract` | exactly one | `this.get(Token)`, and it waits for the answer |
| `slot` | however many are installed | `this.all(Token)`; an empty array is normal |
| `event` | nobody | it is not read: announce it with `this.emit(Token, payload)` |

With **`contract`**, the interface and the token share a name on purpose:
TypeScript keeps types and values in separate namespaces, so one import gives you
both the shape the compiler checks and the identity the container resolves. The
consumer imports this file and nothing else from your module.

With **`slot`** there are **two** names: the interface is the shape of ONE
contribution and the token names the collection. And watch the direction — the
module that opens the slot is the one extensions depend on: it knows nothing
about who fills it, which is what keeps the host independent of its own
extensions.

With **`event`**, the payload has to carry what a listener needs: listeners read
on their own connection, so they cannot see rows a transaction has not committed
yet. There is no answer, a listener that throws does not fail whoever emitted,
and an event nobody listens to is normal.

All three land in the **same** folder on purpose. Splitting them across
`contracts/`, `slots/` and `events/` asked you to file a decision already made
inside the file, in the second argument.

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
`@Provides(Token)` — the same decorator whether the token is a contract or, with `--slot`, an extension point.

`this.db`, `this.get(Contract)`, `this.all(Slot)` and `this.emit(Event)` are
injected **before** the instance is built, so a field initializer can already
reach for a repository:

```typescript
@Provides(UserDirectory)
export class UserDirectoryProvider extends Provider implements UserDirectory {
  private readonly users = () => this.db.select().from(users);
}
```

It is built the first time someone asks for it, then reused — a contract nobody
calls costs nothing.

With `--slot`, the generated import is a placeholder pointing at
`@/<module>/tokens/…`: the slot belongs to the module that **opened** it, and an
extension imports that token, never the other way round.

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
import { ChargeIssued } from '@/billing/tokens/charge-issued.token';
```

Listeners read on their
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

Runs the pending migrations of every module, in dependency order,
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

Lists what each module declares and what of it already ran, in the order they
will migrate.

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
