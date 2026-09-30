import { integer, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
import { products } from './product.table';

/**
 * Exists so the demo has a case that genuinely needs a transaction: restocking
 * writes the product AND its movement, and half of that is worse than neither.
 */
export const stockMoves = pgTable('demo_stock_moves', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  quantity: integer('quantity').notNull(),
  /**
   * Who did it. A plain id, NOT a reference: `identity` owns that table, and a
   * constraint across modules would stop either of them from being installed or
   * removed on its own.
   */
  userId: integer('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type StockMove = typeof stockMoves.$inferSelect;
export type NewStockMove = typeof stockMoves.$inferInsert;
