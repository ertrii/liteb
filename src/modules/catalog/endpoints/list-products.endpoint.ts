import { Endpoint, HttpGet, Group, Query } from '../../../../lib';
import { ListProductsQuery } from '../dto/list-products.query';
import { Product } from '../entities/product.entity';
import { ProductBadges } from '../module';

@Group('products')
@HttpGet()
@Query(ListProductsQuery)
export class ListProductsEndpoint extends Endpoint<null, null, ListProductsQuery> {
  private readonly products = this.db.getRepository(Product);

  async main() {
    this.auth.assert('catalog.products.view');

    // The string comparison is the point: see ListProductsQuery.
    const onlyEnabled = this.query.onlyEnabled === 'true';

    const products = await this.products.find({
      where: onlyEnabled ? { enabled: true } : {},
      order: { id: 'ASC' },
    });

    // Whoever is installed. With no extension this is an empty array, and the
    // endpoint neither knows nor cares which module put something in it.
    const badges = this.all(ProductBadges);

    return products.map((product) => ({
      ...product,
      badges: badges
        .map((badge) => badge.for(product))
        .filter((text): text is string => text !== null),
    }));
  }
}
