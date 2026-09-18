import {
  Body,
  Endpoint,
  HttpPost,
  Group,
  NotFoundError,
  Params,
} from '../../../../lib';
import { ProductIdDto } from '../dto/product-id.dto';
import { RestockDto } from '../dto/restock.dto';
import { Product } from '../entities/product.entity';
import { StockMove } from '../entities/stock-move.entity';
import { ProductRestocked } from '../module';

/**
 * Two writes that must land together — this is what `db.transaction()` is for.
 *
 * liteb has no transaction hook and no transaction decorator on purpose:
 * commit, rollback and release are the callback's contract, so they cannot be
 * forgotten, and the transaction's boundaries stay visible in the code that
 * depends on them.
 */
@Group('products')
@HttpPost(':id/restock')
@Params(ProductIdDto)
@Body(RestockDto)
export class RestockProductEndpoint extends Endpoint<ProductIdDto, RestockDto> {
  async main() {
    this.auth.assert('catalog.products.manage');

    const productId = +this.params.id;
    const { quantity } = this.body;
    const userId = this.auth.actor.userId;

    const result = await this.db.transaction(async (manager) => {
      const product = await manager.findOneBy(Product, { id: productId });
      if (!product) throw new NotFoundError('Product not found.');

      product.stock += quantity;
      await manager.save(product);
      await manager.save(manager.create(StockMove, { productId, quantity, userId }));

      return { id: product.id, stock: product.stock };
    });

    // AFTER the transaction commits, never inside it: a listener reads on its
    // own connection and would not see the uncommitted rows.
    await this.emit(ProductRestocked, {
      productId,
      quantity,
      stock: result.stock,
      userId,
    });

    return result;
  }
}
