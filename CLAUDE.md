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

### Module system (`lib/modules/`)

| File | Responsibility |
| --- | --- |
| `module-manifest.ts` | Types + `ModuleDefinitionError` |
| `define-module.ts` | Declares a module; validates what it knows alone |
| `resolve-modules.ts` | Graph: order, cycles, `engine`, enabled |
| `reconcile-modules.ts` | Code vs. recorded state (**pure**) |
| `module-store.ts` | `_modules` I/O |
| `module-migrator.ts` | Per-module migrations + `_module_migrations` |
| `module-loader.ts` | Reads endpoints/tasks from a module's globs |
| `container.ts` / `build-container.ts` | Contracts between modules |
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

### Errors

`ErrorControl` maps `SchemaError` (422), `CustomerError` (406), `NotFoundError`
(404), `AuthError` (401), `CustomError` (free status) and a native `Error` (500).
The 404 fallback reuses `NotFoundError`, so an unmatched route answers with the
same contract.

## 1.x → 2.0

| 1.x | 2.0 |
| --- | --- |
| `Api` | `Endpoint` (`lib/templates/endpoint.ts`) |
| `ApiReader` / `ApiHandler` | `EndpointReader` / `EndpointHandler` |
| `new Liteb(ds)` + `setApis(...)` | `Liteb.create({ db, modules })` |
| Entities by global glob | Declared per module |
| One migrations folder | Per module, own ledger |
| `Get`/`Post`/… | `HttpGet`/`HttpPost`/… |
| `Queue`, `Transaction` | `dataSource.transaction(cb)` |
| `Service`, `InternalError`, `Middleware` class | Removed |

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
- Peer deps, not bundled: `typeorm`, `express`, `express-session`,
  `class-validator`, `typescript`. `reflect-metadata` and `semver` are direct.
- Not published yet. To test in a consumer: `npm run build && npm pack`, then
  install the `.tgz`. A tarball is closer to what npm installs than `npm link`,
  which resolves through symlinks and hides a bad `files` entry.

## Still missing in 2.0

Event bus, extension slots, and enforcing the permissions and license gate that
the manifest already declares.
