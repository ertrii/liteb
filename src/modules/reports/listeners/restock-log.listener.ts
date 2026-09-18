import { Listener, On } from '../../../../lib';
import { ProductRestocked } from '../../catalog/events/product-restocked.event';
import { UserDirectory } from '../../identity/contracts/user-directory.contract';

/**
 * Reacts to something `catalog` announced, and enriches it with data owned by
 * `identity` — without either module knowing this exists.
 *
 * Because `reports` installs DISABLED, nothing here runs until someone turns
 * the module on. Disabling it stops the reaction too: a module that is off must
 * not keep having side effects.
 */
@On(ProductRestocked)
export class RestockLogListener extends Listener<ProductRestocked> {
  async on(payload: ProductRestocked) {
    const who = await this.get(UserDirectory).nameOf(payload.userId);
    console.log(
      `[reports] ${who ?? 'someone'} restocked #${payload.productId} ` +
        `by ${payload.quantity} (now ${payload.stock})`,
    );
  }
}
