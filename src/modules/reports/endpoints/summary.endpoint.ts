import { Endpoint, HttpGet, Module } from '../../../../lib';
import { UserDirectory } from '../../identity/module';
import { ProductCatalog } from '../../catalog/module';

/**
 * The whole point of contracts: this reads data owned by two other modules and
 * imports NOTHING from either — only their tokens. Swap how `identity` stores
 * users and this file does not change.
 */
@Module('reports')
@HttpGet('summary')
export class SummaryEndpoint extends Endpoint {
  async main() {
    this.auth.assert('reports.view');

    const users = this.get(UserDirectory);
    const catalog = this.get(ProductCatalog);

    const [userCount, productCount, totalStock] = await Promise.all([
      users.count(),
      catalog.count(),
      catalog.totalStock(),
    ]);

    return { userCount, productCount, totalStock };
  }
}
