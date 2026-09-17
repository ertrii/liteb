import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('demo_products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;
}
