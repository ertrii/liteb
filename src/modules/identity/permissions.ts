import { declarePermissions } from '../../../lib';

/** What identity can gate. See `catalog/permissions.ts` for the why. */
export const permissions = declarePermissions('identity', {
  'users.view': 'View users',
  'users.manage': 'Create and edit users',
});
