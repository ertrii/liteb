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
| Templates (pug / ejs)       | ✔      |
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
| Events between modules      | —      |

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
  auth: (req) => {
    const userId = req.session?.userId;      // or a bearer token, or an API key
    if (!userId) return null;                // anonymous
    return { actor: { userId }, permissions: req.session.permissions };
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
| `@Template(...)` | excluded (HTML responses are not part of the spec) |
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

## Templates (pug / ejs)

```typescript
liteb.setTemplates('pug', './views');
```

Set the engine and root path; a controller renders a view with `@Template('view-name')`, and `main()` returns the data passed to it. Works with `pug` and `ejs` (install the engine you use).

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

## Example Guide

[Example](https://github.com/ertrii/liteb/tree/main/src)
