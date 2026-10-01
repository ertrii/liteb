import { Cron, Routine } from '../../../../lib';
import { ProductCatalog } from '@/catalog/tokens/product-catalog.token';

/**
 * The third way into an application: nobody calls a routine, the clock does.
 * It reaches `catalog` through the same contract the endpoints use — the
 * schedule decides WHEN the work happens, never what it may reach.
 */
@Cron('0 7 * * *')
export class DailySummaryRoutine extends Routine {
  async start(now: Date | 'manual' | 'init') {
    // Routines reach contracts exactly like endpoints do.
    const catalog = this.get(ProductCatalog);
    console.log(`[${String(now)}] total stock: ${await catalog.totalStock()}`);
  }
}
