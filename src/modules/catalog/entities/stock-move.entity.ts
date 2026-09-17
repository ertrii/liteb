import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Exists so the demo has a case that genuinely needs a transaction: restocking
 * writes the product AND its movement, and half of that is worse than neither.
 */
@Entity('demo_stock_moves')
export class StockMove {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  productId: number;

  @Column({ type: 'int' })
  quantity: number;

  /**
   * Who did it. A plain id, NOT a foreign key: `identity` owns that table, and
   * a constraint across modules would stop either of them from being installed
   * or removed on its own.
   */
  @Column({ type: 'int' })
  userId: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
