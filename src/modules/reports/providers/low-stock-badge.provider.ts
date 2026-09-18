import { Contributes, Provider } from '../../../../lib';
import {
  ProductBadge,
  ProductBadges,
} from '@/catalog/slots/product-badges.slot';

/**
 * What this module adds to catalog's product list — without catalog knowing it
 * exists, and without editing a single line of it.
 *
 * Because `reports` installs disabled, the badge only appears once someone
 * turns the module on. Turning it off removes it again.
 */
@Contributes(ProductBadges)
export class LowStockBadge extends Provider implements ProductBadge {
  public readonly id = 'low-stock';

  public for(product: { stock: number }): string | null {
    return product.stock < 10 ? 'Low stock' : null;
  }
}
