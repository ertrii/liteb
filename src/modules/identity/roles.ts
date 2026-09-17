import { UserRole } from './entities/user.entity';

/**
 * Role -> permission keys.
 *
 * This mapping is the APPLICATION's, not the framework's: liteb only ever sees
 * the resulting list of keys. Swapping this for a table of roles in the
 * database changes nothing anywhere else.
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
