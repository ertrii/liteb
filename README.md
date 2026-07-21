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

`liteb` relies on a few peer dependencies you provide in your app: `typeorm`, `express`, `express-session`, `class-validator` and `typescript`.

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

## Defining endpoints

Every endpoint is **its own class** that extends `Api` and implements `main()`. Routing metadata comes from decorators; the class is discovered by glob (see below).

```typescript
import { Api, Module, HttpGet, Params, NotFoundError } from 'liteb';
import { IsUUID } from 'class-validator';

class UserParams {
  @IsUUID()
  id: string;
}

@Module('users')
@HttpGet(':id')
@Params(UserParams)
export class GetUserApi extends Api<UserParams> {
  // `this.db` is available in field initializers.
  private readonly repo = this.db.getRepository(User);

  async main() {
    const user = await this.repo.findOneBy({ id: this.params.id });
    if (!user) throw new NotFoundError('User not found');
    return user; // serialized as JSON with status `this.httpStatus` (default 200)
  }
}
```

- **Lifecycle**: `previous()` → `main()` → `error(err)` → `final()`. `final()` always runs.
- **Request state** (`this.params`, `this.body`, `this.query`, `this.request`, `this.response`, `this.file(s)`) is injected per request.
- **Errors**: throw a framework error to get a mapped HTTP status — `NotFoundError` (404), `AuthError` (401), `CustomerError` (406), `SchemaError` (422), `CustomError(status, ...)`. Any other thrown value becomes a 500. Unmatched routes return the same `{ message, identifier }` shape with 404.

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
export class CreateUserApi extends Api<null, CreateUserDto> {
  main() {
    return { created: this.body.name };
  }
}
```

`@Use` takes a middleware **function** `(req, res, next)`. (A `Middleware` base class exists but is deprecated — a function can set headers and choose the status, the class cannot.)

## Bootstrapping

```typescript
import { DataSource } from 'typeorm';
import { Liteb } from 'liteb';

const dbSource = new DataSource({ type: 'postgres', /* ... */ });
const liteb = new Liteb(dbSource);

liteb.setApis('/', ['./src/modules/**/apis/*.api.ts']);
liteb.setTasks(['./src/modules/**/tasks/*.task.ts']);
liteb.start(5000);
```

Files are discovered by **glob** and every exported class that extends `Api` is registered. `start()`:

- fails fast if the database can't be reached (throws, so the process exits non-zero and your orchestrator restarts it);
- registers `SIGTERM`/`SIGINT` handlers for a **graceful shutdown** (stops scheduled tasks, drains in-flight requests, closes the database). You can also trigger it with `liteb.shutdown()`.

### CORS

Liteb does **not** manage CORS — allowed origins are a deployment decision. Mount the `cors` middleware yourself before `start()`:

```typescript
import cors from 'cors';

liteb.use(cors({ origin: ['https://app.example.com'], credentials: true }));
```

### API versioning

There is no version decorator. Version by **URL prefix** using `addApis` (see below): mount `v1` and `v2` from different file globs, e.g. `addApis('/api/v2', [...])`.

## Multi base path (`addApis`)

By default, `liteb.setApis(basePath, patterns)` mounts every resolved endpoint under a single base path. When different file globs should resolve under different prefixes — for example, legacy endpoints under `/` and new endpoints under `/api` — use `addApis` instead:

```typescript
liteb.setApis('/',     ['./src/legacy/**/apis/*.api.ts']);
liteb.addApis('/api',  ['./src/modules/**/presentation/controllers/**/*.controller.ts']);
liteb.addApis('/api',  ['./src/application/**/*.use-case.ts']);

liteb.start(5000);
```

Each call adds another group; `setApis` still resets all groups to a single one (backward compatible). All groups share the same Swagger spec — endpoints from every group appear in `/docs`.

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
  Api,
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
export class CreateUserApi extends Api<null, CreateUserDto> {
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

Point `liteb.setTasks([...])` at your task globs. Tasks are stopped automatically on graceful shutdown.

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
