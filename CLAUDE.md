# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`liteb` is a lightweight NestJS-inspired backend framework (npm package, currently `1.0.0-beta.5.0`). It is NOT an application — it is a library that other projects depend on. The repo has a dual layout:

- **[lib/](lib/)** — the published framework source. This is what ships to npm (`./dist` + `./types`).
- **[src/](src/)** — a sample/demo application used to dogfood and run the framework during development. It imports `lib/` directly via `'../../../../lib'` relative paths (not via the package name).
- **[bin/](bin/)** — CLI scaffolding tool (`liteb` command), built and shipped alongside the library.

When making framework changes, edit `lib/`. The `src/` tree is only there to exercise those changes locally with `npm run dev`.

## Common commands

```bash
npm run dev        # nodemon → ts-node ./src/index.ts (uses NODE_ENV=development); watches src/ and lib/
npm run build      # tsc -p tsconfig.build.json; emits ./dist (JS) and ./types (.d.ts)
npm run clear      # rimraf ./dist ./types
npm test           # jest (note: jest.config.ts uses ts-jest preset but transforms via babel-jest)
npm run module -- -n <name>   # scaffold a new module under src/<name>/ from bin/templates/
```

To run a single jest test file: `npx jest path/to/file.spec.ts`. To run a single test by name: `npx jest -t "test name"`.

The dev server requires PostgreSQL credentials in `.env` (see [.env.template](.env.template)) — `src/index.ts` constructs a `DataSource` with `type: 'postgres'` and `synchronize: true` and the framework will not start if `dbSource.initialize()` fails. There is currently no way to skip DB initialization, even when only working on routing/template logic.

Node `>=21.0.0` is required (per [package.json](package.json) `engines`).

## Architecture: how the framework boots

The whole framework is orchestrated by [lib/core/liteb.ts](lib/core/liteb.ts) (`Liteb.start()`). Understanding this single method is the key to the codebase:

1. **Configuration phase** (synchronous-ish, before `start()`): the user calls `setApis(basePath, patterns)`, `setTasks(patterns)`, `setTemplates(engine, root)`, `static(...)`, and `use(...)`. The `set*` methods kick off async glob expansion via [PatternResolve](lib/core/pattern-resolver.ts) but do NOT await — they store promise arrays on the instance.
2. **start(port)** awaits all those promise arrays, then:
   - `dbSource.initialize()` (TypeORM connect — fatal if it fails)
   - Awaits `templatesAsync` and registers view directories on Express
   - Awaits `modulesAsync`, wraps each exported class in an [ApiReader](lib/core/api-reader.ts), filters invalid ones, sorts by `@Priority`, **groups by `@Module` basePath**, and registers Express routers
   - For each API class, an [ApiHandler](lib/core/api-handler.ts) chains middleware → schema validation → main handler
   - Calls `listen(port)`
   - Awaits `tasksAsync` and starts each via [InterpreterTask](lib/core/interpreter-task.ts) (cron-scheduled)

### Decorator-driven discovery

There is no central registration. Files are discovered by **glob patterns** passed to `setApis`/`setTasks`/`setTemplates` (e.g. `'./src/modules/**/apis/*.api.ts'`). [PatternResolve](lib/core/pattern-resolver.ts) `require()`s each match and reads `Object.values(mod)` to collect all exports.

Every exported class is then introspected via `reflect-metadata` keys defined as `Symbol`s in [lib/decorators/](lib/decorators/):

- `MODULE` (`@Module(basePath)`) — required; without it `ApiReader.isInvalid()` is true and the class is skipped
- `GET`/`POST`/`PUT`/`DELETE`/`PATCH` (`@Get(path)` etc.) — required; sets the HTTP verb + path
- `BODY`/`PARAMS`/`QUERY` (`@Body(Schema)`, `@Params(Schema)`, `@Query(Schema)`) — class-validator DTO classes; runs through [services/schema-validator](lib/services/schema-validator.ts) before `main()`
- `USE` (`@Use(MiddlewareClass | fn)`) — runs before schema validation
- `PRIORITY` (`@Priority(n)`) — controls route registration order within a module group
- `TEMPLATE` (`@Template(viewName)`) — switches the response from JSON to `res.render()`
- `SCHEDULE` (`@Schedule(cronExpr, opts)`) — only valid on `Task` subclasses; consumed by `InterpreterTask`
- `VERSION` (`@Version(n)`) — defined but currently unused at routing time

Decorators set metadata on the class. `ApiReader` reads that metadata in its constructor. There are NO method-level decorators — each API endpoint is **its own class** that extends [Api](lib/templates/api.ts) and implements `main()` (and optionally `previous()`, `error()`, `final()` lifecycle hooks). This is the biggest architectural divergence from NestJS-style controllers.

### How injected state reaches an API instance

[ApiHandler.main](lib/core/api-handler.ts) injects request data **onto `ApiClass.prototype`** (NOT into the constructor):

```ts
ApiClass.prototype.db = this.dbSource;
ApiClass.prototype.params = req.params;
// ...
const apiClass = new ApiClass();
```

This is why API classes can do `private readonly userRep = this.db.getRepository(User);` as a field initializer — `this.db` is already set on the prototype before `new` runs. **Do not change this to constructor injection without auditing every example API.** It also means concurrent requests share prototype state during the brief window between assignment and construction; this is currently treated as acceptable.

### Error handling contract

[ApiHandler.main](lib/core/api-handler.ts) wraps `apiClass.main()` in try/catch and routes thrown errors through `apiClass.error(err)` and then [ErrorControl](lib/utilities/error-control.ts), which maps known error classes from [lib/utilities/errors.ts](lib/utilities/errors.ts) (`SchemaError`, `CustomerError`, `NotFoundError`, `AuthError`, `CustomError`) to HTTP statuses. `apiClass.final()` always runs in a `finally`.

## Conventions for the demo app (src/)

- Module files use suffix-based discovery: `*.api.ts`, `*.task.ts`, `*.entity.ts`, `*.dto.ts`. Glob patterns in [src/index.ts](src/index.ts) match these.
- Each module folder under [src/modules/](src/modules/) typically has `apis/`, `entities/`, `dto/`, optionally `tasks/` and `views/`.
- Views are discovered separately via `setTemplates('pug', './src/modules/**/views')`.
- DTOs are plain class-validator classes; they are passed by reference to `@Body`/`@Params`/`@Query`.

## Things to know before editing

- `tsconfig.json` has `strictNullChecks: false`, `noImplicitAny: false`, `experimentalDecorators: true`, `emitDecoratorMetadata: true`. The framework relies on emit-decorator-metadata; do not disable it.
- The build (`tsconfig.build.json`) excludes `./src` and `*.spec.ts` — only `lib/` and `bin/` ship.
- Several APIs are explicitly marked `@deprecated`: `Transaction` (use `Queue` or `createQueryRunner`), `InternalError` (use `Error`), `Api.createTransaction`. Prefer the non-deprecated path in new code.
- `bin/templates/controller.txt` references decorators (`@Controller`, `@Param`) that do **not** exist in `lib/index.ts`'s exports. The scaffolding template is out of sync with the framework's actual API surface. If you regenerate from the template, the result will not compile until the template is updated.
- The README's "Progress" table marks `Testing` as `❌` and `API Documentation (Swagger)` as `❌` even though `swagger-ui-express` is a dependency and `jest` is wired up — these are partial/aspirational, not finished features.
