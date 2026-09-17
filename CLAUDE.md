# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Which line am I on?

This repo ships **two lines**, and they are not compatible. Check the branch
before anything else:

| Branch | Version | What it is | Who consumes it |
| --- | --- | --- | --- |
| `main` | `2.0.0-dev.x` | Module framework. Active development. | Wisnee v3 (not built yet) |
| `v1` | `1.0.0-rc.1` | Routing framework. **Frozen — fixes only.** | `wisnet-server` (Wisnee v2) |

`git branch --show-current` settles it. A quick tell: if `lib/modules/` exists
you are on 2.0.

**Do not port features from `main` to `v1`.** `v1` exists so a product already in
production is not dragged along by a major rewrite.

## What this repo is

`liteb` is a lightweight NestJS-inspired backend framework published to npm. It
is **not** an application. Dual layout:

- **`lib/`** — the published framework. This is what ships (`dist/` + `types/`).
  **Edit here.**
- **`src/`** — a sample app that dogfoods the framework (`npm run dev`). It
  imports `lib/` by relative path, never by package name. Not published.
  Three modules (`identity`, `catalog` core; `reports` optional and installed
  disabled), with per-module migrations and `synchronize: false`.
  **`test/demo-app.spec.ts` boots it against PGlite** — keep it that way. The
  previous demo had rotted unnoticed: `@Priority` was backwards so the literal
  route resolved to `:id`, and a `@Template` endpoint could never render
  because nothing called `setTemplates`. Both were invisible without a test.
  `http/demo.http` is the request-by-request walkthrough.
- **`test/`** — jest suite. Not published.

`bin/` was removed in the 1.0 RC (its scaffolding generated decorators that never
existed). Do not reintroduce it without a redesign.

Comments and JSDoc are in **English**: they ship inside the `.d.ts`.

## Commands

```bash
npm run dev     # nodemon → ts-node ./src/index.ts (needs PostgreSQL)
npm run build   # clears dist/ + types/, then tsc -p tsconfig.build.json
npm run clear   # rimraf ./dist ./types
npm test        # jest, with --experimental-vm-modules (PGlite needs it)
npm run modules -- list | enable <id> | disable <id>   # ModuleStore CLI (demo)
npm pack        # tarball, to install into a consumer project
```

Single file: `npx jest test/<file>.spec.ts`. Single test: `npx jest -t "name"`.

`npm run build` **clears first on purpose**. Without it the tarball kept files
from deleted modules, and a consumer could deep-import 1.x code no longer in the
source.

Node **>=20**.

## Architecture (2.0)

### Boot, in order

`Liteb.create(options)` builds the DataSource; `start(port)` runs the cycle. The
order is not incidental — each step depends on the one before:

1. **DataSource** — built with the entities of **every module present in the
   code**, enabled or not, then initialized. An already-initialized DataSource is
   adopted rather than re-initialized.
2. **`_modules`** — `ModuleStore.sync()` reconciles code against what the
   installation recorded: what to install, what changed version, what is
   recorded but gone.
3. **Resolve** — `resolveModules()` orders the graph by dependency and refuses
   duplicate ids, missing dependencies, cycles, host incompatibility, or
   depending on something disabled.
4. **Migrate** — `ModuleMigrator.run()`, per module, in that order.
5. **Contracts** — `buildContainer()` registers what modules provide and refuses
   a consumed contract nobody provides.
6. **Mount** — routes and tasks, only for enabled modules. Then `listen`.

Any failure in 2–5 aborts the boot. Serving half-mounted is worse than not
starting.

### Modules are the only way in

`Liteb.create()` is the sole entry point — the constructor and `useModules()`
are private — and there is no glob-mounting API. `setApis`/`addApis`/`setTasks`
were removed: they let an application define routes outside any module, which
made the manifest optional and the module system a second-class path. The
consequence is deliberate: **anything that serves a request lives in a module**,
so a route can always be traced to something installable, disableable and
versioned.

Practical fallout for tests: a route-level test needs a real database now,
because booting modules touches `_modules`. Use the PGlite harness. That is a
feature — those tests exercise the path consumers actually use.

### Module globs are extension-agnostic (and node_modules-safe)

`withModuleExtensions()` rewrites `./apis/*.api.ts` to
`./apis/*.api.{ts,js,cjs,mjs}`, and `pickOneFilePerModule()` keeps one file per
name (`.ts` wins) and drops `*.d.ts`.

Why it matters: `dir` is `__dirname`, so after `tsc` it points at the build,
where nothing ends in `.ts`. The old literal glob found zero files, liteb logged
one warning and started **serving 404 to everything** — a deployment that looks
alive. The same thing blocked a module published as a package, which only ever
ships `.js`.

The `node_modules` ignore is **anchored to the module's `dir`**, not global: a
module installed as a package lives under `node_modules`, and an unanchored
ignore of that name matches none of its files.

### Module system (`lib/modules/`)

| File | Responsibility |
| --- | --- |
| `module-manifest.ts` | Types + `ModuleDefinitionError` |
| `define-module.ts` | Declares a module; validates what it knows alone |
| `resolve-modules.ts` | Graph: order, cycles, `engine`, enabled |
| `reconcile-modules.ts` | Code vs. recorded state (**pure**) |
| `module-store.ts` | `_modules` I/O |
| `module-migrator.ts` | Per-module migrations + `_module_migrations` |
| `module-loader.ts` | Reads endpoints/tasks from a module's globs, any extension |
| `container.ts` / `build-container.ts` | Contracts between modules |
| `events.ts` | Event bus: `event()`, `EventBus`, listeners |
| `slots.ts` | Extension points: `slot()`, filled via `contributes` |
| `permissions.ts` | Registry of what the modules declare |
| `collect-entities.ts` | Union of every module's entities |

Decisions that are easy to undo by accident, so do not:

- **Disabled modules still contribute entities.** Leaving them out would drop
  their tables from TypeORM's view and make re-enabling a gamble. Disabling
  decides what *runs*, never whether data is reachable.
- **Migrations order by module first**, by timestamp only *within* a module.
  TypeORM's runner sorts globally, so an older module would migrate before the
  dependency it needs. Stamps compare as **numbers** (`"9000"` sorts after
  `"10000"` as text).
- **A new module installs disabled** unless `core: true`.
- **A module whose code vanished is reported, never deleted.**
- **A slot accepts many contributions; a contract refuses a second provider.**
  That asymmetry IS the difference between them. Do not "fix" either one.
- **The module that opens a slot must not depend on its contributors.**
  Extensions import the host's token, never the reverse — otherwise core
  depends on its own extensions and none can be removed.
- **An undeclared permission key throws a plain `Error` (500), not a 403.** A
  key that exists nowhere is a mistake in the code; answering 403 would send
  whoever debugs it to look at roles and grants instead of at the typo. The
  check runs BEFORE the 401 for the same reason: in development the first
  request is usually anonymous, which is exactly when the author should hear
  about it.
- **The registry is built from every module present, enabled or not** — like
  entities. Disabling must not change what a key means.
- **`this.get(Token)`, not a free `inject()`.** Resolving without an explicit
  receiver needs a process-wide container, and two apps in one process would see
  each other's implementations. The container is per application.
- **Framework tables are queried directly**, not through a repository. Depending
  on an entity would force every consumer to register an internal class.

### Discovery and per-request state (both lines)

No central registration: files are found by **glob**, `require()`d, and every
export that extends the base class is introspected via `reflect-metadata`.
Anything else is ignored — `Reflect.getMetadata` throws on a primitive.

`EndpointHandler` injects `db` and `container` on the **prototype** (stable,
available in field initializers) and the request state (`params`, `body`,
`query`, …) on the **instance**, after `new`. With everything on the prototype,
two concurrent requests to the same endpoint overwrote each other. There is a
regression test for it. **Do not revert to prototype-wide state.**

Consequence: request state is **not** readable in constructors or field
initializers. Only `db` and `container` are.

`auth` follows the same rule and for the same reason: it is resolved per request
and assigned on the **instance**. There is a regression test with two concurrent
callers whose actors must not cross.

### Auth seam (2.x)

`lib/core/auth.ts`. One `AuthResolver` (`LitebOptions.auth`) turns a request
plus an `AuthContext` (`{ db, get }`) into `{ actor, permissions }`; endpoints
read `this.auth`.

- `Actor` is declared **empty** in a `declare global { namespace LitebAuth }`
  block. An interface re-exported from the package entry cannot be merged from
  outside, so a global namespace is the only shape a consumer can widen. Do not
  "tidy" it into a plain exported interface — augmentation silently stops
  merging and apps get `{}`.
- The framework deliberately does not define `userId`: baking one actor shape in
  is exactly what made 1.x's `getSession('userId')` impossible to move off.
- Resolution happens **inside** the handler's `try`, so a resolver that throws on
  a bad credential becomes a 401 instead of an unhandled rejection.
- `Auth` carries a `configured` flag so "no resolver wired" (a bug, 500) reads
  differently from "nobody is signed in" (a 401).
- The resolver gets `{ db, get }` because without it an app whose permissions
  live in the database had to close over an imported DataSource singleton — the
  exact global the container exists to avoid — or freeze them into the session
  at login. The context is built **once per handler**, not per request: the
  DataSource and container are stable, only the request changes.

### Errors

`ErrorControl` maps `SchemaError` (422), `CustomerError` (406), `NotFoundError`
(404), `AuthError` (401), `ForbiddenError` (403), `CustomError` (free status) and
a native `Error` (500). The `ForbiddenError` branch must stay **above** the
generic-object branch, which also answers 403 but echoes the raw object back.
The 404 fallback reuses `NotFoundError`, so an unmatched route answers with the
same contract.

## 1.x → 2.0

| 1.x | 2.0 |
| --- | --- |
| `Api` | `Endpoint` (`lib/templates/endpoint.ts`) |
| `ApiReader` / `ApiHandler` | `EndpointReader` / `EndpointHandler` |
| `new Liteb(ds)` + `setApis(...)` | `Liteb.create({ db, modules })` — the constructor is private |
| `addApis()` (multi base path) | A module per prefix |
| `setTasks(globs)` | The module's `tasks` glob |
| Entities by global glob | Declared per module |
| One migrations folder | Per module, own ledger |
| `Get`/`Post`/… | `HttpGet`/`HttpPost`/… |
| `Queue`, `Transaction` | `dataSource.transaction(cb)` |
| `Service`, `InternalError`, `Middleware` class | Removed |
| `getSession(k)` / `setSession(k, v)` | `this.auth` + an `auth` resolver |
| `SessionDataExtends<T>` | Removed (the framework no longer imports `express-session`) |

The OpenAPI decorators (`ApiTag`, `ApiSummary`, `ApiDescription`, `ApiResponse`)
keep their names: there "Api" means OpenAPI, not the base class.

## Testing

`test/helpers/test-db.ts` runs **real Postgres in-process** via PGlite — no
Docker. Dialect differences SQLite would hide behave as in production.

`typeorm-pglite` keeps one PGlite instance per process, so isolation comes from
dropping and recreating the `public` schema. Create the database **once per
file** (`beforeAll`) and reset between cases (`beforeEach`): that took the
migrator suite from 28s to 3s.

Jest runs with `--experimental-vm-modules` (PGlite uses dynamic imports). Import
globals from `@jest/globals` — there is no `@types/jest`. ts-jest only, never
babel-jest: it breaks `emitDecoratorMetadata`.

`tsc -p tsconfig.json` does **not** cover `test/`. A broken import in a spec is
only caught by running jest.

Pure rules are exported and tested without a database: `reconcileModules`,
`orderMigrations`, `resolveModules`, `toEndpointReaders`, `collectModuleEntities`.
Keep that split — the decision is the part worth testing.

## Build and release

- `tsconfig.build.json`: `rootDir: "."` (keeps the `dist/lib` layout; without it
  tsc infers `lib/` as root and `main` fails to resolve) and `incremental: false`
  (a stale `.tsbuildinfo` with a cleared `dist/` made tsc emit nothing).
- `removeComments: false` → comments ship. Hence the English rule.
- Peer deps, not bundled: `typeorm`, `express`,
  `class-validator`, `typescript`. `reflect-metadata` and `semver` are direct.
- Not published yet. To test in a consumer: `npm run build && npm pack`, then
  install the `.tgz`. A tarball is closer to what npm installs than `npm link`,
  which resolves through symlinks and hides a bad `files` entry.

## The three ways modules meet

Keep them distinct; collapsing any two is the easiest way to ruin this design.

| | Answers | Read by | Refuses |
| --- | --- | --- | --- |
| `contract` / `get` | exactly one | the caller, waiting | a second provider |
| `event` / `emit` | any number | nobody | nothing; failures are logged |
| `slot` / `all` | any number | the module that opened it | nothing |

`Contract` and `Slot` each carry a `kind` literal so neither can be passed where
the other goes. They are otherwise structurally identical, and that one
confusion is the one that matters: one provider versus many.

## Still missing in 2.0

The license gate — which arguably does not belong in an MIT framework at all and
should live in the product.

There is still no **grant store**: the resolver hands the actor's permission
list over and the framework trusts it. That is deliberate — who holds what is
the application's policy — but it means liteb validates the keys, never the
grants.
