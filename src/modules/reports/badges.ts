import { ProductBadge } from '../catalog/module';

/**
 * What this module adds to catalog's product list — without catalog knowing it
 * exists, and without editing a single line of it.
 *
 * Because `reports` installs disabled, the badge only appears once someone
 * turns the module on. Turning it off removes it again.
 */
export const lowStockBadge: ProductBadge = {
  id: 'low-stock',
  for: (product) => (product.stock < 10 ? 'Low stock' : null),
};
