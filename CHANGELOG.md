# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.5] - 2026-09-30

### Changed

- **TypeORM is replaced by Drizzle.** [BREAKING]

  ```typescript
  // before
  @Entity('billing_charge')
  export class Charge {
    @PrimaryGeneratedColumn() id: number;
    @Column() name: string;
  }
  const charges = await this.db.getRepository(Charge).find();

  // after
  export const charge = pgTable('billing_charge', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
  });
  export type Charge = typeof charge.$inferSelect;

  const charges = await this.db.select().from(charge);
  ```

  `this.db` is now `Database`, which is Drizzle's `PgDatabase` with no driver and
  no schema named in it, plus `$client`. Both a `pg` pool and a PGlite instance
  satisfy it, and `db.select().from(table)` stays exactly typed because the types
  come from the TABLE, not from a schema generic.

  **What changed beyond the syntax:**

  - `entities` is **`tables`**, and `entities/*.entity.ts` is
    `tables/*.table.ts`. `liteb entity` is now **`liteb table`**, and it writes
    the table plus its `$inferSelect` / `$inferInsert` types.
  - **An ENUM has to be exported from a file under `tables/`**, not only used by
    a column. A table with an enum column emits DDL that *references* the type,
    so a schema without the enum generates a migration that fails when it runs.
    Liteb collects six kinds — tables, enums, sequences, views, materialized
    views, schemas — and ignores everything else exported from the same file.
  - **Liteb defines `Migration`**, so an application's migrations no longer type
    against the ORM. They take a `Transaction` — the database minus `$client`,
    which is how you would have opened a second connection and stepped outside
    the transaction you were handed.
  - **`liteb migration:generate` needs no database.** It compares one module's
    tables against that module's snapshot (`migrations/meta/snapshot.json`) and
    writes both the migration and the new snapshot. `down()` comes from the same
    diff, so it is trustworthy in the same measure the `up` is — and when the
    diff finds no way back, there is no `down()` at all rather than an empty one
    claiming this is undone by doing nothing.
  - **Nothing has to be attributed to a module any more.** A whole-schema diff
    had to be split up — which module owns this table? — and where each piece
    landed decided what order it ran in. A per-module diff has nothing to guess,
    and ~100 lines of attribution went with it. A cross-module foreign key still
    comes out right: it names the other module's table, and liteb migrates in
    dependency order.
  - **`--check`** (and `app.schemaDrift()`) answers the question snapshots
    cannot: has the live database drifted from the code?
  - **Liteb owns no ORM lifecycle.** A pool connects lazily, so `connect()` runs
    `select 1` instead of reading a flag, and the health probe does the same: a
    pool reports itself open while every connection in it is broken.
  - **Liteb does not close a connection it did not open.** Passing your own
    instance used to need `close({ database: false })` to survive.
  - Postgres only, in the types as well as in practice.

  **Migrating:** rewrite each entity class as a `pgTable` under `tables/`,
  export its enums, change `getRepository(X).find()` to `select().from(x)`, and
  replace `implements MigrationInterface` / `up(runner: QueryRunner)` with
  `implements Migration` / `up(db: Transaction)`. Then delete the snapshot-less
  history: `liteb migration:generate` against an empty snapshot regenerates the
  schema from scratch, so run it once per module on a database that already
  matches and commit the snapshot without applying the migration.

  `drizzle-orm` is a peer dependency; **`drizzle-kit` is an OPTIONAL peer**,
  required lazily, because it pulls in esbuild and tsx and only generating needs
  it. A deploy that runs migrations someone else generated must not install a
  build toolchain to do it.

  What this gives up is written down in `AGENTS.md`, including the two measured
  surprises: the relational query api (`db.query.users.findMany()`) cannot work
  when the schema is only known at runtime, and Drizzle's `hasDataLoss` reported
  `false` for dropping a column that had data.

- **A generator can declare a file it is expected to rewrite.** The writer
  refuses to overwrite anything, because a migration is history — but a schema
  snapshot exists to be replaced, and without this a module could only ever have
  one migration before `liteb migration:generate` died with "Already there". It
  is reported as `updated`, not `created`.

- **One `token()` replaces `contract()`, `slot()` and `event()`.** The three
  differed in exactly one thing — how many may answer — so that is now an
  argument instead of three functions.

  ```typescript
  // before
  export const BillingService = contract<BillingService>('billing.service');
  export const ProductBadges = slot<ProductBadge>('catalog.product-badges');
  export const ProductRestocked = event<ProductRestocked>('catalog.restocked');

  // now
  export const BillingService = token<BillingService>(
    'billing.service',
    'contract',
  );
  export const ProductBadges = token<ProductBadge>(
    'catalog.product-badges',
    'slot',
  );
  export const ProductRestocked = token<ProductRestocked>(
    'catalog.restocked',
    'event',
  );
  ```

  `Contract<T>`, `Slot<T>` and `EventToken<T>` stay distinct types, so nothing
  loosens: the overloads return the right one per kind, and passing the wrong
  token anywhere still fails to compile. `TokenKind` is exported for a signature
  that has to name it.

  An empty id and an unknown kind are refused at import time. Both were silent
  before: an empty id collides with the next empty id, and a kind nothing
  recognizes produces a token no site ever resolves.

- **`@Contributes` is gone. `@Provides` takes a contract and a slot.** [BREAKING]

  ```typescript
  @Provides(BillingService) // the one implementation of a contract
  @Provides(ProductBadges)  // one contribution among however many exist
  ```

  The two decorators wrote the same metadata under the same symbol, and
  `buildContainer` always decided by reading `kind` off the token — never by
  which decorator was used. The only thing the second name bought was an error
  for mixing a slot with a contract, and that error existed only because the
  kind was asserted in two places that could disagree. With the kind on the
  token there is nothing left to contradict.

  `@Provides` still refuses an event token, because nothing provides an event: a
  module announces it with `this.emit()` and a `Listener` reacts with `@On()`.

  **Migrating:** rename `contract(id)` → `token(id, 'contract')`, `slot(id)` →
  `token(id, 'slot')`, `event(id)` → `token(id, 'event')`, and `@Contributes` →
  `@Provides`. The imports change from `{ contract }` / `{ slot }` / `{ event }`
  to `{ token }`. Nothing else moves: the folders, the manifest fields and
  `this.get()` / `this.all()` / `this.emit()` are the same.

- **Every token goes in `tokens/`, and one `liteb token` writes them.**
  [BREAKING]

  ```bash
  liteb token identity/directory contract   # exactly one answers it
  liteb token catalog/product-badges slot   # however many are installed fill it
  liteb token billing/charge-issued event   # nobody answers it
  ```

  `liteb contract`, `liteb slot` and `liteb event` are gone, and so are the
  three folders they wrote into. A module's public face is now
  `tokens/*.token.ts` — one folder, one suffix, one command whose second
  argument is the same one `token(id, kind)` takes inside the file.

  Splitting them across `contracts/`, `slots/` and `events/` asked the author to
  file a decision that the file already states in its second argument, and left
  three near-identical commands to remember instead of one.

  None of this is globbed, so nothing in the framework changes: a token is
  imported by name, and the folder is a convention for people.

  **Migrating:** move `contracts/x.contract.ts`, `slots/x.slot.ts` and
  `events/x.event.ts` into `tokens/x.token.ts` and update the imports — they are
  the only files another module imports, so the compiler finds every one of
  them. `liteb provider --slot` and `liteb listener` now write their marker
  import pointing at `@/<module>/tokens/…`.

- **`auth` is required by `Liteb.create()`.** [BREAKING]

  It is the one option with no sensible default: any default the framework
  picked would be the framework deciding who may do what. An application that
  gates nothing writes one all the same —
  `auth: defineAuth(async () => ({ actor: {} as LitebAuth.Actor, permissions: ['*'] }))`
  — because "everyone is allowed" is an answer somebody chose, and it should
  read like one instead of being the silence of an option nobody passed.

  **Migrating:** pass `auth` wherever `Liteb.create()` is called. `liteb init`
  already writes one and `src/index.ts` already passes it, so a scaffolded
  project needs no change.

- **The boot log is three lines, not fourteen.** [BREAKING]

  ```
  Modules: identity, catalog, reports (3 of 3)
  Wiring: 2 contracts, 1 extension point, 1 event, 5 permissions
  Serving on :5050 - 11 routes, 1 routine, docs at /docs (1.4s)
  ```

  Gone: `Loading database...`, `Loading modules...`, `Reading templates...`,
  `Reading API and creating routes...`, `Loading server...`,
  `Starting module routines...` and `Done!`. Seven lines that said where the
  boot was, on a boot that got to the end anyway.

  The named wiring lines (`Contracts registered`, `Extension points filled`,
  `Events with listeners`, `Permissions declared`) are counts on one line now.
  The case where the NAME matters — a module consuming a contract nobody
  provides — never reached them: it stops the boot with an error naming both.

  Each part is dropped when it is zero, except `routes`, because **zero routes**
  is the failure that used to read as a healthy boot: a glob matched nothing,
  the application answered 404 to everything, and the log said `Done!`.

  `Serving on :<port>` reports the port the server is actually **bound** to.
  Asking for port 0 means "any free one", and the old line echoed the 0 back.

### Fixed

- **A 500 no longer echoes the thrown error's message.** [BREAKING]

  An unexpected `Error` kept the 500 and put its `message` in the response's
  `detail`. Measured in a browser: a failing query printed the whole statement,
  the column list and its **bound parameters** onto the page. Nobody writes a
  driver's message for a client to read, and the next one along carries a hash
  or somebody's data.

  `detail` is now `Internal server error.` for that branch. Nothing is lost:
  the message and its stack already go to the error log, and the body carries
  `requestId`, so the response and the log entry are still one grep apart.

  Every error liteb *defines* is unaffected — `NotFoundError`, `CustomerError`,
  `AuthError`, `ForbiddenError`, `CustomError` and `SchemaError` were all
  written to be read, and still say what they say.

- **`liteb init` leaves the project under git, with the scaffold committed.** It
  runs `git init` on branch `main` and commits after `npm install`, so the
  lockfile is in that first commit.

  The commit is the point. Sixteen files nobody typed are not the author's work,
  and with no commit of their own they end up inside the first real one, where
  nobody reviewing it can tell the two apart. Committed on their own, the next
  `git diff` is only what the author wrote.

  Three things stop it, none of them an error, each reported in one line: no git
  on the machine; the folder is already inside a repository (`liteb init my-app`
  inside a monorepo is normal, and a nested repository hides the project from the
  one that already tracks it); or the commit fails, most often for a missing
  identity — the repository stays, and the reason is git's own words. `--no-git`
  skips all of it.

- **Nothing a generator writes carries a comment.** [BREAKING for anyone
  grepping generated files]

  `liteb init` still explains the project, because that file is written once. A
  generator runs every day, and its explanation ends up copied into the tenth
  endpoint, the fifth token and the third migration, where it teaches nobody
  anything: it is text to read past or delete by hand, and it becomes a lie the
  day the framework changes and the old files are still there.

  What the author has to know is printed as a `next` hint by the command that
  wrote the file — said once, where it is new — and the reasoning lives in the
  docs. Every hint the removed comments carried is now a hint: `engine` is the
  host application's version, the manifest names no paths, a slot's interface is
  ONE contribution, a listener's token belongs to the announcing module, a
  provider is built once and reused, an empty migration would be recorded as
  applied.

- **A generated import is wrapped the way prettier would wrap it.** `liteb
  provider <module>/<name> --slot <slot>` wrote its import on one line, and with
  two names and an aliased path that line goes past 80 columns — so the file
  failed the scaffolded project's own `prettier --check` on the first commit.
  Same fix the generated token already had.

- **A scaffolded project could not use the session it was told to use.** The
  generated resolver reads `request.session?.userId` and a login writes
  `this.request.session.userId`, and neither compiled: `express-session` was in
  no dependency list, so the type did not exist — and `declare module
  'express-session'` cannot augment a module that does not resolve.

  `liteb init` now writes `src/config/session.ts`: `express-session` mounted
  with an `httpOnly` cookie, `saveUninitialized: false` so a visitor who never
  signs in gets no cookie, and the `SessionData` declaration that types what the
  session carries. `src/index.ts` mounts it ahead of the routes, `.env` gets a
  `SESSION_SECRET` generated for that project, and the package and its types are
  in `dependencies` / `devDependencies`.

  The default store is in-memory, which the file says in as many words: lost on
  restart, and invisible to a second process. It is a development default, not a
  deployment one.

- **The scaffolded actor was a lie.** `actor: {} as LitebAuth.Actor` meant that
  the moment an application declared `interface Actor { userId: number }` —
  which the scaffold now does for you — `this.auth.actor.userId` was typed
  `number` and was `undefined` at run time. The default resolver now returns
  `{ userId: request.session?.userId ?? 0 }`, so it is half real from the start:
  `0` is nobody, and a login that writes the session makes it the signed-in user
  in every endpoint. It still grants `*`, and still says so in the log.

- **`emit()` accepted a contract or a slot, and then reached nobody.**
  `EventToken` carried no `kind`, so it was structurally a subset of both:
  `this.emit(BillingService, payload)` compiled, and at run time no listener is
  registered under a contract's id, so the call did nothing and said nothing.
  `EventToken` now carries `kind: 'event'` and the compiler refuses it.

  A type-level test pins it: `test/token.spec.ts` uses `@ts-expect-error` on
  each crossed pair, and ts-jest fails the suite if any of them stops being an
  error.

- **A generated `token()` declaration could exceed 80 columns**, which fails the
  `prettier --check` that `liteb init` wires into the scaffolded project. The
  generator now wraps it the way prettier would, and which side of the line a
  declaration falls on depends on the module and the name — so it is decided per
  file, with a test for both cases.

## [2.0.0-alpha.4] - 2026-09-28

### Changed

- **A module declares its permissions as keys, and the label is optional.**
  `declarePermissions()` is removed.

  ```typescript
  // src/modules/billing/module.ts — the ONLY place a key is spelled
  export default defineModule({
    id: 'billing',
    permissions: [
      'billing.invoices.view',
      'billing.invoices.void',
      // Text only where the key cannot carry it on its own.
      { key: 'billing.impersonate', label: 'Act as another operator' },
    ],
  });
  ```

  ```typescript
  // src/config/permissions.ts — READS the keys, does not restate them
  declare global {
    namespace LitebAuth {
      interface Permissions
        extends PermissionsOf<typeof import('../modules/billing/module').default> {}
    }
  }
  ```

  `PermissionsOf` now takes a module instead of a permission set, so the key is
  written once, in the manifest, and the type system reads it back off there. A
  typo in an endpoint still fails to compile, and TypeScript suggests the right
  spelling. The `const` type parameter is what preserves the literals, so no
  `as const` is needed.

  The label is optional because a key like `billing.invoices.void` already says
  it, and one that restates the key in a sentence is a string somebody has to
  keep true for no gain. Write one where the key cannot carry the meaning alone
  — most often for a module installed from elsewhere, whose namespace the
  operator did not write. It is read by exactly one thing, the screen where a
  role is built; a 403 carries the KEY, never the label.

  `ResolvedModule` gains `permissionKeys`, so a role can grant everything one
  module has with `[...billing.permissionKeys]` instead of a list that goes
  stale.

  `src/config/permissions.ts` now carries ONE file-level
  `eslint-disable @typescript-eslint/no-empty-interface` instead of a comment per
  block, since `liteb module` appends blocks and each one repeated the line.

  **Migrating:** delete each module's `permissions.ts`, move the keys into its
  manifest as strings, and point the blocks in `src/config/permissions.ts` at
  `typeof import('…/module').default`. A non-array `permissions` is refused at
  import time with a message that says so.

### Added

- **TypeScript 6, and Node 22 as the floor.** `peerDependencies` accepts
  `typescript ^5.1.6 || ^6.0.0`, and `liteb init` scaffolds `^6`.

  Not `^7`, which exists: `typescript-eslint` peer-requires `typescript <6.1.0`,
  so TypeScript 7 would mean giving up type-aware linting and
  `no-floating-promises` with it. The tsconfig both liteb and the scaffold use is
  written for the move anyway — no `baseUrl`, `paths` relative to the file,
  `rootDir` explicit — with `moduleResolution: node10` behind an
  `ignoreDeprecations` until the resolver migration gets its own pass.

  Node 20 went end-of-life in April 2026, so `engines.node` is `>=22.13`; 24 is
  the active LTS and the one to run.

  Three things TypeScript 6 broke, all now fixed:

  - **`this.file` and `this.files` are typed `UploadedFile`**, liteb's own
    interface, instead of `Express.Multer.File`. TypeScript 6 stopped pulling a
    module-shaped `@types` package in just because it is installed, and the
    public API depended on `@types/multer`'s global augmentation being loaded in
    the APPLICATION's compiler — so `this.file` became unresolvable in projects
    that had changed nothing. The new type is structurally identical, so either
    annotation keeps compiling. A framework's public surface should not need a
    third-party global to be in scope.
  - **`rootDir` must be explicit.** TypeScript 6 no longer infers it from the
    file set.
  - **`ts-jest` had to move to `^29.4.14`**, the first version whose peer range
    admits TypeScript 6.

- **`liteb init` decides the shape of a file.** Four config files, and the
  scripts to use them:

  ```
  .editorconfig       every editor, including ones that run no tooling
  .prettierrc         Prettier, which overrides .editorconfig where they overlap
  eslint.config.mjs   what the code MEANS, formatting left to Prettier
  .gitattributes      the working tree is LF, on every machine
  ```

  Plus `.prettierignore`, `.vscode/settings.json` (format on save),
  `.vscode/extensions.json`, and `lint` / `lint:fix` / `format` / `format:check`.

  The values agree across all four, and they match what the generators emit — so
  the first `npm run format` never rewrites a file `liteb module` just wrote.
  That was verified the hard way: the appended permissions block had to be
  changed twice before `prettier --check` was clean on a freshly scaffolded
  project.

  Three decisions worth stating, because a scaffold that just drops config files
  teaches nothing:

  - **Prettier does not run as an ESLint rule.** That is
    [Prettier's own recommendation](https://prettier.io/docs/integrating-with-linters):
    as a rule it is slower, fills the editor with squiggles over things that fix
    themselves on save, and adds a layer that can break.
    `eslint-config-prettier/flat` only turns the conflicting rules OFF.
  - **Flat config**, because `.eslintrc` was removed in ESLint 10 — which is also
    why `package.json` now declares `node >=20.19`.
  - **`no-floating-promises` is an error.** The one type-aware rule worth what
    type information costs: a repository call nobody awaited is data that
    silently did not get written. `recommendedTypeChecked` is commented in the
    file for when a codebase is ready for the rest.

  `no-namespace` allows ambient declarations and `no-empty-object-type` allows a
  single `extends`, because the scaffold's own `declare global` blocks need both.
  Configuring those beats disabling them, and it is why
  `src/config/permissions.ts` carries no `eslint-disable` at all any more.

- **`defineAuth(...)`** — the way to write the `auth` resolver.

  ```typescript
  // src/config/auth.ts
  export default defineAuth(async (request, { db }) => {
    const userId = request.session?.userId;
    if (!userId) return null;
    const user = await db.getRepository(User).findOneBy({ id: userId });
    return user ? { actor: { userId }, permissions: roleKeys(user.role) } : null;
  });
  ```

  It replaces `const auth: AuthResolver = ...` in the scaffold and the docs, and
  earns the extra call twice over:

  - **Several ways in, tried in order.** `defineAuth(sessionAuth, bearerAuth,
    apiKeyAuth)`. The resolver is one function by design, but the ways into an
    application are plural — a cookie for the web, a token for the mobile app,
    a key for an integration — and chaining them inside one body meant every
    project re-invented the order and the short-circuit. The first strategy
    that returns something other than `null` wins; the rest are not called.
  - **A result that would make `this.auth` lie is refused.** An object with no
    `actor` used to leave `isAuthenticated` true while `actor` was `undefined`,
    so the 401 that should have happened never did and the failure surfaced
    somewhere else entirely. Same for `permissions` given as a string instead of
    a list: `new Set('tasks.view')` holds ten letters and matches no key. Both
    throw a 500, because both are mistakes in the code — answering 401 would
    send whoever debugs it to look at roles and grants instead of at the
    resolver.

  The `AuthResolver` type is still exported and `auth:` still accepts any plain
  function of that shape. Nothing that already worked stops working.

- **A 403 says WHICH permission was missing**, as a `missing` member of the
  problem body.

  ```json
  {
    "type": "/problems/forbidden",
    "status": 403,
    "detail": "Missing permission: tasks.assign.",
    "code": "forbidden",
    "missing": ["tasks.assign"]
  }
  ```

  `ForbiddenError` already carried the keys and `toJson()` dropped them, so the
  only way for a client to know which key was absent was to parse the sentence in
  `detail`. It exposes nothing new for that reason, and it is absent on a 401,
  where no key is what is missing.

- **`cacheAuth(resolver, { key, ttl })`** — remembers what the resolver
  answered, per caller.

  ```typescript
  export const auth = cacheAuth(defineAuth(sessionAuth), {
    key: (request) => request.session?.userId ?? null,
    ttl: 15_000,
  });

  auth.invalidate(userId); // signing out, a role change, a suspension
  ```

  The resolver runs on every request and usually queries. Measured through a
  whole HTTP request against an in-process Postgres, that query was about 40% of
  the request — a fixed tax paid on the cheap reads that are most of an API.

  What it costs is freshness, so the trade is explicit: `ttl` is required
  because it is the one number that decides how stale an authorization decision
  may be, and `invalidate` exists because the TTL is the floor and not the
  contract. Off by default; `liteb init` still ships no cache.

  Three things it refuses to cache, each because caching it is a bug: a `null`
  key, a `null` result (that is how somebody signs in and stays anonymous until
  the TTL runs out) and a resolver that threw. Requests arriving while a
  resolution is in flight wait on it, so a cold cache and eight parallel calls
  still run the resolver once. No timer: entries expire when read and the least
  recently used one is dropped at `max`.

  Two limits, both documented: the cached result is shared, so the actor must be
  treated as immutable; and the cache lives in one process, so with more than
  one replica `invalidate` does not reach the others and the guarantee drops
  back to the TTL.

### Fixed

- **`liteb module` no longer appends a second copy of a block that is already
  there.** The idempotency check compared the whole appended block verbatim, so
  prettier in the consumer's project — which rewraps the line and may use
  different quotes — was enough to defeat it, and re-running the generator left
  `src/config/permissions.ts` with two blocks for one module. It compiles either
  way, because TypeScript merges identical declarations, but a file that
  accumulates duplicates is a file people stop trusting. The check is now the
  module's import path, which survives reformatting and reindenting.

  `FileEdit.append` takes an optional `appendUnless` for this: the marker that
  means "already appended", instead of the text itself.

- **A generator no longer breaks an array that prettier had wrapped.** Adding to
  `modules: []`, `entities: []` or `permissions: []` appended after the trailing
  comma prettier leaves on a multi-line array, producing `'a',, 'b'` — the CLI
  corrupting a file the CLI itself had written. It affected every array edit, so
  it was there before permissions moved into the manifest.

- **liteb's error classes are `Error`s now.** `AuthError`, `ForbiddenError`,
  `NotFoundError`, `SchemaError`, `CustomerError` and `CustomError` were plain
  classes, so they carried no `stack`, `error instanceof Error` was false for
  them in application code and in third-party middleware, and tooling that
  assumes `Error` did not see them at all — `rejects.toThrow(AuthError)` reports
  "did not throw" even when the code threw correctly.

  The cause was not an omission. `ErrorControl` tested `instanceof Error`
  **first**, so anything that was an Error became a 500; the specific classes had
  to stay outside the hierarchy to reach their own branch. The order was
  load-bearing, which is why "just add `extends Error`" would have turned every
  401, 403, 404, 406 and 422 into a silent 500.

  The generic branch is now last, where a fallback belongs, and it stays ahead of
  the thrown-plain-object branch because an Error is an object too. Statuses,
  codes and bodies are unchanged; there are tests on each mapping so the order
  cannot drift back.

### Documentation

- **The documentation is split by language.** `docs/en/` is the source and
  `docs/es/` the translation, with `docs/README.md` as the index. Code,
  identifiers and the framework's own JSDoc stay English on both sides.

- **`docs/*/api.md` — every name an application writes**, with its type and what
  it is, in eight sections. It lists 97 of the 138 exports on purpose: the
  module registry, the migrator, the loaders and the decorators' metadata are
  public because the CLI is a separate process, not because an application
  needs them.

- **`docs/es/wiring.md` — contracts, slots and events in depth.** What each one
  guarantees, when a provider is built, the direction a slot's dependency runs
  in, what an event does not promise, the framework's error strings word for
  word, and the antipatterns. Spanish only for now.

- **`docs/es/openapi.md` — the generated spec in depth.** How each URL is
  composed, the two `components.schemas` traps (every imported DTO lands in the
  document, and two DTOs with the same class name are merged into one schema),
  what the spec cannot know about your application, and how to gate `/docs` —
  including `/docs.json`, which is a sibling route and not a child. Spanish only
  for now.

### Fixed

- **The API glossary documented `container.get(slot)`**, which does not
  compile: `get()` takes a `Contract`, and an extension point is read with
  `container.all(slot)`.

## [2.0.0-alpha.3] - 2026-09-18

### Changed

- **`create` is gone from the command line.** `liteb module billing`,
  `liteb endpoint billing/issue-charge`, `liteb entity billing/invoice`. The
  word carried no information: there is no `edit` and no `update` for it to
  distinguish from, and a CLI that writes files is a CLI whose verbs are the
  things it writes.

  If something that edits rather than writes ever shows up, it is a flag on the
  same command and not a second noun to type first.

- **The error body follows RFC 9457 (`application/problem+json`).** One shape
  for every failure, and a media type that tells a client a response is a
  failure rather than a payload that happens to have a `status` field.

  ```json
  {
    "type": "/problems/validation",
    "title": "Validation failed",
    "status": 422,
    "detail": "email must be an email",
    "code": "schema",
    "errors": { "email": "must be an email" },
    "requestId": "9f2c1a7b4e30"
  }
  ```

  | Was | Is | Why |
  | --- | --- | --- |
  | `message` | `detail` | the RFC's split: `title` is stable and names the KIND of problem, `detail` is about this occurrence |
  | `identifier` | `code` | unchanged values; branch on this, not on `title` or `type` |
  | `errorFields` | `errors` | **same purpose**: which FIELD is at fault, so a form puts the message under the right input instead of in a banner |
  | — | `status`, `title`, `type`, `requestId` | new |

  `errors` is an extension member, which the RFC allows precisely for this. It
  is the reason the shape exists at all, and nothing about it changed but the
  name.

  A thrown plain object used to be answered **verbatim**, so one endpoint could
  reply in a shape no client had a parser for. It now keeps its status and its
  payload (under `response`) in the same shape as everything else.

### Added

- **`liteb migration:generate <module>/<name>`** — TypeORM's generator, filed by
  module.

  ```bash
  npx liteb migration:generate billing/add-due-date
  ```

  It connects, has TypeORM read the live schema, compare it against the
  entities and write the SQL that closes the gap. That is the same machinery
  behind `synchronize: true` minus the part where it runs behind your back, it
  does the job better than anything hand-rolled, and there was no reason for
  liteb to have its own.

  What TypeORM cannot do is decide WHERE the migration goes: it sees one schema
  and modules do not exist for it. That half is liteb's, decided from the only
  thing that knows — which module declares which entity. A diff that lands
  entirely in another module is **refused** and names the owner, because a
  migration in the wrong module runs in the wrong order, or not at all when
  that module is disabled. One that also touches another module's tables is
  written with a warning naming them; splitting it is a judgement call and
  liteb does not make it.

  It refuses while migrations are pending — a pending one is a change the
  database has not seen, so the diff would describe it a second time. `--print`
  shows the SQL and writes nothing. The same answer is on the application:
  `app.pendingSchema()` and `app.tableOwners()`.

- **One id per request.** Read from `x-request-id` or generated, echoed in the
  response, and present in **every log line written while serving that
  request** — the access line, anything an endpoint logs, anything a provider
  or a listener logs deep inside. It is also in the error body and on
  `this.requestId`.

  It travels in `AsyncLocalStorage` rather than being passed down, because the
  lines worth correlating are the ones written where nobody handed anything:
  threading a parameter through every repository to reach the interesting case
  is how the idea gets abandoned halfway.

  An incoming header is client input, so it is accepted only if it matches
  `[A-Za-z0-9._:-]{1,128}` and replaced by a generated id otherwise — a newline
  in a header would otherwise become a forged log entry. Replaced rather than
  sanitized: a half-cleaned id is not the one the caller is holding, so it
  would correlate nothing.

  Twelve hex characters, not a UUID: it is prefixed to every log line, and 36
  characters buys entropy nobody needs to tell two requests apart inside one
  log file. `requestId: { header: 'x-correlation-id' }` if your gateway already
  sends one.

- **A health check.** `Liteb.create({ health: { path: '/health' } })` mounts an
  unauthenticated 200/503 outside `basePath` — what a load balancer, a
  container runtime or an uptime check reads.

  Two things it gets right that a hand-written one usually does not. The
  database check is a **round trip**, not `isInitialized`: that flag stays true
  after a connection drops, because the pool only finds out when something
  asks, so a health check reading it reports `pass` through the one outage it
  exists for. And it answers 503 **as soon as shutdown begins** — `close()` now
  marks it, where before only `shutdown()` did — which is the window a balancer
  needs to stop sending traffic while in-flight requests finish.

  The body is thin on purpose: `{ status, uptime }`, plus `checks` naming what
  failed. A probe cannot authenticate, so versions and module counts would be a
  map of the installation for whoever finds it; `details: true` adds them, for
  when it sits behind a gate. It is also kept out of the access log, because a
  probe every few seconds otherwise buries every real request.

  `health.checks` takes the part liteb cannot know. The framework can only
  answer for the process and the database; whether a queue must be connected, a
  provider reachable or a cache warm is the application's knowledge:

  ```typescript
  health: { path: '/health', checks: { queue: () => bridge.isConnected() } }
  ```

  Throwing counts as `fail` — a dependency that is down usually announces
  itself by throwing, and this is the one place where an exception is an answer
  rather than a failure. They run in parallel, a hung check is cut off at
  `timeout` (2s), and `server`/`database` are refused as names at startup so an
  application check can never quietly replace the database's own answer.

  This is the seam `/readyz` would have been. liteb does not split `/livez`
  from `/readyz`: the split only pays off once a platform treats the two
  differently, and there is one honest answer to give either way.

- **`docs` and `logs` as `Liteb.create` options**, next to `cors`, so the
  application declares them in one place instead of calling methods after the
  fact. `docs` mounts the generated OpenAPI UI; `logs` configures the log
  destination. `app.swagger()` is **gone**: it did the same thing from a second
  place, and an application that called both — as this repo's own demo did —
  was declaring its documentation twice and could contradict itself.

- **The log files are the default now**, and all of them exist from the first
  boot:

  ```
  logs/
  ├─ app.log        every level, in one chronological stream
  ├─ info.log
  ├─ warn.log
  ├─ error.log
  └─ router.log     the route map — the only one with anything in it on boot
  ```

  Empty, and created anyway: an empty `error.log` says nothing went wrong,
  while a missing one says nothing at all and sends you looking for the reason
  it was never written. Same reasoning for the directory itself — a developer
  who has to discover an option before they can read what their application did
  is a developer who never reads it.

  `app.log` is the neutral one and is where you read what happened; the split
  files are for grepping one kind of thing. The route map stays out of it: it
  is a map, not a chronology, and it would be fifty lines of boot noise in
  front of the first thing that matters.

  So `logs` no longer turns anything ON. It moves the directory, renames a file
  or drops one:

  ```typescript
  logs: { dir: null }                   // console only — what a container wants
  logs: { files: { error: 'errores' } } // errores.log
  logs: { files: { info: false } }      // no info.log
  ```

  Dropping `info`, `warn` or `error` loses nothing — those lines are in
  `app.log` and on the console too — so it is about what you want to grep on
  its own. `router` is the exception, being in no other file, so `false` sends
  the map to the console rather than nowhere. And `level: 'off'` writes no
  files at all, which is what keeps a test run from leaving a directory of
  empty files behind it.

  The directory is also **resolved to an absolute path once**, when it is
  configured. A relative `logs/` means "next to wherever the process happens to
  be standing", and the appender opens its file when it WRITES, not when it is
  configured — so a process that changed directory afterwards quietly started a
  second log directory somewhere else. Found while chasing a `logs/` that kept
  reappearing in this repo's root during the test run.

- **`liteb init` wires all three ON**, in every environment, because every
  backend ends up needing them: `/health`, `/docs` and `logs/`. Nothing is
  conditioned on `NODE_ENV` — turning one off is a decision you make looking at
  `src/index.ts`, not one that comes made from the factory and surprises you
  the first time you deploy. The comment beside each one says what to know
  before you keep it: `/docs` publishes the shape of your API to whoever finds
  the URL, and `dir: null` is the right answer for logs inside a container.
  `.env` now carries `NODE_ENV` all the same.

- **A new project starts with its authorization already wired**, not commented
  out. `liteb init` writes `src/config/auth.ts` — a resolver that lets
  EVERYONE through with every permission — and `src/index.ts` passes it. It is
  not authentication, and it says so in the log, once, the first time it lets a
  request through.

  It is there so the whole mechanism works on the first request: `this.auth`,
  `this.auth.assert(...)`, and the permission keys checked by the compiler. So
  the scaffold now writes the assertion **live**:

  ```typescript
  async main() {
    this.auth.assert('inventory.view');
    ...
  ```

  The gate in place and open, which is the only order in which closing it is a
  one-line change. Commented, the scaffold taught that endpoints are ungated by
  default, and the day somebody wrote real authentication every endpoint
  written until then was still open. `--public` leaves the line out for the
  ones meant to be.

  `src/config/permissions.ts` likewise ships with its `declare global` block
  already open rather than as an example in a comment. It is empty until the
  first module, and `liteb module` appends one block per module.

### Fixed

- **A migration you had not written yet was recorded as applied**, and that is
  the worst shape a bug can take: it took the one command whose whole job is to
  not be silent, and made it silent.

  The scaffold's `up()` ran a SQL comment. A comment is a valid, successful
  query — so liteb recorded the migration as done, and from then on had no
  reason to run it again. The SQL written afterwards never executed, and
  `liteb migrate` kept answering *nothing to migrate* about a table that was
  never created.

  The scaffold now **throws** until its SQL is written. Each migration runs in
  its own transaction, so the failure rolls back and leaves no row behind: it
  stays pending, which is what it is.

  If you already hit this, the ledger holds a row for a migration that did
  nothing. Delete it and migrate again:

  ```sql
  delete from _module_migrations where module = '<module>' and name = '<Class1234>';
  ```

- **The last lines of an ordered shutdown could be lost.** The file appender
  writes asynchronously and `shutdown()` called `process.exit(0)` right after
  logging "Shutdown complete." — so the line somebody reads when a restart went
  wrong was the one most likely to be missing. It now waits for the flush, and
  `Logger.flush()` is exported for anything else that ends a process.

- **The log directory was kept relative.** It is resolved to an absolute path
  once, when configured. The appender opens its file when it WRITES, not when
  it is configured, so a process that changed directory afterwards quietly
  started a second log directory somewhere else.

## [2.0.0-alpha.2] - 2026-09-18

### Removed

- **Every deprecated name is gone**, in one go rather than carried to 2.0
  final. `2.0.0-alpha.1` is the only 2.x release in the wild, and keeping two
  spellings of the same thing costs more — in the docs, in autocomplete, in a
  shim file per rename — than the one upgrade it saves.

  | Gone | Use |
  | --- | --- |
  | `@Module`, `MODULE`, `ModuleOptions.basePath` | `@Group`, `GROUP`, `mount` |
  | `Task`, `@Schedule`, `SCHEDULE` | `Routine`, `@Cron`, `CRON` |
  | `loadModuleTasks`, `tasks:` | `loadModuleRoutines`, `routines:` |
  | `EndpointReader.moduleName` | `.group` |
  | `provides:`, `contributes:` | a `Provider` class in `providers/` |
  | `ProviderEntry<T>`, `Contribution<T>`, `ContainerContext` | — |

  The container shrank with them: one way to build an implementation instead of
  three, so `Container.register(moduleId, token, ProviderClass)` and
  `contribute(moduleId, slot, ProviderClass)` take the class directly and
  `ContainerContext` no longer exists — a provider gets what it needs on
  `this`.

### Added

- **`liteb create event` and `liteb create slot`**, so every kind of token a
  module publishes has a command and a folder: `contracts/`, `events/` and
  `slots/`. Neither is globbed by liteb — a token is imported by name — which
  is exactly why the CLI is what keeps those folders consistent.

- **[docs/cli.md](docs/en/cli.md)**: every command, every flag, what each one
  writes, and the handful of things that cost an evening if you get them wrong.

- **A path alias for module imports.** `liteb init` writes
  `"paths": { "@/*": ["src/modules/*"] }`, so the one import that crosses
  modules stops being a staircase:

  ```typescript
  import { UserDirectory } from '@/identity/contracts/user-directory.contract';
  ```

  A `paths` alias is compile-time only — `tsc` checks it and emits
  `require("@/…")` verbatim, which Node does not understand, and a build that
  type-checks then dies on its first require. So `liteb build` rewrites aliased
  specifiers to relative paths in the output, and the generated `tsconfig.json`
  carries `"ts-node": { "require": ["tsconfig-paths/register"] }` so `npm run
  dev` resolves them without a flag anywhere. Doing it at build time is
  deliberate:
  the alternative is a loader hook the deployed process has to remember to
  install, and a build that only runs under a wrapper is not a build.

  Only prefix aliases with a single target are rewritten. An exact mapping or a
  list of fallbacks resolves by trying each in turn, which is a compiler's job
  and not something a text rewrite can honour.

### Changed

- **A contract's implementation is a class in `providers/`, not a factory in
  the manifest.** `module.ts` is where a module's pieces are wired; it had
  become where a module's real work lived, because a `factory` inside
  `provides:` is code, and code grows.

  ```typescript
  // billing/contracts/billing-service.contract.ts — the promise
  export interface BillingService { issueCharge(i: Input): Promise<Charge> }
  export const BillingService = contract<BillingService>('billing.service');

  // billing/providers/billing-service.provider.ts — how it is kept
  @Provides(BillingService)
  export class BillingServiceProvider extends Provider implements BillingService {
    private readonly charges = this.db.getRepository(Charge);
    async issueCharge(input: Input) { ... }
  }

  // billing/module.ts — only the wiring
  export default defineModule({ id: 'billing', version: '1.0.0', dir: __dirname });
  ```

  A class and **one** way to provide, where there used to be three (`value`,
  `use`, `factory`). That is not taste: a decorator cannot go on an object
  literal or an arrow function, so the class is what makes the folder work at
  all — and `prototype instanceof Provider` is what lets the loader ignore
  everything else the file exports. The same shape as an endpoint, a routine
  and a listener: base class for what is injected, decorator for where it
  plugs in.

  `Provider` gets `this.db`, `this.get()`, `this.all()` and `this.emit()`
  BEFORE the instance is built, so `private readonly charges =
  this.db.getRepository(Charge)` works in a field initializer. Construction is
  still lazy and cached: a contract nobody calls costs nothing.

  `@Contributes(slot)` is the same thing for an extension point. Passing a slot
  to `@Provides` — or a contract to `@Contributes` — fails at the decorator
  with the difference spelled out, because the two are exactly what should not
  be confused: one provider versus many.

  New folders, and the reason they differ:

  | Folder | Globbed |
  | --- | --- |
  | `providers/*.provider.ts` | yes — the decorator has to be read |
  | `contracts/*.contract.ts`, `events/*.event.ts`, `slots/*.slot.ts` | no — a token is imported by name, there is nothing to discover |

  The second row is convention for people, and `liteb create contract` writes
  there. Inventing a glob so the table looked symmetrical would have been
  decoration.

  `provides:` and `contributes:` were removed with everything else deprecated
  (see **Removed**).

- **`Task` is now `Routine`, and `@Schedule` is now `@Cron`.** "Task" is the
  most common noun in business software — a work order, a case, a to-do — and
  a framework has no business taking the word: an application with its own
  `Task` entity had to alias one of the two in every file that used both.

  ```typescript
  @Cron('0 7 * * *', { timezone: 'America/Lima' })
  export default class DailySummary extends Routine {
    public async start(now: Date | 'manual' | 'init') { ... }
  }
  ```

  `Routine` names the work without claiming a domain word. `Job` would have
  read just as well and was rejected for a different reason: everywhere else
  (Sidekiq, BullMQ, Quartz, Kubernetes) it means a QUEUE — enqueue, payload,
  retries, workers — and liteb has none of that. If liteb ever grows one, that
  is the real `Job`.

  `@Schedule` described the effect; the argument it takes is a cron
  expression, so `@Cron` says what it takes.

  The folder and the manifest field move with it:
  `routines/*.routine.ts`, `routines:`, `liteb create routine <module>/<name>`.

- **A module's folders are a convention, not a declaration.** `entities`,
  `migrations`, `routes`, `tasks` and `listeners` now default to the standard
  layout, resolved from `dir`:

  ```
  entities/*.entity.ts     migrations/*.ts     endpoints/*.endpoint.ts
  tasks/*.task.ts          listeners/*.listener.ts
  ```

  ```typescript
  export default defineModule({
    id: 'billing',
    version: '1.0.0',
    engine: '^2.0.0',
    dir: __dirname,
    requires: ['identity'],
    permissions,
  });
  ```

  What a manifest says is now only what is particular to the module. The five
  fields it used to carry were the same five lines in every module ever
  written, and every one of them was a way to get it wrong: a path that says
  `./endpoint/` mounts nothing, an entity missing from `entities: []` is a
  table TypeORM does not know about.

  `entities` and `migrations` take a glob as well as a list, which is what
  makes them work the same way as the other three. A glob is read while the
  manifest is — the same moment an `import` at the top of that file would have
  been — so the DataSource still gets the full entity list before it is built.
  Only decorated entities and migration classes are kept, so an enum or a
  helper in the same folder is ignored, and a class found twice (a
  `migrations/index.ts` that re-exports) is one class.

  **Naming a field still works and replaces that field only** —
  `routes: './presentation/controllers/**/*.controller.ts'` leaves the other
  four alone. Everything hangs off `dir`: without it liteb applies no default,
  because a glob with nothing to resolve against lands on whatever the
  process's working directory happens to be. An explicit `entities: []` means
  the module has none, so no default applies.

  A declared field still wins over the convention.

  The CLI shrank with it. `create entity`, `create task`, `create listener` and
  `create migration` now write their file and edit **nothing** — there is no
  manifest list to keep in sync and no `migrations/index.ts` to append to, so
  the barrel file is gone from the scaffold. `create module` writes a manifest
  with no paths in it. The `uncomment` edit, which existed only to switch on the
  `tasks` and `listeners` globs, was removed with its last caller.

  Reporting follows the same split: a glob you WROTE that finds nothing is a
  mistake and says so at startup; a default that finds nothing just means the
  module has no tasks. Files that match and yield no endpoint are reported
  either way — that is a class missing `extends Endpoint` or its HTTP
  decorator, and it is invisible from the outside.

- **`@Module` is now `@Group`, and it is optional.** The decorator never
  declared a module: it declares a URL prefix. In 1.x "module" only ever meant
  that, so the name was fine; 2.x gave the word a second, central meaning — the
  INSTALLABLE UNIT, `defineModule({ id })`, `requires`, the `_modules` row, the
  permission namespace — and left the decorator holding the old one.

  ```typescript
  // module.ts declares id: 'catalog'
  @HttpGet(':id')                          // /api/catalog/:id
  @Group('products')                       // /api/products/:id
  @Group('products', { mount: '/' })       // /products/:id
  ```

  The prefix now defaults to the **module id**, so the decorator is only needed
  when the URL should not carry it: a module serving more than one resource
  (`identity` serving `auth` **and** `users`), or several modules contributing
  to the same prefix.

  The two identities stay separate on purpose. The id names the package, the
  group names the URL: folding them together would put the installable unit's
  name into every public URL, make renaming a module a breaking API change, and
  forbid a module from serving two resources.

  `@Module`, its `basePath` option and `EndpointReader.moduleName` were
  removed (see **Removed**).

### Added

- **CORS is a `Liteb.create` option.** Every backend with a browser in front of
  it needs it, and leaving it out meant each application wired the same
  middleware by hand — including the demo, whose version leaked a stack trace
  when it refused an origin.

  ```typescript
  Liteb.create({
    cors: { origin: ['https://app.example.com'], credentials: true },
  });
  ```

  liteb owns the mechanism, the application owns the policy — the same split as
  `auth`. Left out, no headers are sent.

  What it buys over mounting `cors` yourself: **`origin: true` with
  `credentials: true` refuses to start**, because a browser rejects
  `Access-Control-Allow-Origin: *` on a request carrying cookies and that is the
  mistake everybody makes once; an empty origin list warns instead of silently
  blocking every request; a refused origin is logged, so the block has a trace
  on the server and not only in somebody's console; and it is mounted before
  everything else, so a preflight never reaches a route and the headers survive
  an error response.

  A refused origin does NOT fail the request — the header is omitted and the
  browser decides, which is what the standard says and what keeps
  server-to-server callers working.

  `liteb init` writes the option wired to a `CORS_ORIGIN` env var.

- **`declarePermissions()`: one home for a module's permission keys.** A key was
  a bare string written three times over — in the manifest, in the resolver that
  grants it and in every endpoint that demands it — with nothing tying the three
  together. Three chances to misspell it, and the only net was a 500 at run time.

  ```typescript
  // src/modules/tasks/permissions.ts  — the place to start
  export const permissions = declarePermissions('tasks', {
    view: 'View tasks',
    manage: 'Create and edit tasks',
  });

  // module.ts — no second list to keep in sync
  export default defineModule({ id: 'tasks', permissions, ... });

  // src/config/permissions.ts — once per module, appended
  interface Permissions
    extends PermissionsOf<typeof import('../modules/tasks/permissions').permissions> {}

  // an endpoint — still a plain string, and now a typo does not compile
  this.auth.assert('tasks.manage');

  // the resolver — checked too, or everything this module has
  agent: ['tasks.view'],
  auditor: [...permissions],
  ```

  The keys come out namespaced without anyone remembering the rule, and
  `defineModule` refuses a set declared for a different module — which is what
  a copied permissions file looks like. The plain array still works.

  `liteb create module` writes the file; `create endpoint --permission` adds a
  line to it.

### Fixed

- **A routine's `this.emit()` reached nobody.** The event bus was never passed
  to the scheduled routine, and `emit` returns quietly when there is none — so
  a routine that announced something worked, logged nothing, and no listener
  ever ran. Found while renaming `Task`, and covered by a test that fails
  without the fix.

- **An error thrown by a middleware answers the error contract.** There was a
  404 fallback and no error handler, so anything a middleware passed to
  `next(error)` fell through to Express's own — an HTML stack page, status 500,
  with the stack in the body. A client that only knows liteb's error shape got
  something it could not parse, and internals went out with it.

  The usual way to meet this is a rejected CORS origin, which is why it looked
  like CORS was missing rather than this.

  ```json
  { "message": "Not allowed by CORS", "response": null, "errorFields": {}, "identifier": "internal" }
  ```

  Framework errors keep their status (a `NotFoundError` from a middleware is
  still a 404). Once bytes are on the wire the connection is cut instead, so a
  half-sent file ends up broken rather than corrupt with JSON appended.

- **The scaffold no longer answers 500 to the first request.** `liteb init`
  writes `auth` commented out, while `liteb create module/endpoint` wrote
  `this.auth.assert(...)` live — so a freshly generated project failed with
  "this application resolves no actor" on the first call to its own endpoint.
  The two halves contradicted each other, and the CLI tests missed it because
  they built the application themselves, with a resolver, instead of using the
  entry point `init` writes.

  The assertion is now written COMMENTED, above the key the manifest already
  declares, and you uncomment it together with the resolver.
  `liteb create endpoint --permission <key>` writes it live for an application
  that already has `auth`, and DECLARES the key in that module's manifest —
  without it the assertion is a 500 ("unknown permission") rather than a 403,
  so a generator that wrote only the assertion wrote code that cannot run.
  `--public` leaves the line out entirely.

  `auth` was never mandatory — an endpoint that does not read `this.auth` needs
  no resolver — but the generated code made it look that way.

- **An endpoint without the decorator is no longer dropped in silence.**
  `isInvalid()` required a group, so forgetting `@Module` produced a clean
  boot, a healthy log and 404 forever — the failure had no symptom to search
  for. There is always a prefix to fall back to now, and only a missing HTTP
  verb discards a class.

## [2.0.0-alpha.1] - 2026-09-17

First published 2.0: liteb goes from a routing library to a module framework.
**Alpha** — the API will still move, and it is published under the `alpha`
dist-tag so `npm i liteb` keeps installing `1.x`. That line is frozen on the
`v1` branch and only receives fixes.

### Added

- **Outputs: `view()`, `pdf()`, `csv()`, `file()`** — when the answer is not
  JSON, `main()` returns the thing itself instead of the framework being told
  up front what the endpoint produces.

  ```typescript
  public async main(): Promise<DataJson> {
    const clients = await this.clients.find();
    if (this.query.format === 'csv') return csv(clients, { filename: 'Clientes.csv' });
    return { clients };
  }
  ```

  The consequence is the point: the decision is made at run time, with the data
  in hand, so ONE endpoint can answer JSON or a file depending on the request.

  - `view(template, data?)` renders through the callback form, so a broken
    template comes back as liteb's error contract instead of Express answering
    a stack trace in HTML and bypassing it.
  - `pdf(bytes, options?)` is `application/pdf`, shown in the browser by
    default. liteb does not build the document: that is a library's job, and
    baking one in would make every application carry it.
  - `csv(rows, options?)` writes RFC 4180 (CRLF, quoting what would break the
    row) with a BOM by default — without it a spreadsheet opens accents as
    noise, the single most common complaint about exported CSVs. `columns`
    chooses what goes out and its headers, so an export does not leak whatever
    the query happened to select.
  - `file(content, options?)` is the general case, any MIME type; the other
    three are it with defaults. A stream is piped, not buffered, and a stream
    that breaks mid-transfer destroys the response rather than writing a JSON
    error into a file the client believes is complete.

  `rows` and a view's `data` are typed `object`, not `Record<string, unknown>`:
  what gets exported is almost always the result of a repository query, and a
  TypeORM entity is a class with no index signature.

- **`@ApiHidden()`** — mounts the endpoint and leaves it out of the OpenAPI
  spec. It replaces what `@Template` did implicitly (a rendered page was skipped
  because the decorator was there to see) and covers the rest of the same case:
  a webhook meant for one provider, an internal route.

- **A route map worth reading** — the `router` log now numbers routes across the
  whole mount and prints the `@Priority` that put each one there:

  ```
  [MAP] /api — registration order; the first match answers
  #06 p1   GET    /api/products/page  (ProductsPageEndpoint)
  #08 p2   GET    /api/products/:id  (GetProductEndpoint)
  #10 auto GET    /api/products  (ListProductsEndpoint)
  ```

  It exists for one question — which route wins. Express matches in registration
  order, so `:id` mounted before a literal route swallows it and the handler
  receives the literal string, a bug that reads like a data problem. The number
  is global rather than per module, because what decides the answer is the order
  Express saw them in, across every router.

- **A route group can be mounted outside the application's `basePath`** —
  `@Module('products', { basePath: '/' })`.

  `basePath: '/api'` is right for an API and wrong for everything else, and a
  monolith serves both: `/api/products/page` is not a URL anybody would link
  to. The override is per GROUP, not per application or per module, so the same
  module keeps its JSON under the prefix and puts its page at the root — which
  is how it actually splits.

  A side effect worth knowing: routes under different prefixes cannot shadow
  each other, so `@Priority` stops being needed between them. The demo's page
  lost its `@Priority` when it moved off `/api`.

- **`liteb migrate`, `liteb migrate --dry-run` and `liteb migrate:status`** —
  migrations already ran inside `start()`, which meant "boot the server to
  migrate": if a migration failed, the server was already up. Now they are two
  steps, so the first one can fail and stop a release.

  The commands ask YOUR entry point for the application (an exported
  `createApp()`), so the CLI still knows nothing about your database — the
  application already does. `Liteb` gained `migrate({ dryRun })` and
  `migrationStatus()`; `start()` now shares the same reconciliation, so the CLI
  can never resolve a different set of modules than the server.

  `migrate:status` reports how many migrations each module DECLARES, because
  the most common cause of "my migration did not run" is a
  `migrations/index.ts` that does not export it — which from the database looks
  exactly like "it has not run yet".

  Reading the ledger no longer creates it: `ModuleMigrator.applied()` answers
  an empty set when `_module_migrations` does not exist, so a status or a dry
  run on a virgin database leaves no trace. A test caught that one.

- **The scaffolding convention is `endpoints/<name>.endpoint.ts`**, with classes
  named `<Name>Endpoint`. `Api` was the 1.x base class: a generator that keeps
  writing it teaches the framework that no longer exists, and the demo under
  `src/` was still doing the same. Both moved. The globs remain the author's
  choice — liteb enforces no folder name — this is only what the CLI writes and
  what the example shows.

- **A CLI** — `npx liteb@alpha init my-app` writes a project that runs (package.json,
  tsconfig with the two decorator flags and `strictPropertyInitialization: false`,
  `.env`, an entry point) and installs its dependencies. Then
  `npx liteb create module billing`, plus `endpoint`, `task`, `listener`,
  `entity` and `migration`, and `liteb build` (with `--bytecode`). Built on
  commander.

  `create module` registers the module in `Liteb.create({ modules: [...] })`
  itself, so `init` + `create module` + `npm run dev` needs no hand editing —
  forgetting that line is the classic "my routes are 404".

  The `@alpha` on that first command is not optional: `npx liteb` resolves the
  `latest` tag, which is `1.0.0-beta.7.5` and ships the OLD CLI, so it does not
  fail — it runs a different program. Inside the project npx finds the local
  binary and no version is needed.

  A module is a shape — a manifest, globs that have to match, a migrations
  index, permission keys namespaced by the module id — and every one of those is
  a place to be one convention off and find out at boot, or not at all: a
  `routes` glob that matches nothing starts cleanly and answers 404.

  It knows nothing about the running application: no database, no config file,
  no registry. It reads arguments and writes files. It edits files it did not
  write only where the shape is certain (appending to the migrations index,
  uncommenting a glob its own template left there, adding an entity to
  `entities: []`); anything less certain prints as an instruction, because a
  scaffolder that silently mangles a file you wrote is worse than one that tells
  you what to add.

  This is the redesign the 1.0 RC asked for when it deleted `bin/`. That CLI
  died because its templates were loose assets nobody compiled and they drifted
  until they generated decorators the framework no longer had. These templates
  are TypeScript strings inside the same build as everything else, and
  `test/cli.spec.ts` scaffolds a module — with an endpoint, a task, a listener,
  an entity and a migration — and then BOOTS it against Postgres, checking that
  the route answers, the permission key matches the manifest's, the entity was
  registered and the migration ran.

- **Modules can be delivered as V8 bytecode** — `.jsc` (bytenode) joined the
  extensions a module's globs match, so one manifest also works for a build
  shipped to a machine you do not control.

  liteb loads it and nothing more: no dependency on bytenode, no compilation
  step. The application registers the extension itself with
  `require('bytenode')` before `start()`, because what a `.jsc` file is depends
  on the Node build that produced it — that belongs to whoever ships the
  runtime, not to the framework.

  It comes last in the preference order, so a readable file beside it wins and
  nobody ends up stepping through the opaque copy by accident.

  Verified end to end by `npm run demo:bytecode`: the demo under `src/` compiled
  to 38 `.jsc` files with no `.js` beside them boots, mounts the same 11 routes
  in the same order and answers JSON, a rendered page and a CSV. Without `.jsc`
  in the list it installed, migrated, registered its contracts and served 404 to
  everything — the same shape of failure the `.ts`→`.js` fix cured.

  It is a script and not a jest test because jest's runtime intercepts
  `require`, so bytenode's `Module._extensions['.jsc']` never runs; the suite
  covers the glob and the preference order instead.

- **Extension points (slots)** — `slot<T>(id)` opens one, a module fills it from
  its manifest with `contributes: [{ slot, use | factory | value }]`, and the
  module that opened it reads everything installed with `this.all(slot)`.

  This is the seam a third-party extension plugs into, and it is the one the
  other two could not cover: a contract has exactly ONE provider and refuses a
  second, an event has no answer at all. A slot is the case where the host does
  not know what will exist — payment methods, notification channels, report
  sections — so it declares the shape and enumerates whoever showed up.

  The dependency direction is the part worth guarding: the module that opens the
  slot is the one extensions depend on. A contributor imports the host's token;
  the host imports nothing. Backwards, core would depend on its own extensions
  and none of them could be removed.

  Only enabled modules contribute, so turning an extension off removes what it
  added. An empty array is a normal answer. Contributions are built on first
  read and cached, and one that asks for its own slot is reported rather than
  exhausting the stack.

  `Contract` and `Slot` now each carry a `kind` literal so neither can be passed
  where the other goes — they were structurally identical, and one-provider
  versus many is exactly the confusion worth preventing.

- **Permission registry** — the permissions modules declare are now collected at
  boot and checked. `this.auth.can()` / `assert()` refuse a key no installed
  module declares, with a plain `Error` (500) and a suggestion drawn from the
  same module's namespace.

  It closes the half of the feature that was missing: modules listed their
  permissions and nothing read the list, so `assert('billing.veiw')` was not a
  mistake the framework could see — it was a 403 in production, sending whoever
  debugged it to look at roles instead of at a typo. The check runs BEFORE the
  401, so an undeclared key surfaces on the first request even while the caller
  is still anonymous.

  `app.permissions()` returns the catalog with the owning module, which is what
  a "who may do what" screen is built from — the list comes from the modules
  instead of a central file somebody has to remember to edit. Modules that are
  installed but disabled still contribute their keys, like entities: disabling
  decides what runs, not what exists.

  Enabling it immediately caught four call sites in liteb's own tests that
  demanded a key no manifest declared.

- **Events between modules** — `event<T>(id)` declares a token, `this.emit()`
  announces from an endpoint, a task or a contract's implementation, and a
  `Listener` marked `@On(token)` reacts. A module declares where its listeners
  live with a `listeners` glob, loaded like `routes` and `tasks`.

  A contract is a call: you ask a particular module and wait for the answer. An
  event is an announcement, and the rules keep it from collapsing back into the
  first: a listener that throws does NOT fail the emitter — the failure is
  logged naming the module and the event — and an event nobody listens to is
  normal rather than an error. When the outcome matters to the caller, it wants
  a contract.

  Only ENABLED modules get their listeners registered, the same rule as routes
  and tasks: a module that is off must not keep having side effects.

  A listener that declares its payload parameter is type-checked against the
  token, so a renamed field cannot quietly reach a handler that still expects
  the old one. One that ignores the payload compiles against any token, which is
  harmless — it cannot misread a field it never touches.

  The bus and the container reference each other — an implementation may emit,
  a listener may resolve a contract — and are wired with explicit setters once
  both exist, rather than through a lazy global.

- **Authentication seam (`this.auth`)** — one `AuthResolver`, passed as
  `Liteb.create({ auth })` or `setAuth()`, turns a request into
  `{ actor, permissions }`; every endpoint reads it as `this.auth`. It replaces
  `getSession`/`setSession`.

  The point is that endpoints stop knowing *how* a caller was identified. A
  cookie session, a bearer token from a mobile app and an API key issued to a
  third-party extension are all the same one function, so swapping the transport
  no longer means touching every endpoint that reads the current user.

  `Actor` is declared **empty**, in a global `LitebAuth` namespace, and the
  application widens it by declaration merging — the framework defining `userId`
  is exactly what made 1.x's `getSession('userId')` impossible to move off. The
  global namespace is deliberate: an interface re-exported from the package
  entry cannot be merged from outside.

  `this.auth.actor` throws `AuthError` when the call is anonymous, because
  reading the caller and checking it exists were two steps that had to be
  written together every time and forgetting the second failed silently;
  `this.auth.optional` is the nullable version for endpoints open to everyone.
  `can()` and `assert()` check the permission keys modules declare in their
  manifests, with `*` granting everything.

  Resolution happens inside the handler's `try`, so a resolver that throws on a
  malformed credential becomes a 401 rather than an unhandled rejection. `Auth`
  also tracks whether a resolver exists at all, so "this app never wired auth
  up" surfaces as a 500 programming error instead of masquerading as a 401.

- **`AuthResolver` receives an `AuthContext`** as a second argument:
  `{ db, get }`, the running DataSource and a resolver for module contracts.

  Without it, an application whose permissions live in the database had two bad
  options: close over an imported DataSource singleton — the exact global the
  module container exists to avoid — or copy the permissions into the session at
  login, where a revoked role keeps working until the next sign-in and a deleted
  user stays an actor. With `get`, the policy for who may do what stays inside
  the module that owns it, behind a contract.

  The context is built once per handler, not per request: the DataSource and the
  container are stable, only the request changes.

- **`HttpStatus` is now exported** from the package entry. It never was, which
  left `CustomError(status, ...)` and `this.httpStatus` without a way to name
  the value they take.

- **`ForbiddenError`** (403) — the caller is known but not allowed. Kept apart
  from `AuthError` (401) because the two say opposite things to a client:
  authenticate and retry, versus don't bother.


- **`defineModule()`** — the manifest a module declares about itself: `id`,
  `version`, `engine` range, `requires`, entities, migrations, route and task
  globs, permissions and lifecycle hooks. It returns a `ResolvedModule` with
  every default applied, so nothing downstream guards against `undefined`.

  It validates what a module can know on its own — shape, formats, internal
  duplicates — and throws `ModuleDefinitionError` naming the offending module,
  at import time. Relational checks (a dependency exists, ids are unique, the
  host satisfies `engine`) belong to the registry, which sees every module.

  Two rules worth calling out: a permission key must be namespaced with the
  module id (`billing.view`), because third-party modules share one permission
  space; and `migrations` accepts both an array and the namespace object from
  `import * as migrations`, flattening either to what TypeORM wants.

  Contracts, events and slots are deliberately absent: each lands with its own
  subsystem, so the manifest never describes something the framework cannot
  honor.

- **`resolveModules()`** — orders a set of modules so each one starts after its
  dependencies, and refuses the set when it cannot start safely: duplicate ids,
  missing dependencies, cycles, host incompatibility, or depending on a module
  that is installed but disabled. Throws `ModuleResolutionError`.

  A cycle is reported as the chain that forms it (`a -> b -> c -> a`), which is
  why the sort is a DFS rather than Kahn's algorithm. Unrelated modules keep
  their input order, so an installation migrates and mounts in the same
  sequence on every run.

  `engine` is matched against the host's base version: a host on `2.0.0-dev.0`
  satisfies `^2.0.0`. Strict semver ranks a prerelease below its own release,
  which would leave a prerelease host unable to load anything — exactly while
  2.0 is being built. It only drops the tag: `3.0.0-alpha` still fails `^2.0.0`.

- **`_modules` table, `ModuleStore` and `reconcileModules()`** — what an
  installation remembers about its modules, and how the code on disk is matched
  against it on boot. The framework creates the table itself through TypeORM's
  schema builder: it is read *before* any module migration runs, so it cannot
  come from one.

  The decision is pure and tested on its own (`reconcileModules()`); the store
  is only I/O. It reports what to install, what changed version (flagging a
  downgrade, which happens when a deploy is rolled back) and which modules are
  recorded but no longer in the code.

  Two rules it enforces: a new module arrives **disabled** unless it is core, so
  a release never puts unrequested screens in front of an operator — nor hands
  out a package that was not paid for once modules are licensed; and a module
  whose code is gone is **reported, never deleted**, because dropping data is
  the installer's call, not a boot sequence's.

  Turning a module off does not hide its data: every module present in the code
  contributes its entities to the DataSource regardless, so the tables and their
  contents stay. What this table governs is what runs.

- **`ModuleMigrator`** — runs each module's migrations in the order the modules
  were resolved, recording them in `_module_migrations`.

  TypeORM's own runner cannot do this: it sorts every migration in the
  DataSource by timestamp, globally, so a module written last year would migrate
  before the dependency it needs. Ordering by module first, and by timestamp only
  *within* a module, is what makes a dependency's tables exist before the
  dependent touches them. There is a test for exactly that case.

  Inside a module the order comes from the timestamp ending the class name, the
  convention TypeORM already uses. A migration without one is an error rather
  than a guess: `import * as migrations` yields an object whose key order nobody
  controls, and a wrong migration order is discovered in production, on data that
  already exists. Stamps compare as numbers — as text, `9000` sorts after
  `10000`.

  One transaction per migration, and the ledger row is written inside it: a
  migration that ran without leaving its row would run again on the next boot,
  over data it already changed.

- **Test harness on PGlite** (`test/helpers/test-db.ts`) — a real Postgres
  inside the process, no Docker. Dialect differences that SQLite would hide
  behave as they will in production. The database is created once per test file
  and the schema reset between cases, which took the migrator suite from 28s to
  3s. `npm test` now runs with `--experimental-vm-modules`, which PGlite needs.

- **`useModules()`** — the boot cycle, wired end to end. State is read from
  `_modules`, the graph is resolved into dependency order, pending migrations
  run, and only then are routes mounted: a route must never answer against a
  table its migration has not created yet. A broken graph or a failed migration
  refuses to start, because serving half-mounted is worse than not starting.

  Module routes go through the same pipeline as configured groups, so they get
  the same OpenAPI spec, the same logging and the same 404 behind them.

- **`ModuleLoader`** — reads a module's endpoints from its own globs, resolved
  against its `dir` (pass `__dirname`) rather than the process's working
  directory, so a module keeps working wherever it is mounted from. A module
  that declares routes and resolves to none is reported: that is a wrong glob,
  and silence turns it into endpoints that simply never answer.

- **`Liteb.close()`** — an ordered stop that does not end the process.
  `shutdown()` is the signal handler and calls `process.exit`, which makes it
  unusable from a test or from anything embedding liteb. `close({ database:
  false })` leaves a connection the caller owns untouched.

### Fixed

- **A module's globs now find its files whatever extension they have**, and a
  module can live under `node_modules`.

  `dir` is `__dirname`, so after `tsc` it points at the build output, where
  nothing ends in `.ts`. A manifest saying `routes: './apis/*.api.ts'` matched
  zero files: liteb logged one warning and started anyway, **serving 404 to
  every route**. An installation shipped to a customer's server would look
  alive and answer nothing. The same wall stopped a module published as a
  package, which only ever ships `.js`.

  Globs are now rewritten to cover `.ts`, `.js`, `.cjs` and `.mjs`, so ONE
  manifest works from source, from a build, and from `node_modules`. Where a
  source tree and its build sit side by side only one file per name is loaded
  (`.ts` wins) so nothing registers twice, and `*.d.ts` is skipped.

  The `node_modules` exclusion is now anchored to the module's own folder. It
  was global, which meant a module installed as a package — living under
  `node_modules` by definition — matched none of its own files.

- `npm run build` now clears `dist/` and `types/` first. Without it the tarball
  shipped files from deleted modules — `templates/api`, `utilities/queue`,
  `utilities/transaction`, `templates/service`, `templates/middleware` — so a
  consumer could deep-import 1.x code that no longer exists in the source.


- `start()` no longer throws when handed an already-initialized DataSource. An
  application embedding liteb, or a test suite reusing a connection, hit
  `CannotConnectAlreadyConnectedError`; the live connection is adopted instead.

- **`Liteb.create()`** — builds the application from its modules and owns the
  DataSource. This is the inversion modules require: TypeORM needs the full
  entity list when the DataSource is *constructed*, and that list is the union
  of what every module contributes, which an application cannot assemble by
  hand without knowing each module's internals.

  Entities are collected from every module present in the code, enabled or not.
  Leaving a disabled module's entities out would drop its tables from TypeORM's
  view and make turning it back on a gamble; disabling decides what runs, never
  whether data is reachable.

  The same entity declared by two modules is refused: one of them is reaching
  into the other's domain, and unchecked it surfaces later as a confusing
  TypeORM error about a duplicate table.

  A DataSource can still be passed instead of connection options, and
  `new Liteb(dataSource)` keeps working unchanged.

- **Contracts between modules** — `contract<T>(id)` declares a capability, a
  module publishes it through `provides`, and a consumer reaches it with
  `this.get(Token)` from an endpoint or a task. The consumer imports the
  contract, never the implementation, which is what lets the providing module
  change or be swapped without touching anyone who calls it.

  Access is `this.get()` rather than a free `inject()`: resolving without an
  explicit receiver would need a process-wide container, and two applications
  in one process — a test suite, a worker beside a server — must not see each
  other's implementations. The container is per application, injected on the
  prototype like `db`.

  Implementations are built on first use, so a module nobody calls never pays
  for its dependencies and startup does not hang on something one endpoint
  needs. A contract provided by two modules is refused: consumers would get one
  by load order, a bug that moves between deploys. A cycle *while building* is
  reported instead of exhausting the stack; a mutual reference resolved on use
  stays valid, since that is how two modules legitimately call each other.

  Declaring `consumes` turns a missing provider into a refusal to start rather
  than a failure on whichever request needed it first, in production. The
  framework cannot infer it by reading code, which is why it is declared.

- **Scheduled tasks from modules** — a module's `tasks` globs are loaded and
  started on boot, receiving `db` and the container like an endpoint does. They
  follow the same rule as routes: only enabled modules get theirs started, so a
  disabled module never leaves a cron running, and `close()` stops them.

- `semver` as a direct dependency, to validate versions and `engine` ranges.

### Changed

- **`ModuleEntity` narrowed** from `Function | object` to
  `Function | EntitySchema<any>`. The wide version made
  `collectModuleEntities()` unassignable to a DataSource the application builds
  itself, which is a supported path — found while writing the example app
  against the published surface.

- **The example app under `src/` was rewritten** as one coherent flow, and is
  now covered by `test/demo-app.spec.ts`, which boots it against an in-process
  Postgres.

  The previous one had rotted without anyone noticing: `@Priority` was
  backwards, so `/users/all` resolved to the `:id` route and the handler
  received the literal string `"all"`; a `@Template` endpoint could never
  render because nothing ever called `setTemplates`; an endpoint carried a
  `previous` arrow property that shadowed the method and did nothing; and one
  module was a leftover from an unrelated project. None of it was reachable by
  any test.

  It is now `identity` and `catalog` (core) plus `reports` (optional, installs
  disabled), with per-module migrations and `synchronize: false`, exercising
  permissions, contracts, validation, `db.transaction()`, a view and a
  scheduled task. `http/demo.http` walks it request by request, and
  `npm run modules` toggles the optional one.

- **`Api` is now `Endpoint`.** The class models a single operation, not the whole
  API, and the name now says so. Its file moves to `lib/templates/endpoint.ts`.
  The internals that name it follow: `ApiReader` -> `EndpointReader`,
  `ApiHandler` -> `EndpointHandler`, `ApiClass` -> `EndpointClass`.
  The OpenAPI decorators (`ApiTag`, `ApiSummary`, `ApiDescription`,
  `ApiResponse`) keep their names: there, "Api" means OpenAPI.
  `setApis` / `addApis` are untouched for now — the module system replaces them.

### Removed

- **`@Template`**, replaced by `view()`. The decorator decided at boot, reading
  metadata off the class, so an endpoint was "a view" or it was not, forever —
  and the same endpoint could not answer JSON on another branch. It also only
  ever covered HTML: a PDF or a CSV had nothing to use and ended up writing to
  `this.response` by hand.

  Migration is one line moved from the class into `main()`:

  ```diff
  -@Template('products')
   export default class ProductsPageApi extends Endpoint {
     public async main(): Promise<DataJson> {
  -    return { products: await this.products.find() };
  +    return view('products', { products: await this.products.find() });
     }
   }
  ```

  `setTemplates()` is unchanged — the engine and the views directory are still
  the application's business. Endpoints that relied on `@Template` to stay out
  of the OpenAPI spec now say so with `@ApiHidden()`.

- **`Endpoint.error()` and `Endpoint.final()`**, and the `ErrorResponse` type
  with them. `previous()` stays.

  Measured against the main consumer: of 323 endpoints, 9 implemented each hook,
  and all 9 `error()` bodies were a single `rollbackTransaction()` while all 9
  `final()` bodies were a single `release()`. Nobody ever used `error()` for
  what it documented — reshaping the error response — because throwing the right
  error class already does that.

  So the hooks were not a lifecycle, they were a `try/catch/finally` split
  across three methods, which hid a transaction's boundaries from the code
  inside it: one endpoint opened on line 29, committed on line 83, rolled back
  on 111 and released on 114, and forgetting any of them was not a compile
  error. `this.db.transaction(cb)` makes commit, rollback and release the
  callback's contract instead.

  `previous()` is kept because it is the one hook nothing else replaces: it runs
  on the instance with validated `params`/`body`/`query` and the resolved
  `auth`, where a `@Use` middleware only sees the raw request, and throwing from
  it skips `main()`.

  Dropping `error()` also collapsed the handler's nested double `catch`, which
  only existed because that hook could itself throw.

- **`setApis()`, `addApis()`, `setTasks()`**, and the public constructor and
  `useModules()`. `Liteb.create({ db, modules })` is the only entry point, and
  `modules` is required.

  They were the 1.x way to mount code by glob, and keeping them made the module
  manifest optional: an application could define routes outside any module, so
  the module system was a second path rather than the path. Now anything that
  serves a request belongs to a module, which means it can always be traced to
  something installable, disableable and versioned. Versioning by URL prefix,
  which `addApis` used to serve, is a module per prefix.

  The constructor is private because the only instances it could build are an
  application with no modules — and therefore nothing to serve — or one whose
  DataSource never learned about its modules' entities, which fails later, at
  the first query.

  `setAuth()` went with them: with one entry point, `create({ auth })` is it.

- **`Endpoint.getSession()` / `setSession()`** and the `SessionDataExtends<T>`
  type. They returned `any` (666 untyped call sites in the main consumer, for
  two keys) and hard-wired the framework to `express-session`. Replaced by
  `this.auth`; writing to the session — a concern of whichever module owns
  login — is `this.request.session` directly.

  As a result `express-session` is no longer a peer dependency: add it only if
  your resolver uses cookie sessions.


**Breaking.** Everything marked `@deprecated` in `1.0` is gone. Migration is the
one stated in each deprecation notice.

- `Get` / `Post` / `Put` / `Delete` / `Patch` aliases — use `HttpGet` /
  `HttpPost` / `HttpPut` / `HttpDelete` / `HttpPatch`.
- `Queue`, `Transaction`, `createTransaction` and `Api.createTransaction()` —
  use TypeORM's `dataSource.transaction(cb)` / `this.db.transaction(cb)`.
- `Service` base class — define your own in the application.
- `InternalError` — throw a native `Error`; `ErrorControl` already maps it to a
  500, keeping its message and logging it.
- `Middleware` class — use a middleware function with `@Use`. `@Use` now only
  accepts `MiddlewareFn`, which removes the class/function branch from
  `ApiHandler` and the runtime `class` sniffing it relied on.

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
