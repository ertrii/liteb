import {
  Endpoint,
  HttpGet,
  Group,
  NotFoundError,
  Params,
  Priority,
} from '../../../../lib';
import { permissions } from '../permissions';
import { ProductIdDto } from '../dto/product-id.dto';
import { Product } from '../entities/product.entity';

/** Priority 2: the `:id` route must come after the literal `/page`. */
@Group('products')
@HttpGet(':id')
@Params(ProductIdDto)
@Priority(2)
export class GetProductEndpoint extends Endpoint<ProductIdDto> {
  private readonly products = this.db.getRepository(Product);

  async main() {
    this.auth.assert(permissions['products.view']);

    const product = await this.products.findOneBy({ id: +this.params.id });
    // Thrown, not returned: the framework maps it to a 404 with the same shape
    // as every other error.
    if (!product) throw new NotFoundError('Product not found.');

    return product;
  }
}
