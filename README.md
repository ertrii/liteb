# liteb

Backend framework for Node whose unit is the **installable module**: a folder
that declares its own routes, entities, migrations, permissions and contracts,
and can be turned off without touching the rest of the application.

Express + TypeORM + class-validator underneath, decorators on top.

> **2.0.0-alpha.1** — alpha: the API will still move. The stable `1.x` line
> lives on the [`v1`](https://github.com/ertrii/liteb/tree/v1) branch.

## Start

```bash
npx liteb@alpha init my-app    # package.json, tsconfig, .env, entry point
cd my-app
npx liteb create module billing
npm run dev
```

**`@alpha` matters on that first command.** Plain `npx liteb` resolves the
`latest` tag, which is still `1.x` and ships a different CLI. Inside the project
it no longer matters: `npx` finds the local install first.

Into a project you already have:

```bash
npm i liteb@alpha
npm i typeorm express class-validator reflect-metadata pg
```

## The application

```typescript
import { ConfigService, Liteb } from 'liteb';
import billing from './modules/billing/module';

const app = await Liteb.create({
  db: { type: 'postgres', host: ConfigService.get('DB_HOST'), synchronize: false },
  modules: [billing],   // the only way to mount anything
  version: '1.0.0',     // checked against each module's `engine`
  basePath: '/api',
  // OPTIONAL. Only endpoints that read `this.auth` need it.
  auth: async (request, { db, get }) => ({ actor: { userId: 1 }, permissions: ['billing.view'] }),
});

await app.start(3000);
```

On boot liteb reconciles what is installed, runs each module's pending
migrations in dependency order, and mounts only what is **enabled**.

## A module

```typescript
export default defineModule({
  id: 'billing',
  version: '1.0.0',
  core: true,              // false = installs disabled, enabled on purpose
  engine: '^1.0.0',
  dir: __dirname,          // the folder everything below is found from
  requires: ['identity'],

  permissions: [{ key: 'billing.view', label: 'View billing' }],
  provides: [{ token: BillingService, factory: ({ db }) => new Billing(db) }],
  consumes: [UserDirectory],
});
```

No paths, because a module keeps the standard layout and liteb finds it from
`dir`:

```
billing/
├── module.ts
├── entities/*.entity.ts        migrations/*.ts
├── endpoints/*.endpoint.ts     routines/*.routine.ts   listeners/*.listener.ts
```

Name a field — `routes: './apis/*.api.ts'` — only to say something else; it
replaces that one and the rest keep working. The globs are
**extension-agnostic**, so the same manifest runs from source, from a build,
from `node_modules` and from bytecode.

## An endpoint

```typescript
@HttpPost()
@Body(CreateChargeDto)          // validated before main() runs
export default class CreateChargeApi extends Endpoint<null, CreateChargeDto> {
  private readonly charges = this.db.getRepository(Charge);

  public async main(): Promise<DataJson> {
    this.auth.assert('billing.charge');            // 401 anonymous, 403 not allowed
    const who = await this.get(UserDirectory).nameOf(this.auth.actor.userId);

    const charge = await this.charges.save({ ...this.body, by: who });
    await this.emit(ChargeCreated, { chargeId: charge.id });

    this.httpStatus = HttpStatus.CREATED;
    return charge;
  }
}
```

`main()` returns data and liteb serializes it. When the answer is not JSON,
return an output: `view('invoice', data)`, `pdf(bytes)`, `csv(rows)`,
`file(content)`.

A route hangs from the module id. `@Group` overrides that when the URL should
not carry it — one module serving `auth` and `users`, or several contributing
to the same prefix. `mount` takes the group off the application's `basePath`,
which is what a monolith serving pages *and* an API needs, because
`/api/charges/page` is not a URL anybody would link to:

```typescript
@HttpGet(':id')                         // /api/billing/:id   ← the module id
@Group('charges')                       // /api/charges/:id
@Group('charges', { mount: '/' })       // /charges/:id       ← a page
@Group('checkout', { mount: '/shop' })  // /shop/checkout/:id
```

Both can live in the same module: the JSON endpoints keep the prefix, the page
declares its own.

## How modules meet

| | Who answers | Reads the answer |
| --- | --- | --- |
| **Contract** — `contract()` / `this.get()` | exactly one; a second provider is an error | the caller, and it waits |
| **Event** — `event()` / `this.emit()` / `@On` | any number of listeners | nobody: there is no answer |
| **Slot** — `slot()` / `contributes` / `this.all()` | any number of contributors | the module that opened it |

They are not interchangeable, and the types refuse to mix them.

## CLI

```bash
npx liteb init [name]                        # a project that runs
npx liteb create module billing              # manifest, first endpoint, migrations index
npx liteb create endpoint billing/issue --method post
npx liteb create entity billing/charge       # registered in the manifest
npx liteb create migration billing/create-charges
npx liteb create routine billing/nightly --cron "0 7 * * *"
npx liteb create listener billing/audit

npx liteb migrate                            # run pending migrations, no server
npx liteb migrate --dry-run                  # what would run
npx liteb migrate:status                     # what each module declares, and what ran

npx liteb build [--bytecode]                 # .jsc delivery, for a machine you do not control
```

`migrate` asks YOUR entry point for the application — it looks for an exported
`createApp()` — so the CLI never needs to know where your database is. That is
why `liteb init` writes the entry point with `createApp()` separate from
`main()`, guarded by `if (require.main === module)`: importing the file must not
start a server.

## Also in the box

Swagger from the same decorators, scheduled routines, per-module migrations with
their own ledger, template rendering, a route map in `router.log`, configurable
logging, graceful shutdown.

## More

- [The long guide](https://github.com/ertrii/liteb/blob/main/docs/guide.md) — every feature, and why each one is the way it is
- [Authorization](https://github.com/ertrii/liteb/blob/main/docs/authorization.md) — permissions and the session user, step by step
- [`src/`](https://github.com/ertrii/liteb/tree/main/src) — a small, complete application (three modules), covered by `test/demo-app.spec.ts`
- [`http/demo.http`](https://github.com/ertrii/liteb/blob/main/http/demo.http) — the whole flow, request by request
- [CHANGELOG](https://github.com/ertrii/liteb/blob/main/CHANGELOG.md)

Node >= 20. MIT.
