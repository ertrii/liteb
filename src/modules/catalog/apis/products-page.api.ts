import { DataJson, Endpoint, HttpGet, Module, Priority, Template } from '../../../../lib';
import { Product } from '../entities/product.entity';

/**
 * An HTML view instead of JSON.
 *
 * `@Priority` matters here and is easy to get backwards: Express matches in
 * REGISTRATION order, so `/products/page` has to be registered BEFORE
 * `/products/:id`, or `:id` swallows it and the handler receives the literal
 * string "page". Lower number = registered first.
 */
@Module('products')
@HttpGet('page')
@Template('products')
@Priority(1)
export default class ProductsPageApi extends Endpoint {
  private readonly products = this.db.getRepository(Product);

  public async main(): Promise<DataJson> {
    return { products: await this.products.find({ order: { id: 'ASC' } }) };
  }
}
