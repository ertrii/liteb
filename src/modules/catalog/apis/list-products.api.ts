import { Endpoint, HttpGet, Module, Query } from '../../../../lib';
import { ListProductsQuery } from '../dto/list-products.query';
import { Product } from '../entities/product.entity';

@Module('products')
@HttpGet()
@Query(ListProductsQuery)
export class ListProductsApi extends Endpoint<null, null, ListProductsQuery> {
  private readonly products = this.db.getRepository(Product);

  main() {
    this.auth.assert('catalog.products.view');

    // The string comparison is the point: see ListProductsQuery.
    const onlyEnabled = this.query.onlyEnabled === 'true';

    return this.products.find({
      where: onlyEnabled ? { enabled: true } : {},
      order: { id: 'ASC' },
    });
  }
}
