# The API, name by name

What an application writes: the 97 names you reach for, and what each one is
called. The reasoning lives in [the guide](./guide.md), the authorization rules
in [Authorization](./authorization.md), and the commands in
[the CLI](./cli.md).

The first four sections are enough to build something.

> Taken from the emitted `.d.ts` through the TypeScript API, so the signatures
> are what the compiler sees, shortened only where a generic default adds
> nothing.
>
> `liteb` exports 41 more names — the module registry, the migrator, the loaders,
> the metadata the decorators store. They are public because the CLI is a
> separate process and has to reach them, not because an application needs them.
> They are in the types if you ever do.

---

## 1. Standing the application up

| Name | Type | What it is |
| --- | --- | --- |
| `Liteb` | class | The application. Built by `Liteb.create()`, never with `new`. |
| `Liteb.create` | `(options: LitebOptions) => Promise<Liteb>` | Resolves the modules, opens the database, reconciles what is installed, and hands back an application that has not started listening. |
| `LitebOptions` | interface | Everything an application decides: `db`, `modules`, `basePath`, `version`, `auth`, `cors`, `requestId`, `docs`, `health`, `logs`. |
| `DocsConfig` | interface | `{ path?, info? }` — where `/docs` answers and what the OpenAPI document says about itself. |
| `ConfigService` | class | `.get(name)` reads an env var, `.all()` every one, `.mode()` the `NODE_ENV`. **It is typed `string` and does not check**: a variable nobody set comes back `undefined` anyway, so check the ones that matter at boot. |
| `MODE` | `'production' \| 'development'` | What `ConfigService.mode()` returns. |

### What a `Liteb` gives you

| Member | Type | What it does |
| --- | --- | --- |
| `start` | `(port: number) => Promise<void>` | Mounts routes, starts the routines, listens. |
| `close` | `(options?: { database?: boolean }) => Promise<void>` | Stops without ending the process: routines, then the server, then the connection. What a test calls. |
| `shutdown` | `(signal?: string) => Promise<void>` | `close()` and then exit. What a signal handler calls. |
| `connect` | `() => Promise<void>` | Opens the connection without mounting anything, for a command that only touches the database. |
| `migrate` | `(options?: { dryRun?: boolean }) => Promise<AppliedMigration[]>` | Runs every pending migration, per module, in dependency order. `dryRun` answers what WOULD run. |
| `migrationStatus` | `() => Promise<ModuleMigrationStatus[]>` | What each module declares and what of it already ran. |
| `pendingSchema` | `() => Promise<SchemaDiff>` | The SQL the database is missing to match the entities. What `migration:generate` is built on. |
| `tableOwners` | `() => Map<string, string>` | Which module owns each table, read off the entities each one declares. |
| `permissions` | `() => RegisteredPermission[]` | Every key the installed modules declare, with its module. The catalog a roles screen renders. |
| `getApp` | `() => Express` | The Express application, for anything liteb does not wrap. |
| `use` | `(middleware) => void` | Adds middleware to that application. |
| `static` | `(pathname: string, root: string) => void` | Serves a directory of files under a URL prefix. |
| `setTemplates` | `(engine: 'ejs' \| 'pug', root: string \| string[]) => Promise<void>` | Configures the engine `view()` renders with. |

---

## 2. What you write

Four base classes. A file exporting one is found by the folder it is in — see
[the standard layout](./cli.md#why-most-commands-edit-nothing).

| Name | Type | What it is |
| --- | --- | --- |
| `Endpoint<B, P, Q>` | class | One HTTP endpoint. Generics are the validated body, params and query. |
| `Routine` | class | Scheduled work. `@Cron` decides when. |
| `Listener<P>` | class | Handles one event. `@On` says which. |
| `Provider` | class | Answers a contract or fills a slot. `@Provides` / `@Contributes`. |
| `DataJson` | `Record<string, any> \| Response \| Output \| null` | What an endpoint's `main()` may return. |
| `UploadedFile` | interface | One file off a multipart request. liteb's own type, not a global. |

### Inside an `Endpoint`

| Member | Type | What it is |
| --- | --- | --- |
| `main` | `() => DataJson \| Promise<DataJson>` | The endpoint. The one method you must write. |
| `previous` | `() => void \| Promise<void>` | Runs before `main`, on the same instance. |
| `body` `params` `query` | `B` `P` `Q` | Validated input. `null` unless a `@Body` / `@Params` / `@Query` schema says otherwise. |
| `auth` | `Auth` | Who is asking and what they may do. |
| `db` | `DataSource` | The connection, injected. |
| `container` | `Container` | Contracts other modules provide. |
| `events` | `EventBus` | For `emit`. |
| `file` / `files` | `UploadedFile` / `UploadedFile[]` or a map | Multipart uploads. |
| `request` / `response` | Express `Request` / `Response` | The raw pair, for what liteb does not cover. |
| `httpStatus` | `HttpStatus` | Set it to answer something other than 200. |
| `requestId` | `string` | The id in the `x-request-id` header and in every log line of this request. |

`Routine` has `start(now: Date \| 'manual' \| 'init')`, `Listener` has
`on(payload: P)`, and all of them get `db`, `container` and `events` the same
way.

---

## 3. Decorators

| Name | Type | What it does |
| --- | --- | --- |
| `HttpGet` `HttpPost` `HttpPut` `HttpPatch` `HttpDelete` `HttpQuery` | `(path?: string) => ClassDecorator` | Method and path. Without a path the endpoint answers at its group's root. |
| `Group` | `(name: string, options?: GroupOptions) => ClassDecorator` | The URL segment before the path. Defaults to the module id, so the scaffold writes none. |
| `Priority` | `(number: number) => ClassDecorator` | Mount order, for a literal route a `:param` sibling would otherwise swallow. |
| `Use` | `(middleware: MiddlewareFn) => ClassDecorator` | Express middleware for this endpoint only. |
| `Body` `Params` `Query` | `(Schema: new () => object) => ClassDecorator` | Validates that part of the request against a class-validator DTO, and types it. |
| `Cron` | `(expression: string, options?: ScheduleOptions) => ClassDecorator` | When a routine runs. |
| `On` | `<T>(token: EventToken<T>) => ClassDecorator` | Which event a listener handles. |
| `Provides` | `<T>(token: Contract<T>) => ClassDecorator` | The contract a provider answers. |
| `Contributes` | `<T>(target: Slot<T>) => ClassDecorator` | The slot a provider contributes to. |
| `ApiTag` `ApiSummary` `ApiDescription` `ApiResponse` `ApiHidden` | class decorators | What `/docs` says about this endpoint, or that it says nothing. |
| `MiddlewareFn` | `(req, res, next) => void` | What `@Use` takes. |
| `GroupOptions` | interface | What `@Group` takes besides the name. |

---

## 4. Modules, permissions and authorization

### Declaring a module

| Name | Type | What it is |
| --- | --- | --- |
| `defineModule` | `<const P>(manifest: ModuleManifest<P>) => ResolvedModule<PermissionKeysOf<P>>` | Declares a module and validates it at import time. The `const` parameter is what keeps the permission keys as literals. |
| `ModuleManifest<P>` | interface | What a module says about itself: `id`, `version`, `label`, `core`, `engine`, `requires`, `dir`, `permissions`, `consumes`, the glob fields, and the four lifecycle hooks. |
| `ResolvedModule<K>` | interface | The manifest with every default applied. Also carries `permissionKeys: K[]`. |
| `ModulePermission<K>` | interface | `{ key, label? }`. The label is optional because a key usually says it. |
| `PermissionDeclaration<K>` | `K \| ModulePermission<K>` | One entry of `permissions`: a key, or a key with text. |
| `ModuleHook` | `(ctx: ModuleContext) => void \| Promise<void>` | `onInstall`, `onEnable`, `onDisable`, `onUninstall`. |
| `ModuleContext` | interface | `{ db }` — what a hook receives. |
| `ModulePattern` | `string \| string[]` | A glob field's value. |
| `ModuleEntity` | `Function \| EntitySchema` | An entity, as TypeORM types one. |
| `ModuleMigrations` | `Function[] \| Record<string, unknown>` | A list of migration classes, or a namespace import of them. |
| `ModuleDefinitionError` | class | Thrown by `defineModule` when the manifest is wrong. At import, before anything boots. |

### Teaching the compiler the keys

| Name | Type | What it is |
| --- | --- | --- |
| `PermissionsOf<M>` | conditional type | Reads a module's keys into the shape `LitebAuth.Permissions` wants. One `declare global` block per module. |
| `RegisteredPermission` | interface | `ModulePermission` plus the `moduleId` that declared it. What `app.permissions()` returns. |
| `PermissionKey` | conditional type | A declared key, or any string while an application has declared none. What `assert` and `can` take. |

### Turning a request into an actor

| Name | Type | What it is |
| --- | --- | --- |
| `defineAuth` | `(resolver: AuthResolver, ...fallbacks: AuthResolver[]) => AuthResolver` | The `auth` resolver. Several strategies are tried in order, first one to recognize the caller wins. |
| `cacheAuth` | `(resolver: AuthResolver, options: AuthCacheOptions) => CachedAuthResolver` | Remembers the answer per caller. Trades freshness for the lookup, so `ttl` is required. |
| `AuthCacheOptions` | interface | `{ key, ttl, max? }`. The key is the application's: which part of a request is the credential is what the resolver hides. |
| `CachedAuthResolver` | `AuthResolver & { invalidate(key), clear() }` | `invalidate` is not optional — the TTL is the floor, not the contract. |
| `AuthResolver` | `(request, context) => AuthResult \| null \| undefined \| Promise<…>` | The seam. `null` means anonymous. |
| `AuthResult` | interface | `{ actor, permissions? }`. |
| `AuthContext` | interface | `{ db, get }` — what a resolver gets besides the request. |
| `Actor` | `LitebAuth.Actor` | Whoever is calling, as the application declared it. Empty until it does. |
| `Auth` | class | `this.auth`: `isAuthenticated`, `optional`, `actor`, `permissions`, `can(...)`, `assert(...)`. `actor` and `assert` throw; `optional` and `can` do not. |

---

## 5. Wiring between modules

| Name | Type | What it is |
| --- | --- | --- |
| `contract` | `<T>(id: string) => Contract<T>` | A token for a capability one module needs and another answers. |
| `Contract<T>` | interface | That token. Carries `T` at the type level only. |
| `Container` | class | Resolves them: `.get(contract)`, `.all(slot)`, `.has()`, `.providerOf()`, `.ids()`. Reachable as `this.container`. |
| `ContractError` | class | Nobody provides that contract, or two modules do. |
| `event` | `<T>(id: string) => EventToken<T>` | A token for something that happened. |
| `EventToken<T>` | interface | That token, typed by its payload. |
| `EventBus` | class | `.emit(token, payload)`, plus `.ids()` and `.countFor()` for what is listening. |
| `slot` | `<T>(id: string) => Slot<T>` | A token many modules may contribute to, where a contract takes exactly one. |
| `Slot<T>` | interface | That token. `container.all(slot)` answers an array; empty is a normal answer. |

---

## 6. Answering with something other than JSON

| Name | Type | What it is |
| --- | --- | --- |
| `view` | `(template: string, data?: object) => Output` | Renders a template with the engine `setTemplates` configured. |
| `pdf` | `(content: Buffer \| Uint8Array \| Readable, options?: PdfOptions) => Output` | Sends a PDF, inline or as a download. |
| `csv` | `(rows: readonly object[], options?: CsvOptions) => Output` | Turns rows into a CSV, with the columns you name. |
| `file` | `(content: FileContent, options?: FileOptions) => Output` | Any file: bytes, a string or a stream. |
| `Output` | abstract class | What all four return, and what `main()` may hand back. Extend it for a format liteb does not have. |
| `FileContent` | `Buffer \| Uint8Array \| string \| Readable` | What `file()` accepts. |
| `FileOptions` `PdfOptions` `CsvOptions` `CsvColumn` | interfaces / types | Filename, download or inline, content type; and for CSV, the columns and their headers. |

---

## 7. Failing

Throw one of these anywhere and the framework answers the right status, in one
shape — RFC 9457 `application/problem+json`. All six extend `Error`.

| Name | Type | Answers |
| --- | --- | --- |
| `SchemaError<T>` | `(message, fieldsError?)` | 422, with which field is at fault. |
| `CustomerError<T>` | `(message, fieldsError?)` | 406 — the request is understood and refused. |
| `NotFoundError` | `(message)` | 404. |
| `AuthError` | `(message)` | 401 — authenticate and try again. |
| `ForbiddenError` | `(message, missing?)` | 403 — do not bother. `missing` names the keys and reaches the client. |
| `CustomError` | `(status, message, response?)` | Whatever status you pass, with a payload. |
| `ProblemBody` | interface | The body: `type`, `title`, `status`, `detail`, `code`, `errors`, `requestId?`, `missing?`, `response?`. |
| `ErrorIdentifier` | enum | The machine-readable `code`. Branch on this, not on `title`. |
| `HttpStatus` | enum | The status codes, by name. |

---

## 8. Logs, health, CORS, docs

| Name | Type | What it is |
| --- | --- | --- |
| `Logger` | class | `.info()`, `.warn()`, `.error()`, `.router()`, `.configure()`, `.flush()`, `.clear(category)`. Writes to `logs/` by file and level. |
| `LoggerOptions` | interface | `{ dir?, level?, files? }` — where the logs go, and which to turn off. |
| `LogFiles` | interface | The five files (`app`, `info`, `warn`, `error`, `router`), each renameable or `false`. |
| `HealthConfig` | interface | `{ path?, details?, checks?, timeout? }`. Without it there is no `/health` route at all. |
| `HealthCheck` | `() => boolean \| Promise<boolean>` | One check the application owns. Named anything except `server` and `database`. |
| `HealthReport` | interface | What `/health` answers. |
| `HealthStatus` | `'pass' \| 'fail'` | Per check, and overall. |
| `RequestIdConfig` | interface | `{ header?, generate? }` — trust an incoming id, or make one. |
| `currentRequestId` | `() => string` | The id of the request being handled, from anywhere in the call stack. |
| `CorsConfig` | interface | Origins, methods, headers, credentials. |
| `CorsConfigError` | class | The CORS options contradict themselves, refused at boot. |
| `OpenAPIInfo` | interface | The title and version `/docs` reports, passed as `docs.info`. |

---

## Not exported, on purpose

`LitebAuth` is a **global namespace**, not an export: an interface re-exported
from a package cannot be merged from outside, and merging is the whole point. An
application widens `LitebAuth.Actor` and `LitebAuth.Permissions` with
`declare global`, which is what `src/config/auth.ts` and
`src/config/permissions.ts` are for.
