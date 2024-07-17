import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  creationAt: string;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updateAt: string;

  @Column({ default: '' })
  name: string;

  @Column({ default: true })
  enabled: boolean;
}
