import { Provider, Provides } from '../../../../lib';
import { ProductCatalog } from '../contracts/product-catalog.contract';
import { Product } from '../entities/product.entity';

@Provides(ProductCatalog)
export class ProductCatalogProvider extends Provider implements ProductCatalog {
  private readonly products = this.db.getRepository(Product);

  public count(): Promise<number> {
    return this.products.count();
  }

  public async totalStock(): Promise<number> {
    const row = await this.products
      .createQueryBuilder('p')
      .select('coalesce(sum(p.stock), 0)', 'total')
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }
}
