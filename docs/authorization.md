| 500 `Unknown permission` | The key is in no manifest. With `declarePermissions` this is nearly always a string literal somebody typed instead of importing the set. || Which keys **exist** | the module's `permissions.ts` | the module |# Authorization

Who is making the request, and what they are allowed to do.

liteb stores **no users and no roles**. It receives a list of permission keys
per request and compares strings. Everything below is about who produces that
list and who checks it.

## The three responsibilities

They are separate on purpose, and nothing works until all three are present.

| Responsibility | Where it lives | Who decides |
| --- | --- | --- |
| Which keys **exist** | the module's `permissions.ts` | the module |
| Which keys somebody **holds** | your `auth` resolver | your application |
| Which keys an endpoint **demands** | `this.auth.assert(...)` | the endpoint |

The endpoint never learns that users exist. The user never learns that
endpoints exist. They meet at the key.

---

# Step by step

## 1. What a new project starts with

`liteb init` writes `src/config/auth.ts`: a resolver that lets **everyone**
through with every permission, and warns once in the log the first time it
does. It is not authentication. It is there so `this.auth` works, the generated
`this.auth.assert(...)` lines pass, and the permission keys are checked by the
compiler from the first request — the gate in place and open, so closing it
later is one file.

Replace its body (step 3) and everything already written starts being enforced.

`auth` is optional to the framework, all the same: an endpoint that never reads
`this.auth` needs no resolver, and an application made only of those runs with
no authorization wiring whatsoever. That is what `--public` scaffolds.

```typescript
@HttpGet()
export default class ListTasksEndpoint extends Endpoint {
  public async main() {
    return this.db.getRepository(Task).find();
  }
}
```

This answers 200 to anybody. Everything that follows is what you add when that
stops being what you want.

## 2. Declare the keys the module can gate

One file, and it is the only place a key is ever spelled out:

```typescript
// src/modules/tasks/permissions.ts
import { declarePermissions } from 'liteb';

export const permissions = declarePermissions('tasks', {
  view: 'View tasks',
  manage: 'Create and edit tasks',
  assign: 'Assign a task to somebody else',
});
```

The manifest lists them by reference, so there is no second list to keep in
sync:

```typescript
// src/modules/tasks/module.ts
import { permissions } from './permissions';

export default defineModule({
  id: 'tasks',
  version: '1.0.0',
  core: true,
  dir: __dirname,

  permissions,
});
```

Then list the module once, in the application's `src/config/permissions.ts`:

```typescript
import type { PermissionsOf } from 'liteb';

declare global {
  namespace LitebAuth {
    interface Permissions
      extends PermissionsOf<typeof import('../modules/tasks/permissions').permissions> {}
  }
}
```

That is what makes the keys CHECKED while they stay plain strings:
`this.auth.assert('tasks.manage')` reads the way it always did, and
`'tasks.mange'` does not compile. One `declare global` block per module,
merged by TypeScript, so adding a module is an append and nothing here is ever
reopened. Leave the file empty and any string is accepted again — the run-time
check is then the only net.

`liteb init` writes `config/permissions.ts`, `liteb module` writes the
module's `permissions.ts` and appends its block there, and
`liteb endpoint tasks/assign --permission tasks.assign` adds a line to
the module's file. Nothing has to be wired by hand.

> The plain array — `permissions: [{ key, label }]` — still works, and is what
> you want when the keys come from somewhere else. You lose the typed keys.

Two rules the manifest enforces at import time, before anything boots:

- **The key must start with the module id.** `tasks.view` is valid inside the
  `tasks` module; `billing.view` is not. Every installed module, including
  third-party ones, shares a single key space, so the id is what keeps two
  modules from meaning different things by the same word.
- **The label is required.** It is what a person reads on the screen where
  somebody builds a role — not a description of the code. Write it the way you
  would explain the permission out loud.

The catalog of every declared key is `app.permissions()`:

```typescript
[
  { key: 'tasks.view', label: 'View tasks', moduleId: 'tasks' },
  { key: 'tasks.manage', label: 'Create and edit tasks', moduleId: 'tasks' },
]
```

It is built from every module **present, enabled or not**. Turning a module off
decides what runs, never what a key means — otherwise roles already assigned
would point at keys that momentarily do not exist.

## 3. Turn a request into an actor

One function, passed to `Liteb.create()`. It runs once per request.

```typescript
// src/config/roles.ts — your policy, not the framework's
import { permissions as tasks } from '../modules/tasks/permissions';

export const PERMISSIONS_BY_ROLE: Record<UserRole, string[]> = {
  owner: ['*'],                                  // everything, see below
  agent: ['tasks.view', 'tasks.manage'],         // checked, see step 2
  viewer: ['tasks.view'],
  auditor: [...tasks],                           // everything THIS module has
};
```

```typescript
// src/config/session-auth.ts
const sessionAuth: AuthResolver = async (request, { db }) => {
  const userId = request.session?.userId;
  if (!userId) return null;                 // anonymous

  const user = await db.getRepository(User).findOneBy({ id: userId });
  if (!user) return null;                   // deleted mid-session

  return {
    actor: { userId },
    permissions: PERMISSIONS_BY_ROLE[user.role],
  };
};
```

```typescript
// src/index.ts
const app = await Liteb.create({ db, modules, version, auth: sessionAuth });
```

Three things about the return value:

- **`null` means anonymous.** Not an error: an endpoint that demands nothing
  still answers.
- **`actor` is whatever your application says it is.** liteb declares the shape
  empty and you widen it once (see *Typing the actor* below). A user id, a
  tenant, an API key issued to an integration are all valid.
- **`permissions` is a plain list of strings.** Where it comes from is yours: a
  constant like the one above, a column, a join table, a call to another
  service.

The session holds **only the user id**. Permissions are read per request, not
copied in at login, so removing a role takes effect on the next request rather
than the next sign-in. That costs one lookup per request; cache it if it
matters, but start correct.

## 4. Demand a key

```typescript
@HttpPost()
@Body(CreateTaskDto)
export default class CreateTaskEndpoint extends Endpoint<null, CreateTaskDto> {
  public async main() {
    this.auth.assert('tasks.manage');

    return this.db.getRepository(Task).save({
      ...this.body,
      createdBy: this.auth.actor.userId,
    });
  }
}
```

`assert()` on the first line, before any work. Reading `this.auth.actor` after
it is safe: if the call were anonymous, `assert` would already have stopped the
request.

## 5. Read what happens

With the resolver above and a user whose role is `agent`
(`['tasks.view', 'tasks.manage']`):

| Request | `assert` | Result |
| --- | --- | --- |
| `POST /api/tasks`, signed in | `tasks.manage` | **200** — holds it |
| `POST /api/tasks/1/assign`, signed in | `tasks.assign` | **403** — known, not allowed |
| `POST /api/tasks`, no cookie | `tasks.manage` | **401** — resolver returned `null` |
| `POST /api/tasks`, owner | `tasks.manage` | **200** — `*` holds everything |
| `GET /api/tasks` (no assert) | — | **200** — anyone, even anonymous |

---

# The three failures, and what each one means

They are different on purpose. Reading the status tells you where to look.

## 401 — nobody is signed in

```json
{ "message": "...", "response": null, "errorFields": {}, "identifier": "unauthorized" }
```

The resolver returned `null` and an endpoint demanded something. Tells the
client: authenticate and try again.

## 403 — signed in, not allowed

```json
{ "message": "Missing permission: tasks.assign.", "response": null, "errorFields": {}, "identifier": "forbidden" }
```

Tells the client: do not bother retrying. Look at the role, the grant, or the
policy in your resolver.

## 500 — the code is wrong

Two cases, both programming mistakes rather than answers to the caller.

**A key nobody declares:**

```
Unknown permission "tasks.assing": no installed module declares it.
Add it to that module's "permissions" in defineModule().
Did you mean: tasks.assign, tasks.manage, tasks.view?
```

Checked **before** the 401, deliberately: the first request in development is
usually anonymous, which is exactly when you want to hear about a typo. If this
answered 403 you would go looking at roles instead of at the spelling.

**No resolver at all:**

```
This application resolves no actor: pass `auth` to Liteb.create()
before reading this.auth.
```

The application never wired authorization up. That is not an unauthorized
visitor, so it must not look like one.

---

# `assert` and `can`

Two verbs, two different jobs.

```typescript
this.auth.assert('tasks.manage');     // stop the request: 401 or 403
if (this.auth.can('tasks.assign')) {  // branch: never throws
  ...
}
```

Use `assert` when the answer is "you may not have this". Use `can` when the
answer changes shape instead of being refused — a column not everyone sees, a
total only a manager gets, an action the response advertises or does not.

```typescript
public async main() {
  this.auth.assert('tasks.view');

  const tasks = await this.repo.find();

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    // Only somebody who could act on it needs to know who is on it.
    assignee: this.auth.can('tasks.assign') ? task.assignee : undefined,
  }));
}
```

Both take **several keys and require all of them**:

```typescript
this.auth.assert('tasks.manage', 'tasks.assign');   // AND, not OR
```

For "one of these", use `can` twice — there is no `assertAny`, on purpose:
writing the OR out makes it visible in review, which is where a permissive gate
should be noticed.

```typescript
if (!this.auth.can('tasks.manage') && !this.auth.can('tasks.assign')) {
  throw new ForbiddenError('You cannot touch this task.');
}
```

## The rest of `this.auth`

| | What it gives | When anonymous |
| --- | --- | --- |
| `this.auth.actor` | the actor | **throws** 401 |
| `this.auth.optional` | the actor or `null` | `null` |
| `this.auth.isAuthenticated` | `boolean` | `false` |
| `this.auth.permissions` | the keys held | `[]` |
| `this.auth.can(...)` | `boolean` | `false` |
| `this.auth.assert(...)` | nothing | **throws** 401 |

`actor` throwing is the point: reading it and checking it existed were two
steps that had to be written together every single time, and forgetting the
second failed silently.

---

# `*`

A resolver may return `['*']`, which holds every permission — present and
future. It is what "owner" usually means.

```typescript
owner: ['*'],
```

It is always a valid key to ask about, even though no module declares it, and
it never trips the unknown-key check. Two consequences worth knowing:

- A module installed next month is immediately usable by an owner, with no edit
  to the role.
- An owner can never be used to test that a gate works. Test with the role that
  should be refused.

---

# Typing the actor

liteb declares `Actor` empty. Widen it **once**, anywhere in your application,
and every endpoint sees it:

```typescript
declare global {
  namespace LitebAuth {
    interface Actor {
      userId: number;
      tenantId: string;
    }
  }
}
```

From then on `this.auth.actor.tenantId` is typed, and a resolver that forgets to
return it does not compile.

It is a global namespace and not an exported interface because an interface
re-exported from the package cannot be merged from outside — this is the only
shape a consumer can actually widen.

---

# Recipes

## A public endpoint inside a gated module

Do nothing. No `assert`, no decorator:

```typescript
@HttpGet('public-board')
export default class PublicBoardEndpoint extends Endpoint {
  public async main() {
    return this.repo.findBy({ isPublic: true });
  }
}
```

## Signed in, but no particular permission

```typescript
public async main() {
  const userId = this.auth.actor.userId;   // 401 if anonymous, and that is all
  return this.repo.findBy({ createdBy: userId });
}
```

## Yours, or anybody's with the permission

```typescript
public async main() {
  const task = await this.repo.findOneBy({ id: this.params.id });
  if (!task) throw new NotFoundError('Task not found');

  const mine = task.createdBy === this.auth.actor.userId;
  if (!mine && !this.auth.can('tasks.manage')) {
    throw new ForbiddenError('This task is not yours.');
  }

  return task;
}
```

## Serving both anonymous and signed-in callers

```typescript
public async main() {
  const actor = this.auth.optional;        // null instead of throwing
  return actor
    ? this.repo.findBy({ createdBy: actor.userId })
    : this.repo.findBy({ isPublic: true });
}
```

## Everything one module declares

A set spreads into its keys, which is the "this role owns this module" grant
without listing them one by one — and without `*`, which would also hand over
every other module:

```typescript
import { permissions as tasks } from '../modules/tasks/permissions';
import { permissions as billing } from '../modules/billing/permissions';

manager: [...tasks, ...billing],
```

## Policy in the database instead of a constant

The resolver is the only thing that changes. Nothing else in the application
knows the difference.

```typescript
const sessionAuth: AuthResolver = async (request, { db }) => {
  const userId = request.session?.userId;
  if (!userId) return null;

  const rows = await db.query(
    `select p.key from user_roles ur
       join role_permissions p on p.role_id = ur.role_id
      where ur.user_id = $1`,
    [userId],
  );

  return { actor: { userId }, permissions: rows.map((row) => row.key) };
};
```

To validate the roles screen against what actually exists, feed it
`app.permissions()` — the list comes from the modules, so a module added later
shows up without editing a central file.

---

# Where `this.auth` does not exist

Only an `Endpoint` has it, because only a request has an actor behind it.

- **A scheduled task** runs because the clock said so. Nobody asked for it, so
  there is nothing to authorize. If it acts on somebody's behalf, that has to be
  data it reads, not an ambient actor.
- **A listener** reacts to an event another module announced. If the actor
  matters, the event payload carries it — `ProductRestocked` in the demo carries
  `userId` for exactly this reason.
- **The resolver itself** obviously cannot use it.

---

# Rules for keys

- Must start with the module id, then at least one more dotted segment:
  `tasks.view`, `tasks.board.export`. `declarePermissions` adds the prefix, so
  the names you write are `view` and `board.export`.
- Lowercase, digits and dashes: `customer-portal.view` is fine, `Tasks.View` is
  not.
- No duplicates inside one module.
- All of this is checked when the manifest is imported, so a bad key is a
  refusal to start rather than a surprise later.

A useful convention, not a rule: `<module>.<thing>.<action>` once a module gates
more than a couple of things — `catalog.products.view`,
`catalog.products.manage`. The typo suggestion lists the keys sharing the first
segment, so a consistent namespace makes the error message useful.

---

# Troubleshooting

| Symptom | Cause |
| --- | --- |
| 500 `resolves no actor` | No `auth` in `Liteb.create()`, and something read `this.auth`. |
| 500 `Unknown permission` | The key is in no manifest — usually a typo, sometimes a key written in the endpoint and never declared. |
| 403 for everybody, always | The resolver returns `permissions: []`, or the role map has no entry for that role (`undefined` reaches the check as empty). |
| 401 while signed in | The resolver returned `null`: the session has no `userId`, or the user row is gone. |
| Everything passes, nothing is gated | The scaffold resolver in `src/config/auth.ts` is still there: it grants `*` to everyone. It warns once in the log the first time it does. |
| A key vanished from the roles screen | You are listing from somewhere other than `app.permissions()`. That list includes disabled modules on purpose. |
| Works for the owner, not for anyone else | `*` holds everything. Test with a role that should be refused. |
