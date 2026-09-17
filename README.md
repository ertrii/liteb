# Liteb

Liteb is a lightweight and simple backend framework. Its main goal is to facilitate the development of modern APIs with minimal configuration while following best practices. Liteb is inspired by the architecture and ease of use of frameworks like NestJS, offering modular organization, intuitive route handling, database integration through TypeORM, and support for scheduled tasks.

With Liteb, you can quickly define your API modules and controllers, associate middlewares and schema validations, and manage recurring or scheduled tasks. The framework prioritizes ease of use, low resource consumption, and a short learning curve, without sacrificing the power needed to build robust and scalable applications.

This project is designed for developers who are looking for a simple and fast alternative to launch backend services without the overhead of complex configurations, while maintaining a solid and extensible structure.

## Requirements

- **Node.js >= 20**
- **PostgreSQL** (or any database supported by TypeORM) reachable at startup
- `reflect-metadata` is loaded by the framework itself — you do not need to import it

## Install

```bash
npm install liteb
```

`liteb` relies on a few peer dependencies you provide in your app: `typeorm`, `express`, `class-validator` and `typescript`. Add `express-session` only if your auth resolver uses cookie sessions — the framework no longer depends on it.

## Feature status

| Feature                     | Status |
| --------------------------- | ------ |
| Routing                     | ✔      |
| Schema validation           | ✔      |
| Scheduler / Tasks           | ✔      |
| API docs (Swagger / OpenAPI)| ✔      |
| Non-JSON answers (view/PDF/CSV) | ✔  |
| Static files                | ✔      |
| Cookie manager              | ✔      |
| Environment vars            | ✔      |
| Testing                     | ✔      |
| Configurable logging        | ✔      |
| Graceful shutdown           | ✔      |
| Installable modules         | ✔      |
| Contracts between modules   | ✔      |
| Per-module migrations       | ✔      |
| Authentication seam         | ✔      |
| Events between modules      | ✔      |
| Extension points (slots)    | ✔      |

## Defining endpoints

Every endpoint is **its own class** that extends `Endpoint` and implements `main()`. Routing metadata comes from decorators; the class is discovered by the `routes` glob of the module it belongs to (see [Modules](#modules)).

```typescript
import { Endpoint, Module, HttpGet, Params, NotFoundError } from 'liteb';
import { IsUUID } from 'class-validator';

class UserParams {
  @IsUUID()
  id: string;
}

@Module('users')
@HttpGet(':id')
@Params(UserParams)
export class GetUserApi extends Endpoint<UserParams> {
  // `this.db` is available in field initializers.
  private readonly repo = this.db.getRepository(User);

  async main() {
    const user = await this.repo.findOneBy({ id: this.params.id });
    if (!user) throw new NotFoundError('User not found');
    return user; // serialized as JSON with status `this.httpStatus` (default 200)
  }
}
```

- **Lifecycle**: `previous()` → `main()`. `previous()` is optional and runs on the same instance, with `params`, `body`, `query` and `auth` already in place — throwing from it skips `main()`, which is what makes it a guard. There is no `error()` or `final()` hook: throw the right error class and the framework maps it, and wrap work that must commit or roll back in `this.db.transaction(cb)`.
- **Request state** (`this.params`, `this.body`, `this.query`, `this.request`, `this.response`, `this.file(s)`) is injected per request.
- **Errors**: throw a framework error to get a mapped HTTP status — `NotFoundError` (404), `AuthError` (401), `ForbiddenError` (403), `CustomerError` (406), `SchemaError` (422), `CustomError(status, ...)`. Any other thrown value becomes a 500. Unmatched routes return the same `{ message, identifier }` shape with 404.
- **Who is asking** is `this.auth` (see [Authentication](#authentication)).

### Transactions

There is no transaction hook and no transaction decorator. Use TypeORM's own:

```typescript
async main() {
  return this.db.transaction(async (manager) => {
    const charge = await manager.save(Charge, { ... });
    await manager.update(Subscription, id, { lastChargeId: charge.id });
    return charge;
  });
}
```

Commit, rollback and release are the callback's contract, so they cannot be forgotten. Spreading them across lifecycle hooks — `startTransaction` in one method, `commit` in another, `rollback` in a third — hides the transaction's boundaries from the code that depends on them; that is why those hooks are gone.

### HTTP verb decorators

| Decorator     | HTTP method |
| ------------- | ----------- |
| `@HttpGet`    | GET         |
| `@HttpPost`   | POST        |
| `@HttpPut`    | PUT         |
| `@HttpDelete` | DELETE      |
| `@HttpPatch`  | PATCH       |
| `@HttpQuery`  | QUERY       |

> `@Get`, `@Post`, `@Put`, `@Delete` and `@Patch` are still exported as **deprecated aliases** of their `Http*` counterparts, so existing code keeps working. Prefer the `Http*` names in new code.

**About `@HttpQuery`**: QUERY is a safe, idempotent method that (unlike GET) allows a body — useful for searches whose criteria are too large for the query string. Declare the criteria with `@Body`. Note that QUERY is an IETF draft (`draft-ietf-httpbis-safe-method-w-body`): it needs a Node whose HTTP parser recognizes it, may not be supported by proxies/CDNs, and is excluded from the OpenAPI spec. If the runtime doesn't support the verb, the route is skipped with a clear log line instead of crashing startup.

### Schema, middleware and priority

```typescript
@Module('users')
@HttpPost()
@Body(CreateUserDto)          // validated with class-validator before main()
@Use(requireAuth)             // a (req, res, next) function
@Priority(1)                  // registers before `:param` routes in the same module
export class CreateUserApi extends Endpoint<null, CreateUserDto> {
  main() {
    return { created: this.body.name };
  }
}
```

`@Use` takes a middleware **function** `(req, res, next)`. (A `Middleware` base class exists but is deprecated — a function can set headers and choose the status, the class cannot.)

## Modules

A module is a unit that can be installed, enabled and disabled: it declares its
own entities, migrations, routes, tasks, permissions and the contracts it
publishes. `_modules` records what is installed and what is on, so turning a
module off removes its routes and stops its tasks **without touching its data**.

```typescript
// modules/billing/module.ts
import { contract, defineModule } from 'liteb';
import { Charge } from './entities/charge.entity';
import * as migrations from './migrations';

export interface BillingService {
  issueCharge(input: IssueChargeInput): Promise<Charge>;
}
export const BillingService = contract<BillingService>('billing.service');

export default defineModule({
  id: 'billing',
  version: '1.0.0',
  core: true,                 // a core module cannot be disabled
  engine: '^2.0.0',           // host range it supports
  requires: ['identity'],     // checked at startup
  dir: __dirname,             // globs resolve against this folder

  entities: [Charge],
  migrations,
  routes: './controllers/**/*.controller.ts',
  tasks: './tasks/*.task.ts',
  permissions: [{ key: 'billing.view', label: 'View billing' }],

  provides: [{ token: BillingService, use: BillingServiceImpl }],
});
```

Start the application from its modules. `Liteb.create` owns the DataSource,
because TypeORM needs every module's entities when the connection is built:

```typescript
const app = await Liteb.create({
  db: { type: 'postgres', host, database },
  modules: [identity, billing, inventory],
  version: '2.0.0',      // checked against each module's `engine`
  basePath: '/api',      // prefix for module routes
});

await app.start(4000);
```

On boot it reads `_modules`, resolves the dependency graph, runs each module's
pending migrations **in dependency order**, registers the contracts, and mounts
only what is enabled. Any failure there stops the boot: serving half-mounted is
worse than not starting.

### Shipping a module compiled, or as a package

The `routes` and `tasks` globs are **extension-agnostic**. Write them however
you like — `'./apis/*.api.ts'`, `'./apis/*.api.js'` or `'./apis/*.api'` — and
liteb looks for `.ts`, `.js`, `.cjs` and `.mjs`. You declare *which* files; the
extension is not your problem.

That is what lets **one manifest** work in three places:

- from source in development (`.ts`)
- from a build you ship to a customer's server (`.js`)
- from `node_modules`, when the module is published as a package

```typescript
import billing from '@acme/liteb-billing';   // a module someone else wrote

const app = await Liteb.create({ db, modules: [identity, billing] });
```

If a source tree and its build sit side by side, only one of each file is
loaded (`.ts` wins), so routes are never registered twice. `*.d.ts` files are
skipped.

### Calling another module

A module reaches another through its contract, never by importing it — which is
what lets the provider change or be swapped without touching its callers.

```typescript
@Module('sales')
@HttpPost('/')
export default class CreateSale extends Endpoint<never, CreateSaleDto> {
  async main() {
    const billing = this.get(BillingService);
    const charge = await billing.issueCharge({ ... });
    return { chargeId: charge.id };
  }
}
```

Declare it in the manifest so a missing provider stops the boot instead of
failing on whichever request needed it first:

```typescript
consumes: [BillingService],
```

Scheduled tasks get the same `this.get()`.

### Extension points

Three ways modules meet, and they are not interchangeable:

| | Who answers | Who reads |
| --- | --- | --- |
| **Contract** (`get`) | exactly one | the caller, who waits for the answer |
| **Event** (`emit`) | any number of listeners | nobody — there is no answer |
| **Slot** (`all`) | any number of contributions | the module that opened it |

A slot is what a third-party extension plugs into: the host does not know what
will exist, so it declares the shape and enumerates whatever is installed.

```typescript
// catalog opens the point
export interface ProductBadge {
  id: string;
  for(product: { id: number; stock: number }): string | null;
}
export const ProductBadges = slot<ProductBadge>('catalog.product-badges');
```

```typescript
// any module fills it, without catalog changing
contributes: [{ slot: ProductBadges, value: lowStockBadge }],
```

```typescript
// catalog reads whoever showed up
const badges = this.all(ProductBadges);
```

**Watch the direction.** The module that OPENS the slot is the one extensions
depend on: `catalog` knows nothing about who fills it, while a contributor
imports its token. Backwards, core would depend on its own extensions and none
of them could be removed.

- Contributions take the same three shapes as a provider: `use` (a class built
  with `{ db, get, all, emit }`), `factory` or `value`.
- **Only enabled modules contribute**, so turning an extension off removes what
  it added.
- An empty array is a normal answer: a slot nobody filled is a feature nobody
  installed.
- They are built on first read and cached, and a contribution that asks for its
  own slot is reported instead of exhausting the stack.
- Order is dependency order, so it is stable across boots.

### Permissions

A module declares the vocabulary of what can be gated inside it:

```typescript
permissions: [
  { key: 'billing.view', label: 'View billing' },
  { key: 'billing.void', label: 'Void a charge' },
],
```

Keys **must** be namespaced with the module id. Every module, including one
someone else wrote, shares a single permission space, and the namespace is what
keeps two of them from claiming the same key.

Endpoints then demand them (see [Authentication](#authentication)), and the
application builds its "who may do what" screen from the catalog instead of a
central file somebody has to remember to edit:

```typescript
app.permissions();
// [{ key: 'billing.view', label: 'View billing', moduleId: 'billing' }, ...]
```

**A key no installed module declares is refused**, with a plain `Error` (500)
and a suggestion — not a 403. A 403 would send whoever debugs it to look at
roles and grants, when the problem is a typo:

```
Unknown permission "billing.veiw": no installed module declares it.
Add it to that module's "permissions" in defineModule().
Did you mean: billing.view, billing.void?
```

The check runs **before** the 401, so an undeclared key surfaces on the first
request even while you are still anonymous. Modules that are installed but
disabled still contribute their keys: disabling decides what runs, not what
exists.

### Events between modules

A contract is a call: you ask a particular module for something and wait. An
event is an announcement: *this happened*, and whoever cares reacts.

```typescript
// catalog/module.ts — the emitter exports the token, nothing else
export interface ProductRestocked {
  productId: number;
  quantity: number;
}
export const ProductRestocked = event<ProductRestocked>('catalog.product.restocked');
```

```typescript
// in an endpoint or a task of `catalog`
await this.emit(ProductRestocked, { productId, quantity });
```

```typescript
// reports/listeners/restock-log.listener.ts
@On(ProductRestocked)
export class RestockLog extends Listener<ProductRestocked> {
  async on(payload: ProductRestocked) {
    await this.get(UserDirectory).nameOf(payload.userId);
  }
}
```

Declare where they live, and they are loaded like routes and tasks:

```typescript
listeners: './listeners/*.listener.ts',
```

The rules that keep an event from turning into a call with extra steps:

- **A listener that throws does not fail the emitter.** The failure is logged
  with the module and the event; the request goes on. If the outcome matters to
  the caller, it wants a contract, not an event.
- **An event nobody listens to is normal**, not an error.
- Listeners run in parallel and `emit()` resolves once they have all settled.
- **Only enabled modules react.** Turning a module off stops its side effects
  too, or "disabled" would be a lie.
- A listener that **declares** its payload parameter is checked against the
  token, so a renamed field cannot quietly reach a handler still expecting the
  old one. (One that ignores the payload compiles against any token — it cannot
  misread what it never reads.)

**GOTCHA:** listeners read on their own connection. Emitting inside
`db.transaction()` means they will not see the uncommitted rows — emit *after*
it commits, or put what they need in the payload.

### Enabling and disabling

A new module installs **disabled** unless it is core, so an upgrade never turns
on something nobody asked for.

```typescript
const store = new ModuleStore(dataSource);
await store.enable('inventory');   // takes effect on the next boot
await store.disable('inventory');
await store.list();
```

## Trying a local build

To test an unpublished version against your own project:

```bash
cd liteb && npm run build && npm pack       # -> liteb-<version>.tgz
cd ../your-project && npm install ../liteb/liteb-<version>.tgz
```

A tarball is closer to what npm actually installs than `npm link`, which
resolves through symlinks and can hide a missing file or a bad `files` entry.

## Authentication

Endpoints never learn how a caller was identified. One resolver turns a request
into an **actor**, and every endpoint reads it as `this.auth`.

```typescript
const app = await Liteb.create({
  db,
  modules: [identity, billing],
  auth: async (req, { db, get }) => {
    const userId = req.session?.userId;      // or a bearer token, or an API key
    if (!userId) return null;                // anonymous

    // `get` resolves a contract, so who-may-do-what stays inside the module
    // that owns it. `db` is there too, for a resolver that queries directly.
    const permissions = await get(UserDirectory).permissionsOf(userId);
    if (!permissions) return null;           // user deleted mid-session

    return { actor: { userId }, permissions };
  },
});
```

Declare the actor's shape **once**, anywhere in your app, and it is typed
everywhere:

```typescript
declare global {
  namespace LitebAuth {
    interface Actor {
      userId: number;
      tenant: string;
    }
  }
}
```

Then, inside an endpoint:

```typescript
this.auth.actor.userId          // typed; throws AuthError (401) if anonymous
this.auth.optional              // Actor | null, for endpoints open to everyone
this.auth.isAuthenticated       // boolean
this.auth.can('billing.void')   // boolean, false when anonymous
this.auth.assert('billing.void')// 401 if anonymous, 403 if signed in but not allowed
```

Notes:

- `this.auth.actor` **throws on purpose**. Reading the caller and checking it
  exists were two steps that had to be written together every time, and
  forgetting the second failed silently. Use `optional` where anonymous is a
  valid case.
- 401 and 403 are not interchangeable: 401 tells a client to authenticate, 403
  tells it not to bother. `assert()` picks the right one.
- The permission keys are the ones modules declare in their manifest. `*` grants
  everything.
- The resolver runs once per request, before `previous()`, so keep it cheap.
  Throwing from it is legitimate — a malformed token is a 401 — and maps through
  the normal error handling.
- It receives `{ db, get }` as a second argument. Without it, an application
  whose permissions live in the database had to close over an imported
  DataSource singleton, or copy them into the session at login and let them go
  stale — a revoked role would keep working until the next sign-in.
- `this.auth` is **per-request state**: like `params` and `body`, it is not
  readable from a constructor or a field initializer.
- Without a resolver, reading `this.auth.actor` raises a plain `Error` (500), not
  a 401: an app that never wired auth up has a bug, not an unauthorized visitor.

## Bootstrapping

`Liteb.create()` is the only way to build an application, and **modules are the only way to mount anything**. There is no glob-mounting API: a route or a task belongs to a module or it does not exist.

```typescript
import { Liteb } from 'liteb';
import identity from './modules/identity/module';
import billing from './modules/billing/module';

const app = await Liteb.create({
  db: { type: 'postgres', /* ... */ },   // or a DataSource you already own
  modules: [identity, billing],
  version: '3.0.0',
  basePath: '/api',
});

await app.start(5000);
```

`start()`:

- fails fast if the database can't be reached (throws, so the process exits non-zero and your orchestrator restarts it);
- aborts if the module graph is broken or a migration fails — serving half-mounted is worse than not starting;
- registers `SIGTERM`/`SIGINT` handlers for a **graceful shutdown** (stops scheduled tasks, drains in-flight requests, closes the database). You can also trigger it with `app.shutdown()`, or `app.close()` to stop without ending the process.

An empty `modules` array is allowed but warns on start: the app will serve nothing beyond what you mounted by hand through `getApp()`.

### CORS

Liteb does **not** manage CORS — allowed origins are a deployment decision. Mount the `cors` middleware yourself before `start()`:

```typescript
import cors from 'cors';

liteb.use(cors({ origin: ['https://app.example.com'], credentials: true }));
```

### API versioning

There is no version decorator. Version by **module**: a `billing-v2` module with its own `@Module('billing/v2')` endpoints runs beside `billing`, and can be enabled or disabled on its own.

## Swagger / OpenAPI

Liteb generates an OpenAPI 3.0.3 spec straight from the decorators you already use for routing — no separate annotations, no extra build step. Enable it with a single call:

```typescript
liteb.swagger('/docs', {
  title: 'My API',
  version: '1.0.0',
  description: 'Optional Markdown description',
});

liteb.start(5000);
```

This mounts:

- `GET /docs` → interactive Swagger UI
- `GET /docs.json` → raw OpenAPI 3 JSON

> Call `liteb.swagger(...)` **before** `liteb.start()`.

### What gets documented automatically

| Source | Result in the spec |
| --- | --- |
| `@Module(basePath)` + `@HttpGet`/`@HttpPost`/... | path + HTTP method |
| `@Body(Dto)` | `requestBody` (JSON) referencing a reusable schema |
| `@Params(Dto)` | typed path parameters (always required) |
| `@Query(Dto)` | typed query parameters (required driven by `@IsOptional`) |
| `:foo` in the path without `@Params` | inferred as a `string` path parameter |
| `@Module` basePath | default tag for the endpoint |
| `@ApiHidden()` | excluded (mounted, but kept out of the spec) |
| `@HttpQuery` | excluded (QUERY is not an OpenAPI operation) |

DTOs are turned into JSON Schema via [`class-validator-jsonschema`](https://github.com/epiphone/class-validator-jsonschema). Decorators like `@IsString`, `@IsEnum`, `@IsUUID`, `@IsOptional`, `@MinLength`, etc. map to their OpenAPI equivalents out of the box, so anything you already validate is also documented.

### Adding richer docs (optional)

Four extra decorators let you polish the output. They are fully optional — leave them off and you still get a valid spec.

```typescript
import {
  Endpoint,
  Body,
  Module,
  HttpPost,
  ApiTag,
  ApiSummary,
  ApiDescription,
  ApiResponse,
} from 'liteb';
import { IsEmail, IsString, MinLength } from 'class-validator';

class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

class UserDto {
  @IsString()
  id: string;

  @IsEmail()
  email: string;
}

class ErrorDto {
  @IsString()
  message: string;
}

@Module('users')
@HttpPost()
@Body(CreateUserDto)
@ApiTag('users')
@ApiSummary('Create a user')
@ApiDescription('Creates a new user. Email must be unique.')
@ApiResponse(201, { description: 'Created', Schema: UserDto })
@ApiResponse(409, { description: 'Email already in use', Schema: ErrorDto })
export class CreateUserApi extends Endpoint<null, CreateUserDto> {
  async main() {
    // ...your logic
  }
}
```

| Decorator | Purpose |
| --- | --- |
| `@ApiTag(...names)` | Group endpoints under one or more tags (overrides the default module tag). |
| `@ApiSummary(text)` | Short one-line summary shown in the endpoint list. |
| `@ApiDescription(text)` | Longer description (Markdown supported). |
| `@ApiResponse(status, { description?, Schema? })` | Document additional status codes and their response shape. Stack as many as you need. |
| `@ApiHidden()` | Mount the endpoint but leave it out of the spec — a page, a webhook, an internal route. |

### Current limitations

- Only `application/json` request/response bodies are documented — `multipart/form-data` and `application/x-www-form-urlencoded` are not auto-generated yet.
- No `securitySchemes` are emitted, so endpoints render as unauthenticated in the UI.
- The spec is built once when `start()` runs (not per-request).

## Logging

By default liteb logs **to the console only** — it does not touch the filesystem, so it starts cleanly in containers and read-only environments. Opt into rotating log files when you want them:

```typescript
import { Logger } from 'liteb';

Logger.configure({ dir: './logs' });   // enables info/warn/error/router files
Logger.configure({ level: 'off' });    // silence everything (e.g. in tests)
```

You can also configure it via environment variables — handy for containers:

| Variable          | Description |
| ----------------- | ----------- |
| `LITEB_LOG_DIR`   | Directory for rotating log files. Unset = console only. |
| `LITEB_LOG_LEVEL` | `trace` \| `debug` \| `info` \| `warn` \| `error` \| `off` (default `trace`). |

If the directory can't be created (permissions, read-only FS), liteb degrades to console logging instead of failing to start.

### The route map (`router.log`)

Every boot writes the routes in the order they were mounted:

```
[MAP] /api — registration order; the first match answers
#01 auto GET    /api/auth/me  (MeApi)
#06 p1   GET    /api/products/page  (ProductsPageApi)
#07 p1   GET    /api/products/export  (ExportProductsApi)
#08 p2   GET    /api/products/:id  (GetProductApi)
#10 auto GET    /api/products  (ListProductsApi)
```

It answers one question: **which route wins**. Express matches in registration
order, so `/products/:id` mounted before `/products/page` swallows the page and
the handler receives the literal string `"page"` — a bug that looks like a data
problem. `#nn` is the position across the whole mount, and `p1`/`auto` is the
`@Priority` that put it there (`auto` = none declared, which is the normal
case). With `dir` set it lands in `router.log`; without it, it goes to the
console.

## Answers that are not JSON

`main()` normally returns data and liteb serializes it. When the answer is a
page, a document or a file, return one of the **outputs** instead:

```typescript
import { csv, file, pdf, view } from 'liteb';

@Module('clients')
@HttpGet()
@Query(ListClientsDto)
export class ListClientsApi extends Endpoint<null, null, ListClientsDto> {
  async main() {
    const clients = await this.db.getRepository(Client).find();

    if (this.query.format === 'csv') {
      return csv(clients, {
        filename: 'Clientes.csv',
        columns: [
          { key: 'name', header: 'Nombre' },
          { key: 'createdAt', header: 'Alta' },
        ],
      });
    }

    return { clients };   // plain data is still JSON
  }
}
```

The decision is made **inside `main()`, with the data in hand** — the same
endpoint can answer JSON or a file depending on what was asked. (Until 2.0 this
was `@Template`, a class decorator read at boot, so an endpoint was "a view" or
it wasn't, forever, and PDF or CSV had nothing to use at all.)

| Output | What it does |
| --- | --- |
| `view(template, data?)` | Renders a template and sends the HTML. A template that fails to render comes back as liteb's error contract, not an Express stack page. |
| `pdf(content, options?)` | `application/pdf`. Shown in the browser by default; `download: true` saves it. liteb does not build the document — pass the bytes from whatever produced them. |
| `csv(rows, options?)` | Builds the file from a list of rows. `columns` chooses which fields go out and their headers; a BOM is written by default so a spreadsheet reads accents correctly. |
| `file(content, options?)` | The general case — any MIME type. `pdf` and `csv` are this with the defaults filled in. |

`content` may be a `Buffer`, a `Uint8Array`, a string or a **stream**, which is
piped rather than buffered. Filenames with accents are sent both sanitized and
as UTF-8 (RFC 5987), so they survive old clients.

Templates still need an engine and a root path:

```typescript
await liteb.setTemplates('pug', './views');   // or 'ejs'
```

Pages are usually worth marking `@ApiHidden()` so they stay out of the OpenAPI
spec.

## Scheduled tasks

```typescript
import { Task, Schedule } from 'liteb';

@Schedule('0 * * * *') // every hour (node-cron expression)
export class HourlyTask extends Task {
  start(now: Date | 'manual' | 'init') {
    // this.db is available
  }
}
```

Point the module's `tasks` glob at them. Only **enabled** modules get their tasks started, and everything is stopped on graceful shutdown.

## Environment configuration

`ConfigService` reads from `process.env` (it loads a `.env` file on import via `dotenv`):

```typescript
import { ConfigService } from 'liteb';

ConfigService.get('DB_HOST');
ConfigService.mode(); // 'development' | 'production' from NODE_ENV
```

The variables your app needs (database host, credentials, port, etc.) are yours to define and pass to your TypeORM `DataSource`; liteb does not require any specific names beyond the logging ones above.

## Example app

[`src/`](https://github.com/ertrii/liteb/tree/main/src) is a small but complete
2.x application, and [`http/demo.http`](https://github.com/ertrii/liteb/tree/main/http/demo.http)
walks the whole flow request by request — 401 vs 403, validation, transactions,
an optional module that starts disabled.

Three modules, on purpose:

| Module | | What it shows |
| --- | --- | --- |
| `identity` | core | Entity + migration with seed data, login/logout/me, a contract other modules consume, permissions |
| `catalog` | core | `requires`, validation DTOs, `@Priority` done right, a page with `view()`, an export with `csv()`, `db.transaction()` for two writes that must land together |
| `reports` | optional | Installs **disabled**; consumes two contracts without importing either module; a scheduled task that only runs while enabled |

```bash
cp .env.template .env      # fill in DB_* and SECRET_KEY
npm run dev                # migrations run on boot; two users are seeded
npm run modules -- list    # what is installed and enabled
npm run modules -- enable reports
```

It is covered by `test/demo-app.spec.ts`, which boots those same three modules
against an in-process Postgres. Example code nobody runs stops being an
example.
