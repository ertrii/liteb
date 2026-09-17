import { contract, defineModule } from '../../../lib';
import { Product } from './entities/product.entity';
import { StockMove } from './entities/stock-move.entity';
import * as migrations from './migrations';

export interface ProductCatalog {
  count(): Promise<number>;
  totalStock(): Promise<number>;
}

export const ProductCatalog = contract<ProductCatalog>('catalog.products');

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
