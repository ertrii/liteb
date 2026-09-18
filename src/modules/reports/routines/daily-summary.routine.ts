import { Cron, Routine } from '../../../../lib';
import { ProductCatalog } from '../../catalog/contracts/product-catalog.contract';

/**
 * A module's routines start only while the module is ENABLED. Disabling
 * `reports` unmounts its route and stops this schedule, without touching any
 * data.
 */
@Cron('0 7 * * *')
export class DailySummaryRoutine extends Routine {
  async start(now: Date | 'manual' | 'init') {
    // Routines reach contracts exactly like endpoints do.
    const catalog = this.get(ProductCatalog);
    console.log(`[${String(now)}] total stock: ${await catalog.totalStock()}`);
  }
}
