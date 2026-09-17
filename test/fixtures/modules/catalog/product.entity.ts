import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('productos_demo')
export class Product {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar' })
  nombre: string;
}
