import { contract, defineModule, event, slot } from '../../../lib';
import { Product } from './entities/product.entity';
import { StockMove } from './entities/stock-move.entity';
import * as migrations from './migrations';

export interface ProductCatalog {
  count(): Promise<number>;
  totalStock(): Promise<number>;
}

export const ProductCatalog = contract<ProductCatalog>('catalog.products');

/**
 * Announced after stock goes up. Catalog does not know or care who reacts —
 * that is the difference with a contract, where it would be asking someone in
 * particular to do something and waiting for the answer.
 */
export interface ProductRestocked {
  productId: number;
  quantity: number;
  stock: number;
  userId: number;
}

export const ProductRestocked = event<ProductRestocked>(
  'catalog.product.restocked',
);

/**
 * An open extension point: catalog does not know which badges will exist, so
 * it declares the shape and shows whatever is installed.
 *
 * Note the direction. The module that OPENS the slot is the one extensions
 * depend on — `catalog` is core and knows nothing about who fills it, while a
 * contributor imports this token. Backwards, core would depend on its own
 * extensions and none of them could be removed.
 */
export interface ProductBadge {
  id: string;
  /** The text to show, or `null` when it does not apply to that product. */
  for(product: { id: number; stock: number }): string | null;
}

export const ProductBadges = slot<ProductBadge>('catalog.product-badges');

export default defineModule({
  id: 'catalog',
  version: '1.0.0',
  label: 'Catalog',
  core: true,
  engine: '^2.0.0',
  dir: __dirname,

  // Declared, and checked at boot: catalog refuses to start without identity.
  requires: ['identity'],

  entities: [Product, StockMove],
  migrations,
  routes: './apis/*.api.ts',

  permissions: [
    { key: 'catalog.products.view', label: 'View products' },
    { key: 'catalog.products.manage', label: 'Create and restock products' },
  ],

  provides: [
    {
      token: ProductCatalog,
      factory: ({ db }) => {
        const products = db.getRepository(Product);
        return {
          count: () => products.count(),
          totalStock: async () => {
            const row = await products
              .createQueryBuilder('p')
              .select('coalesce(sum(p.stock), 0)', 'total')
              .getRawOne<{ total: string }>();
            return Number(row?.total ?? 0);
          },
        };
      },
    },
  ],
});
