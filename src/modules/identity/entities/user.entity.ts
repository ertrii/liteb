import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Roles this demo knows. The mapping to permissions lives in `roles.ts`. */
export type UserRole = 'owner' | 'staff';

@Entity('demo_users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  fullName: string;

  /** `salt:hash`, see `services/password.ts`. */
  @Column()
  password: string;

  @Column({ type: 'varchar', default: 'staff' })
  role: UserRole;
}
