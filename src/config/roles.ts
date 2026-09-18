import { UserRole } from '../modules/identity/entities/user.entity';

/**
 * Role -> permission keys.
 *
 * It lives HERE, with the application's own configuration, and not inside
 * `identity`, because it is the application's policy: which keys somebody
 * holds is a decision about this business, while the module only declares
 * which keys EXIST (`permissions` in its manifest).
 *
 * liteb never sees this file. It receives the resulting list of strings from
 * the resolver and compares them. Swap it for a table of roles in the database
 * and nothing else changes.
 *
 * `*` grants every permission, which is what `owner` means here.
 */
export const PERMISSIONS_BY_ROLE: Record<UserRole, string[]> = {
  owner: ['*'],
  staff: [
    'identity.users.view',
    'catalog.products.view',
    'catalog.products.manage',
  ],
};
