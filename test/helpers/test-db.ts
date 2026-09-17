import { DataSource, DataSourceOptions } from 'typeorm';
import { PGliteDriver } from 'typeorm-pglite';

/**
 * A real Postgres for tests, running inside the process: PGlite, no Docker and
 * no server. Dialect differences that SQLite would hide — schemas, timestamptz,
 * DDL in transactions — behave the way they will in production.
 *
 * `typeorm-pglite` keeps ONE PGlite instance per process, so separate
 * DataSources share the same database. Isolation comes from dropping and
 * recreating the public schema on every call, which is cheap here and does not
 * depend on the package's internals.
 */
let current: DataSource | null = null;

export async function createTestDb(
  entities: DataSourceOptions['entities'] = [],
): Promise<DataSource> {
  await closeTestDb();

  const db = new DataSource({
    type: 'postgres',
    driver: new PGliteDriver().driver,
    database: 'liteb_test',
    entities,
    synchronize: false,
    logging: false,
  });

  await db.initialize();
  await db.query('drop schema if exists public cascade');
  await db.query('create schema public');

  current = db;
  return db;
}

export async function closeTestDb(): Promise<void> {
  if (current?.isInitialized) await current.destroy();
  current = null;
}

/**
 * Empties the database without tearing down the connection.
 *
 * Booting PGlite and initializing a DataSource costs a couple of seconds;
 * dropping the schema costs milliseconds. Create the database once per test
 * file and reset between cases — same isolation, a fraction of the time.
 */
export async function resetSchema(db: DataSource): Promise<void> {
  await db.query('drop schema if exists public cascade');
  await db.query('create schema public');
}

/** Table names in the public schema, for asserting what a migration created. */
export async function tableNames(db: DataSource): Promise<string[]> {
  const rows: Array<{ table_name: string }> = await db.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`,
  );
  return rows.map((row) => row.table_name);
}
