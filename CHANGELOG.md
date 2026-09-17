# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2.0.0

Work toward `2.0.0`, which turns liteb from a routing library into a module
framework. The `1.x` line is frozen on the `v1` branch and only receives fixes.

### Added

- **Authentication seam (`this.auth`)** — one `AuthResolver`, passed as
  `Liteb.create({ auth })` or `setAuth()`, turns a request into
  `{ actor, permissions }`; every endpoint reads it as `this.auth`. It replaces
  `getSession`/`setSession`.

  The point is that endpoints stop knowing *how* a caller was identified. A
  cookie session, a bearer token from a mobile app and an API key issued to a
  third-party extension are all the same one function, so swapping the transport
  no longer means touching every endpoint that reads the current user.

  `Actor` is declared **empty**, in a global `LitebAuth` namespace, and the
  application widens it by declaration merging — the framework defining `userId`
  is exactly what made 1.x's `getSession('userId')` impossible to move off. The
  global namespace is deliberate: an interface re-exported from the package
  entry cannot be merged from outside.

  `this.auth.actor` throws `AuthError` when the call is anonymous, because
  reading the caller and checking it exists were two steps that had to be
  written together every time and forgetting the second failed silently;
  `this.auth.optional` is the nullable version for endpoints open to everyone.
  `can()` and `assert()` check the permission keys modules declare in their
  manifests, with `*` granting everything.

  Resolution happens inside the handler's `try`, so a resolver that throws on a
  malformed credential becomes a 401 rather than an unhandled rejection. `Auth`
  also tracks whether a resolver exists at all, so "this app never wired auth
  up" surfaces as a 500 programming error instead of masquerading as a 401.

- **`HttpStatus` is now exported** from the package entry. It never was, which
  left `CustomError(status, ...)` and `this.httpStatus` without a way to name
  the value they take.

- **`ForbiddenError`** (403) — the caller is known but not allowed. Kept apart
  from `AuthError` (401) because the two say opposite things to a client:
  authenticate and retry, versus don't bother.


- **`defineModule()`** — the manifest a module declares about itself: `id`,
  `version`, `engine` range, `requires`, entities, migrations, route and task
  globs, permissions and lifecycle hooks. It returns a `ResolvedModule` with
  every default applied, so nothing downstream guards against `undefined`.

  It validates what a module can know on its own — shape, formats, internal
  duplicates — and throws `ModuleDefinitionError` naming the offending module,
  at import time. Relational checks (a dependency exists, ids are unique, the
  host satisfies `engine`) belong to the registry, which sees every module.

  Two rules worth calling out: a permission key must be namespaced with the
  module id (`billing.view`), because third-party modules share one permission
  space; and `migrations` accepts both an array and the namespace object from
  `import * as migrations`, flattening either to what TypeORM wants.

  Contracts, events and slots are deliberately absent: each lands with its own
  subsystem, so the manifest never describes something the framework cannot
  honor.

- **`resolveModules()`** — orders a set of modules so each one starts after its
  dependencies, and refuses the set when it cannot start safely: duplicate ids,
  missing dependencies, cycles, host incompatibility, or depending on a module
  that is installed but disabled. Throws `ModuleResolutionError`.

  A cycle is reported as the chain that forms it (`a -> b -> c -> a`), which is
  why the sort is a DFS rather than Kahn's algorithm. Unrelated modules keep
  their input order, so an installation migrates and mounts in the same
  sequence on every run.

  `engine` is matched against the host's base version: a host on `2.0.0-dev.0`
  satisfies `^2.0.0`. Strict semver ranks a prerelease below its own release,
  which would leave a prerelease host unable to load anything — exactly while
  2.0 is being built. It only drops the tag: `3.0.0-alpha` still fails `^2.0.0`.

- **`_modules` table, `ModuleStore` and `reconcileModules()`** — what an
  installation remembers about its modules, and how the code on disk is matched
  against it on boot. The framework creates the table itself through TypeORM's
  schema builder: it is read *before* any module migration runs, so it cannot
  come from one.

  The decision is pure and tested on its own (`reconcileModules()`); the store
  is only I/O. It reports what to install, what changed version (flagging a
  downgrade, which happens when a deploy is rolled back) and which modules are
  recorded but no longer in the code.

  Two rules it enforces: a new module arrives **disabled** unless it is core, so
  a release never puts unrequested screens in front of an operator — nor hands
  out a package that was not paid for once modules are licensed; and a module
  whose code is gone is **reported, never deleted**, because dropping data is
  the installer's call, not a boot sequence's.

  Turning a module off does not hide its data: every module present in the code
  contributes its entities to the DataSource regardless, so the tables and their
  contents stay. What this table governs is what runs.

- **`ModuleMigrator`** — runs each module's migrations in the order the modules
  were resolved, recording them in `_module_migrations`.

  TypeORM's own runner cannot do this: it sorts every migration in the
  DataSource by timestamp, globally, so a module written last year would migrate
  before the dependency it needs. Ordering by module first, and by timestamp only
  *within* a module, is what makes a dependency's tables exist before the
  dependent touches them. There is a test for exactly that case.

  Inside a module the order comes from the timestamp ending the class name, the
  convention TypeORM already uses. A migration without one is an error rather
  than a guess: `import * as migrations` yields an object whose key order nobody
  controls, and a wrong migration order is discovered in production, on data that
  already exists. Stamps compare as numbers — as text, `9000` sorts after
  `10000`.

  One transaction per migration, and the ledger row is written inside it: a
  migration that ran without leaving its row would run again on the next boot,
  over data it already changed.

- **Test harness on PGlite** (`test/helpers/test-db.ts`) — a real Postgres
  inside the process, no Docker. Dialect differences that SQLite would hide
  behave as they will in production. The database is created once per test file
  and the schema reset between cases, which took the migrator suite from 28s to
  3s. `npm test` now runs with `--experimental-vm-modules`, which PGlite needs.

- **`useModules()`** — the boot cycle, wired end to end. State is read from
  `_modules`, the graph is resolved into dependency order, pending migrations
  run, and only then are routes mounted: a route must never answer against a
  table its migration has not created yet. A broken graph or a failed migration
  refuses to start, because serving half-mounted is worse than not starting.

  Module routes go through the same pipeline as configured groups, so they get
  the same OpenAPI spec, the same logging and the same 404 behind them.

- **`ModuleLoader`** — reads a module's endpoints from its own globs, resolved
  against its `dir` (pass `__dirname`) rather than the process's working
  directory, so a module keeps working wherever it is mounted from. A module
  that declares routes and resolves to none is reported: that is a wrong glob,
  and silence turns it into endpoints that simply never answer.

- **`Liteb.close()`** — an ordered stop that does not end the process.
  `shutdown()` is the signal handler and calls `process.exit`, which makes it
  unusable from a test or from anything embedding liteb. `close({ database:
  false })` leaves a connection the caller owns untouched.

### Fixed

- `npm run build` now clears `dist/` and `types/` first. Without it the tarball
  shipped files from deleted modules — `templates/api`, `utilities/queue`,
  `utilities/transaction`, `templates/service`, `templates/middleware` — so a
  consumer could deep-import 1.x code that no longer exists in the source.


- `start()` no longer throws when handed an already-initialized DataSource. An
  application embedding liteb, or a test suite reusing a connection, hit
  `CannotConnectAlreadyConnectedError`; the live connection is adopted instead.

- **`Liteb.create()`** — builds the application from its modules and owns the
  DataSource. This is the inversion modules require: TypeORM needs the full
  entity list when the DataSource is *constructed*, and that list is the union
  of what every module contributes, which an application cannot assemble by
  hand without knowing each module's internals.

  Entities are collected from every module present in the code, enabled or not.
  Leaving a disabled module's entities out would drop its tables from TypeORM's
  view and make turning it back on a gamble; disabling decides what runs, never
  whether data is reachable.

  The same entity declared by two modules is refused: one of them is reaching
  into the other's domain, and unchecked it surfaces later as a confusing
  TypeORM error about a duplicate table.

  A DataSource can still be passed instead of connection options, and
  `new Liteb(dataSource)` keeps working unchanged.

- **Contracts between modules** — `contract<T>(id)` declares a capability, a
  module publishes it through `provides`, and a consumer reaches it with
  `this.get(Token)` from an endpoint or a task. The consumer imports the
  contract, never the implementation, which is what lets the providing module
  change or be swapped without touching anyone who calls it.

  Access is `this.get()` rather than a free `inject()`: resolving without an
  explicit receiver would need a process-wide container, and two applications
  in one process — a test suite, a worker beside a server — must not see each
  other's implementations. The container is per application, injected on the
  prototype like `db`.

  Implementations are built on first use, so a module nobody calls never pays
  for its dependencies and startup does not hang on something one endpoint
  needs. A contract provided by two modules is refused: consumers would get one
  by load order, a bug that moves between deploys. A cycle *while building* is
  reported instead of exhausting the stack; a mutual reference resolved on use
  stays valid, since that is how two modules legitimately call each other.

  Declaring `consumes` turns a missing provider into a refusal to start rather
  than a failure on whichever request needed it first, in production. The
  framework cannot infer it by reading code, which is why it is declared.

- **Scheduled tasks from modules** — a module's `tasks` globs are loaded and
  started on boot, receiving `db` and the container like an endpoint does. They
  follow the same rule as routes: only enabled modules get theirs started, so a
  disabled module never leaves a cron running, and `close()` stops them.

- `semver` as a direct dependency, to validate versions and `engine` ranges.

### Changed

- **`ModuleEntity` narrowed** from `Function | object` to
  `Function | EntitySchema<any>`. The wide version made
  `collectModuleEntities()` unassignable to a DataSource the application builds
  itself, which is a supported path — found while writing the example app
  against the published surface.

- **The example app under `src/` was rewritten** as one coherent flow, and is
  now covered by `test/demo-app.spec.ts`, which boots it against an in-process
  Postgres.

  The previous one had rotted without anyone noticing: `@Priority` was
  backwards, so `/users/all` resolved to the `:id` route and the handler
  received the literal string `"all"`; a `@Template` endpoint could never
  render because nothing ever called `setTemplates`; an endpoint carried a
  `previous` arrow property that shadowed the method and did nothing; and one
  module was a leftover from an unrelated project. None of it was reachable by
  any test.

  It is now `identity` and `catalog` (core) plus `reports` (optional, installs
  disabled), with per-module migrations and `synchronize: false`, exercising
  permissions, contracts, validation, `db.transaction()`, a view and a
  scheduled task. `http/demo.http` walks it request by request, and
  `npm run modules` toggles the optional one.

- **`Api` is now `Endpoint`.** The class models a single operation, not the whole
  API, and the name now says so. Its file moves to `lib/templates/endpoint.ts`.
  The internals that name it follow: `ApiReader` -> `EndpointReader`,
  `ApiHandler` -> `EndpointHandler`, `ApiClass` -> `EndpointClass`.
  The OpenAPI decorators (`ApiTag`, `ApiSummary`, `ApiDescription`,
  `ApiResponse`) keep their names: there, "Api" means OpenAPI.
  `setApis` / `addApis` are untouched for now — the module system replaces them.

### Removed

- **`Endpoint.error()` and `Endpoint.final()`**, and the `ErrorResponse` type
  with them. `previous()` stays.

  Measured against the main consumer: of 323 endpoints, 9 implemented each hook,
  and all 9 `error()` bodies were a single `rollbackTransaction()` while all 9
  `final()` bodies were a single `release()`. Nobody ever used `error()` for
  what it documented — reshaping the error response — because throwing the right
  error class already does that.

  So the hooks were not a lifecycle, they were a `try/catch/finally` split
  across three methods, which hid a transaction's boundaries from the code
  inside it: one endpoint opened on line 29, committed on line 83, rolled back
  on 111 and released on 114, and forgetting any of them was not a compile
  error. `this.db.transaction(cb)` makes commit, rollback and release the
  callback's contract instead.

  `previous()` is kept because it is the one hook nothing else replaces: it runs
  on the instance with validated `params`/`body`/`query` and the resolved
  `auth`, where a `@Use` middleware only sees the raw request, and throwing from
  it skips `main()`.

  Dropping `error()` also collapsed the handler's nested double `catch`, which
  only existed because that hook could itself throw.

- **`setApis()`, `addApis()`, `setTasks()`**, and the public constructor and
  `useModules()`. `Liteb.create({ db, modules })` is the only entry point, and
  `modules` is required.

  They were the 1.x way to mount code by glob, and keeping them made the module
  manifest optional: an application could define routes outside any module, so
  the module system was a second path rather than the path. Now anything that
  serves a request belongs to a module, which means it can always be traced to
  something installable, disableable and versioned. Versioning by URL prefix,
  which `addApis` used to serve, is a module per prefix.

  The constructor is private because the only instances it could build are an
  application with no modules — and therefore nothing to serve — or one whose
  DataSource never learned about its modules' entities, which fails later, at
  the first query.

  `setAuth()` went with them: with one entry point, `create({ auth })` is it.

- **`Endpoint.getSession()` / `setSession()`** and the `SessionDataExtends<T>`
  type. They returned `any` (666 untyped call sites in the main consumer, for
  two keys) and hard-wired the framework to `express-session`. Replaced by
  `this.auth`; writing to the session — a concern of whichever module owns
  login — is `this.request.session` directly.

  As a result `express-session` is no longer a peer dependency: add it only if
  your resolver uses cookie sessions.


**Breaking.** Everything marked `@deprecated` in `1.0` is gone. Migration is the
one stated in each deprecation notice.

- `Get` / `Post` / `Put` / `Delete` / `Patch` aliases — use `HttpGet` /
  `HttpPost` / `HttpPut` / `HttpDelete` / `HttpPatch`.
- `Queue`, `Transaction`, `createTransaction` and `Api.createTransaction()` —
  use TypeORM's `dataSource.transaction(cb)` / `this.db.transaction(cb)`.
- `Service` base class — define your own in the application.
- `InternalError` — throw a native `Error`; `ErrorControl` already maps it to a
  500, keeping its message and logging it.
- `Middleware` class — use a middleware function with `@Use`. `@Use` now only
  accepts `MiddlewareFn`, which removes the class/function branch from
  `ApiHandler` and the runtime `class` sniffing it relied on.

## [1.0.0-rc.1]

First release candidate for `1.0.0`. This entry summarizes everything that
changed since `1.0.0-beta.7.5`. It contains a few **breaking changes** — see the
Migration section at the bottom.

### Added

- **`HttpGet` / `HttpPost` / `HttpPut` / `HttpDelete` / `HttpPatch`** — canonical
  HTTP verb decorators. The old `Get`/`Post`/... names remain as deprecated
  aliases (see Deprecated).
- **`HttpQuery`** — support for the HTTP `QUERY` method: a safe, idempotent verb
  that allows a body (declare its criteria with `@Body`). Note it is an IETF
  draft; it is excluded from the OpenAPI spec, and if the runtime does not
  support the verb the route is skipped with a clear log line instead of
  crashing startup.
- **Graceful shutdown** — the framework registers `SIGTERM`/`SIGINT` handlers
  that stop scheduled tasks, drain in-flight requests and close the database
  connection. A public `liteb.shutdown()` is also available.
- **404 fallback** — unmatched routes now respond with the same error contract
  as the rest of the framework (`{ message, identifier, ... }`) instead of
  Express's default HTML.
- **Configurable logging** — `Logger.configure({ dir, level })` plus the
  `LITEB_LOG_DIR` and `LITEB_LOG_LEVEL` environment variables. The framework now
  logs to the console only by default and never touches the filesystem unless a
  directory is configured; if the directory cannot be created it degrades to the
  console instead of failing to start.
- **Test suite** — `npm test` now runs a real Jest suite (ts-jest) covering
  routing, schema validation, error mapping, the 404 handler, per-request state
  isolation and the HTTP verbs.

### Changed

- **`start()` now fails fast on database errors** (behavioral, potentially
  breaking): if `DataSource.initialize()` fails it rethrows, so the process
  exits with a non-zero code and your orchestrator restarts it. Previously it
  logged the error and returned, leaving a live process with no server.
- **Logging is console-only by default** (behavioral, breaking): the framework
  no longer writes `logs/*.log` automatically. See Migration.
- **`reflect-metadata` is now imported by the framework itself**, instead of
  relying on TypeORM's transitive import.
- **`engines`**: Node `>=20` (was `>=21`).
- **Packaging**: duplicated peer/dependency entries were removed — `typeorm`,
  `class-validator` and `typescript` are now peer dependencies only.
- `ErrorControl`'s default message is now `"Internal server error."`, consistent
  with the 500 status it already returned.

### Deprecated

These still work but will be removed in a future major version:

- `Get` / `Post` / `Put` / `Delete` / `Patch` → use `HttpGet` / `HttpPost` / ...
- `Queue`, `Transaction`, `Api.createTransaction()` → use TypeORM's
  `dataSource.transaction(cb)`.
- `Service<T>` → define your own base class in your application.
- `InternalError` → throw a native `Error`.
- `Middleware` (class) → use a middleware function with `@Use`.

### Removed

- **CLI** (`bin/`, the `liteb` command) and the `module` / `guard` / `schedule`
  npm scripts. The scaffolding templates were out of sync with the framework and
  generated code that did not compile.
- **`RequestMethod`** enum (unused, was not exported).
- **`ErrorIdentifier.CLIENT`** and **`ErrorIdentifier.DEPENDENCY`** (breaking):
  both were part of the public enum but the framework never emitted them.
- **`@Version`** decorator — it was defined but never wired into routing.
- Dead fields and members: `RouterOption.cors`, `RouterOption.auth`,
  `getCors()`, and `Server.enpoint()`.
- The `INV` interface in `ConfigService` (`get()` is now typed as `string`).
- Dependencies dropped from the published package: `@faker-js/faker`,
  `socket.io`, `nodemailer`, `node-cache`, `multer` (runtime), `commander`.
  `cors` moved to dev dependencies. This significantly reduces install size.

### Fixed

- Build output layout is pinned via `rootDir`, so `dist/lib` and `types/lib`
  match the package `main`/`types` entries. The incremental `tsbuildinfo` was
  moved out of `dist`, shrinking the published tarball by more than half.

### Migration

- **Logging**: if you relied on the automatic `logs/*.log` files, enable them
  explicitly — `Logger.configure({ dir: './logs' })` in code, or set
  `LITEB_LOG_DIR=./logs` (recommended in containers).
- **Startup**: if you called `liteb.start(port)` and depended on it silently
  returning when the database was unreachable, wrap it in a `try/catch` — it now
  throws.
- **HTTP decorators**: no action required; the old names keep working. Migrate to
  the `Http*` names at your own pace.
- **`ErrorIdentifier`**: if you referenced `CLIENT` or `DEPENDENCY` in
  TypeScript, remove those references — the framework never produced them.
