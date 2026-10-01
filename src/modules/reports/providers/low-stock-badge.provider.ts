import { Provides, Provider } from '../../../../lib';
import {
  ProductBadge,
  ProductBadges,
} from '@/catalog/tokens/product-badges.token';

/**
 * What this module adds to catalog's product list — without catalog knowing it
 * exists, and without editing a single line of it.
 *
 * This is what an extension looks like: the badge appears because the module is
 * deployed, and `catalog` never learns the word "low stock".
 */
@Provides(ProductBadges)
export class LowStockBadge extends Provider implements ProductBadge {
  public readonly id = 'low-stock';

  public for(product: { stock: number }): string | null {
    return product.stock < 10 ? 'Low stock' : null;
  }
}
