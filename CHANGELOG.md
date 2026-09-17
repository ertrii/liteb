# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2.0.0

Work toward `2.0.0`, which turns liteb from a routing library into a module
framework. The `1.x` line is frozen on the `v1` branch and only receives fixes.

### Added

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

- `start()` no longer throws when handed an already-initialized DataSource. An
  application embedding liteb, or a test suite reusing a connection, hit
  `CannotConnectAlreadyConnectedError`; the live connection is adopted instead.

- `semver` as a direct dependency, to validate versions and `engine` ranges.

### Changed

- **`Api` is now `Endpoint`.** The class models a single operation, not the whole
  API, and the name now says so. Its file moves to `lib/templates/endpoint.ts`.
  The internals that name it follow: `ApiReader` -> `EndpointReader`,
  `ApiHandler` -> `EndpointHandler`, `ApiClass` -> `EndpointClass`.
  The OpenAPI decorators (`ApiTag`, `ApiSummary`, `ApiDescription`,
  `ApiResponse`) keep their names: there, "Api" means OpenAPI.
  `setApis` / `addApis` are untouched for now — the module system replaces them.

### Removed

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
