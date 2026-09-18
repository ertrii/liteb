import { declarePermissions } from '../../../lib';

/** What reports can gate. */
export const permissions = declarePermissions('reports', {
  view: 'View reports',
});
