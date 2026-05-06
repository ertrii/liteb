# Liteb (In progress...)

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

## Swagger / OpenAPI

Liteb auto-generates an OpenAPI 3.0.3 spec from the same decorators you already use for routing. One call enables it:

```typescript
liteb.swagger('/docs', {
  title: 'My API',
  version: '1.0.0',
  description: 'Optional Markdown description',
});

liteb.start(5000);
```

That mounts:

- `GET /docs` → Swagger UI (interactive)
- `GET /docs.json` → raw OpenAPI 3 JSON

Call it **before** `liteb.start()`.

### What's auto-detected

For every endpoint discovered by `setApis(...)`:

| From | Becomes |
| --- | --- |
| `@Module(basePath)` + `@Get/@Post/...(path)` | OpenAPI path + HTTP method |
| `@Body(Dto)` (class with class-validator decorators) | `requestBody` with `$ref` to a schema in `components.schemas` |
| `@Params(Dto)` | path parameters with types and `required` |
| `@Query(Dto)` | query parameters with types and `required` |
| `:foo` placeholders in the path with no `@Params` schema | inferred as `string` path parameters |
| `@Module` basePath | default tag (override with `@ApiTag`) |
| `@Template(...)` | endpoint excluded (returns HTML, not JSON) |

DTOs are converted to JSON Schema via [`class-validator-jsonschema`](https://github.com/epiphone/class-validator-jsonschema), so `@IsString`, `@IsEnum`, `@IsUUID`, `@IsOptional`, `@MinLength`, etc. all map to their OpenAPI equivalents automatically.

### Optional decorators for richer docs

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

class CreateUserDto { /* ... */ }
class UserDto { /* ... */ }
class ErrorDto { /* ... */ }

@Module('users')
@Post()
@Body(CreateUserDto)
@ApiTag('users', 'admin')
@ApiSummary('Create a user')
@ApiDescription('Creates a new user. Email must be unique.')
@ApiResponse(201, { description: 'Created', Schema: UserDto })
@ApiResponse(409, { description: 'Email already in use', Schema: ErrorDto })
export class CreateUserApi extends Api<null, CreateUserDto> {
  async main() { /* ... */ }
}
```

All four decorators are optional. With nothing extra, you still get a valid spec.

### Limitations

- Only `application/json` content-type is documented (multipart/form-data and urlencoded are not auto-generated).
- No `securitySchemes` block is generated yet — endpoints render as unauthenticated.
- The spec is built once when `start()` runs, not on each request.

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
