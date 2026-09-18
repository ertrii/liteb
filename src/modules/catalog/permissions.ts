import { declarePermissions } from '../../../lib';

/**
 * Everything this module can gate, declared ONCE.
 *
 * This is the file to start from. The manifest lists these, the endpoints
 * demand them and the application grants them, all by importing from here —
 * so the string is written in one place and a typo anywhere else does not
 * compile.
 */
export const permissions = declarePermissions('catalog', {
  'products.view': 'View products',
  'products.manage': 'Create and restock products',
});
