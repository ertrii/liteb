# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
