import { UserRole } from '../modules/identity/entities/user.entity';
import { permissions as catalog } from '../modules/catalog/permissions';
import { permissions as identity } from '../modules/identity/permissions';

/**
 * Role -> permission keys.
 *
 * It lives HERE, with the application's own configuration, and not inside a
 * module, because it is the application's policy: which keys somebody holds is
 * a decision about this business, while a module only declares which keys
 * EXIST (its `permissions.ts`).
 *
 * The keys come from those same files, so this list cannot drift from them: a
 * permission renamed in the module stops compiling here. That is the point of
 * declaring them once — a permissions file is a module's public face, like a
 * contract token, and importing it is meant to happen.
 *
 * liteb never sees this file. It receives the resulting list of strings from
 * the resolver and compares them. Swap it for a table of roles in the database
 * and nothing else changes.
 *
 * `*` grants every permission, which is what `owner` means here. Note what it
 * costs: an owner can never prove a gate works, so test with `staff`.
 */
export const PERMISSIONS_BY_ROLE: Record<UserRole, string[]> = {
  owner: ['*'],
  staff: [
    identity['users.view'],
    catalog['products.view'],
    catalog['products.manage'],
  ],
};
