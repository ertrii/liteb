import { DataSource, Table } from 'typeorm';
import { ModuleRecord } from './module-record.entity';
import { ResolvedModule } from './module-manifest';
import {
  ModuleState,
  Reconciliation,
  reconcileModules,
} from './reconcile-modules';

/**
 * Reads and writes what the installation remembers about its modules.
 *
 * Deliberately thin: every decision lives in `reconcileModules()`, which is
 * pure and tested on its own. What is left here is the I/O that only a real
 * database can exercise.
 */
export class ModuleStore {
  constructor(private readonly db: DataSource) {}

  private get repository() {
    return this.db.getRepository(ModuleRecord);
  }

  /**
   * Creates `_modules` when it is missing.
   *
   * It cannot come from a migration: this table is read *before* any module's
   * migrations run, to know which modules there are. So the framework creates
   * it itself, through the schema builder rather than raw SQL, so it works on
   * every dialect TypeORM supports.
   */
  async ensureTable(): Promise<void> {
    const runner = this.db.createQueryRunner();
    try {
      if (await runner.hasTable('_modules')) return;

      await runner.createTable(
        new Table({
          name: '_modules',
          columns: [
            { name: 'id', type: 'varchar', length: '100', isPrimary: true },
            { name: 'version', type: 'varchar', length: '50' },
            { name: 'enabled', type: 'boolean', default: false },
            {
              name: 'installedAt',
              type: this.timestampType(),
              default: 'now()',
            },
            {
              name: 'updatedAt',
              type: this.timestampType(),
              default: 'now()',
            },
          ],
        }),
        true,
      );
    } finally {
      await runner.release();
    }
  }

  /** `timestamptz` where it exists, plain timestamp elsewhere. */
  private timestampType(): string {
    return this.db.options.type === 'postgres'
      ? 'timestamp with time zone'
      : 'datetime';
  }

  async list(): Promise<ModuleState[]> {
    const records = await this.repository.find();
    return records.map(({ id, version, enabled }) => ({ id, version, enabled }));
  }

  /**
   * Brings the table in line with the code and returns what changed, so the
   * caller can report it. Runs in one transaction: a half-applied module table
   * would leave the next boot guessing.
   */
  async sync(modules: ResolvedModule[]): Promise<Reconciliation> {
    const stored = await this.list();
    const result = reconcileModules(modules, stored);

    if (result.install.length === 0 && result.upgrade.length === 0) {
      return result;
    }

    await this.db.transaction(async (manager) => {
      const repository = manager.getRepository(ModuleRecord);

      for (const entry of result.install) {
        await repository.insert({
          id: entry.id,
          version: entry.version,
          enabled: entry.enabled,
        });
      }

      for (const entry of result.upgrade) {
        await repository.update({ id: entry.id }, { version: entry.to });
      }
    });

    return result;
  }

  async enable(id: string): Promise<void> {
    await this.setEnabled(id, true);
  }

  async disable(id: string): Promise<void> {
    await this.setEnabled(id, false);
  }

  private async setEnabled(id: string, enabled: boolean): Promise<void> {
    const result = await this.repository.update({ id }, { enabled });
    if (result.affected === 0) {
      throw new Error(`Module "${id}" is not installed.`);
    }
  }

  /**
   * Forgets a module. Only the row: its tables and their contents stay, which
   * is what makes reinstalling it a safe operation.
   */
  async forget(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}
