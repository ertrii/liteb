import type { PermissionsOf } from '../../lib';
import type { permissions as catalog } from '../modules/catalog/permissions';
import type { permissions as identity } from '../modules/identity/permissions';
import type { permissions as reports } from '../modules/reports/permissions';

/**
 * Every key the installed modules declare, taught to the compiler ONCE.
 *
 * With this file, `this.auth.assert('catalog.products.view')` is a plain
 * string that TypeScript checks: misspell it and the build fails, instead of
 * the framework answering 500 on the first request that reaches the line.
 *
 * Each module still declares its own keys in its own `permissions.ts` — this
 * only carries those spellings into the type system.
 *
 * One block per module, and interface merging joins them. That is why
 * `liteb create module` can add a module by APPENDING here instead of editing
 * a list: nothing in this file has to be reopened.
 */
declare global {
  namespace LitebAuth {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Permissions extends PermissionsOf<typeof catalog> {}
  }
}

declare global {
  namespace LitebAuth {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Permissions extends PermissionsOf<typeof identity> {}
  }
}

declare global {
  namespace LitebAuth {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Permissions extends PermissionsOf<typeof reports> {}
  }
}
