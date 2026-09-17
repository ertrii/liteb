import { DataSource, Table } from 'typeorm';
import { ResolvedModule } from './module-manifest';
import {
  ModuleState,
  Reconciliation,
  reconcileModules,
} from './reconcile-modules';

/**
 * Reads and writes what the installation remembers about its modules.
 *
 * Queries are written directly instead of going through a repository: this
 * table belongs to the framework, and depending on an entity would force every
 * application to register an internal class in its own DataSource — and to fail
 * at boot, confusingly, when it forgot. `_module_migrations` works the same way.
 *
 * Deliberately thin: the decision lives in `reconcileModules()`, which is pure
 * and tested on its own. What is left here is the I/O that only a real database
 * can exercise.
 */
export class ModuleStore {
  constructor(private readonly db: DataSource) {}

  /**
   * Creates `_modules` when it is missing.
   *
   * It cannot come from a migration: this table is read *before* any module's
   * migrations run, to know which modules there are. So the framework creates
   * it itself, through the schema builder rather than raw DDL, so it works on
   * every dialect TypeORM supports.
   */
  async ensureTable(): Promise<void> {
    const runner = this.db.createQueryRunner();
    try {
      if (await runner.hasTable('_modules')) return;

      const timestamp =
        this.db.options.type === 'postgres'
          ? 'timestamp with time zone'
          : 'datetime';

      await runner.createTable(
        new Table({
          name: '_modules',
          columns: [
            { name: 'id', type: 'varchar', length: '100', isPrimary: true },
            { name: 'version', type: 'varchar', length: '50' },
            { name: 'enabled', type: 'boolean', default: false },
            { name: 'installed_at', type: timestamp, default: 'now()' },
            { name: 'updated_at', type: timestamp, default: 'now()' },
          ],
        }),
        true,
      );
    } finally {
      await runner.release();
    }
  }

  async list(): Promise<ModuleState[]> {
    const rows: Array<{ id: string; version: string; enabled: boolean }> =
      await this.db.query('select id, version, enabled from _modules order by id');

    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      // Some drivers hand booleans back as 0/1.
      enabled: row.enabled === true || (row.enabled as unknown) === 1,
    }));
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
      for (const entry of result.install) {
        await manager.query(
          'insert into _modules (id, version, enabled) values ($1, $2, $3)',
          [entry.id, entry.version, entry.enabled],
        );
      }

      for (const entry of result.upgrade) {
        // Only the version: whether it is on is the installation's decision,
        // not something an upgrade gets to change.
        await manager.query(
          'update _modules set version = $1, updated_at = now() where id = $2',
          [entry.to, entry.id],
        );
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
    const existing: unknown[] = await this.db.query(
      'select id from _modules where id = $1',
      [id],
    );
    if (existing.length === 0) {
      throw new Error(`Module "${id}" is not installed.`);
    }

    await this.db.query(
      'update _modules set enabled = $1, updated_at = now() where id = $2',
      [enabled, id],
    );
  }

  /**
   * Forgets a module. Only the row: its tables and their contents stay, which
   * is what makes reinstalling it a safe operation.
   */
  async forget(id: string): Promise<void> {
    await this.db.query('delete from _modules where id = $1', [id]);
  }
}
