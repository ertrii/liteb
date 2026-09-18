import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Roles this demo knows. The mapping to permissions is the APPLICATION's,
 * in `src/config/roles.ts`: the module declares which keys exist, not who
 * holds them. */
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
