# Liteb

Liteb is a lightweight and simple backend framework. Its main goal is to facilitate the development of modern APIs with minimal configuration while following best practices. Liteb is inspired by the architecture and ease of use of frameworks like NestJS, offering modular organization, intuitive route handling, database integration through TypeORM, and support for scheduled tasks.

With Liteb, you can quickly define your API modules and controllers, associate middlewares and schema validations, and manage recurring or scheduled tasks. The framework prioritizes ease of use, low resource consumption, and a short learning curve, without sacrificing the power needed to build robust and scalable applications.

This project is designed for developers who are looking for a simple and fast alternative to launch backend services without the overhead of complex configurations, while maintaining a solid and extensible structure.

## Install

`npm install liteb`

## Progress

| Feature                     | Status |
| --------------------------- | ------ |
| Routing                     | ✔     |
| Environment Vars            | ✔     |
| API Documentation (Swagger) | ✔     |
| File Upload (Multer)        | ✔     |
| Validation (Schema)         | ✔     |
| Testing                     | ❌     |
| Scheduler / Tasks           | ✔     |
| Cookie Manager              | ✔     |
| WebSockets                  | ❌     |
| Email / Notifications       | ❌     |
| Templates                   | ✔     |
| Static files                | ✔     |

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
| `@Module(basePath)` + `@Get`/`@Post`/... | path + HTTP method |
| `@Body(Dto)` | `requestBody` (JSON) referencing a reusable schema |
| `@Params(Dto)` | typed path parameters (always required) |
| `@Query(Dto)` | typed query parameters (required driven by `@IsOptional`) |
| `:foo` in the path without `@Params` | inferred as a `string` path parameter |
| `@Module` basePath | default tag for the endpoint |
| `@Template(...)` | excluded (HTML responses are not part of the spec) |

DTOs are turned into JSON Schema via [`class-validator-jsonschema`](https://github.com/epiphone/class-validator-jsonschema). Decorators like `@IsString`, `@IsEnum`, `@IsUUID`, `@IsOptional`, `@MinLength`, etc. map to their OpenAPI equivalents out of the box, so anything you already validate is also documented.

### Adding richer docs (optional)

Four extra decorators let you polish the output. They are fully optional — leave them off and you still get a valid spec.

```typescript
import {
  Api,
  Body,
  Module,
  Post,
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
@Post()
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

## Templates

| Template | Engine | Description     |
| -------- | ------ | --------------- |
| EJS      | ejs    | Template engine |
| Pug      | pug    | Template engine |

```typescript
// set templates
liteb.setTemplates('ejs', './views');
```

> Compatible with ejs and pug, just set the template engine and the root path. Can you use patterns to render templates.

## VARIABLES

| Variable    | Optional | Description                             |
| ----------- | -------- | --------------------------------------- |
| PORT        | 5000     | Port server                             |
| DB_HOST     |          | Hostname: example; localhost, 127.0.0.1 |
| DB_NAME     |          | Name database                           |
| DB_PORT     | 27017    | Port database                           |
| DB_USERNAME | ''       | Username database                       |
| DB_PASSWORD | ''       | Password database                       |
| CORS_ORIGIN |          | security layers.                        |

## Example Guide

[Example](https://github.com/ertrii/liteb/tree/main/src)
