import {
  Body,
  Endpoint,
  HttpPost,
  HttpStatus,
  Group,
} from '../../../../lib';
import { permissions } from '../permissions';
import { CreateProductDto } from '../dto/create-product.dto';
import { Product } from '../entities/product.entity';

@Group('products')
@HttpPost()
@Body(CreateProductDto)
export class CreateProductEndpoint extends Endpoint<null, CreateProductDto> {
  private readonly products = this.db.getRepository(Product);

  async main() {
    this.auth.assert(permissions['products.manage']);

    const product = await this.products.save(
      this.products.create({ name: this.body.name, stock: this.body.stock }),
    );

    this.httpStatus = HttpStatus.CREATED;
    return product;
  }
}
