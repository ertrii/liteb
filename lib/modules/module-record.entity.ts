import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * What the installation remembers about a module, between restarts.
 *
 * This table belongs to the framework, not to any module: it is created before
 * anything else and is the only state read to decide what gets mounted.
 *
 * Note what is NOT decided here: which tables exist. Every module present in
 * the code contributes its entities to the DataSource whether it is enabled or
 * not, so turning a module off never puts its data out of reach — the row keeps
 * standing and the tables keep their contents. What this table governs is what
 * runs: migrations, routes, tasks and contracts.
 */
@Entity('_modules')
export class ModuleRecord {
  /** The module id, which is its identity across installs. */
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  /** Version currently installed, used to detect an upgrade on boot. */
  @Column({ type: 'varchar', length: 50 })
  version: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @CreateDateColumn()
  installedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
