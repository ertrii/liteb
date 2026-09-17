import { Schedule, Task } from '../../../../lib';
import { ProductCatalog } from '../../catalog/module';

/**
 * A module's tasks start only while the module is ENABLED. Disabling `reports`
 * unmounts its route and stops this cron, without touching any data.
 */
@Schedule('0 7 * * *')
export class DailySummaryTask extends Task {
  async start(now: Date | 'manual' | 'init') {
    // Tasks reach contracts exactly like endpoints do.
    const catalog = this.get(ProductCatalog);
    console.log(`[${String(now)}] total stock: ${await catalog.totalStock()}`);
  }
}
