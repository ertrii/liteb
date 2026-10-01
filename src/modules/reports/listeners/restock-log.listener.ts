import { Listener, On } from '../../../../lib';
import { ProductRestocked } from '@/catalog/tokens/product-restocked.token';
import { UserDirectory } from '@/identity/tokens/user-directory.token';

/**
 * Reacts to something `catalog` announced, and enriches it with data owned by
 * `identity` — without either module knowing this exists.
 *
 * Nothing in `catalog` mentions this file. Take `reports` out of
 * `Liteb.create({ modules })` and the restock still works — it just stops being
 * logged, which is what it means for an event to be a push and not a call.
 */
@On(ProductRestocked)
export class RestockLogListener extends Listener<ProductRestocked> {
  async on(payload: ProductRestocked) {
    const who = await this.get(UserDirectory).find(payload.userId);
    console.log(
      `[reports] ${who?.fullName ?? 'someone'} restocked #${payload.productId} ` +
        `by ${payload.quantity} (now ${payload.stock})`,
    );
  }
}
