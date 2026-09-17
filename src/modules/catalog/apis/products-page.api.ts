import {
  ApiHidden,
  DataJson,
  Endpoint,
  HttpGet,
  Module,
  Priority,
  view,
} from '../../../../lib';
import { Product } from '../entities/product.entity';

/**
 * An HTML page instead of JSON.
 *
 * Two things worth copying here:
 *
 * - `view()` is returned from `main()`, not declared on the class. The endpoint
 *   could just as well answer JSON on another branch — the choice is made with
 *   the data in hand.
 * - `@Priority` matters and is easy to get backwards: Express matches in
 *   REGISTRATION order, so `/products/page` has to be registered BEFORE
 *   `/products/:id`, or `:id` swallows it and the handler receives the literal
 *   string "page". Lower number = registered first. `router.log` prints the
 *   resulting order.
 */
@Module('products')
@HttpGet('page')
@Priority(1)
@ApiHidden()
export default class ProductsPageApi extends Endpoint {
  private readonly products = this.db.getRepository(Product);

  public async main(): Promise<DataJson> {
    return view('products', {
      products: await this.products.find({ order: { id: 'ASC' } }),
    });
  }
}
