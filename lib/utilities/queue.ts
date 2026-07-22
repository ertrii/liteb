import { DataSource, QueryRunner, ReplicationMode } from 'typeorm';
import { Service } from '../templates/service';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

/**
 * @deprecated Use TypeORM's `dataSource.transaction(cb)`. Will be removed in a
 * future major version.
 *
 * `Queue` was created to collect services and save them IN PARALLEL within a
 * transaction, but that goal is unreachable: a `QueryRunner` wraps a single
 * connection, so the statements are serialized anyway. The `Promise.all` in
 * `save()` parallelizes nothing and, worse, leaves the ordering and error
 * propagation undefined. Real parallelism would require several connections,
 * and then atomicity is lost.
 *
 * @example
 * // Instead of Queue:
 * await this.db.transaction(async (manager) => {
 *   await manager.save(customer);
 *   await manager.save(charge);
 * }); // automatic commit / rollback / release
 *
 * Prefer `transaction()` over `createQueryRunner()` because it releases the
 * connection for you: forgetting `release()` leaks connections until the pool
 * is exhausted.
 */
export class Queue {
  private started = false;
  private queryRunner: QueryRunner;
  /**
   * Queues
   */
  private queues: Service<any>[] = [];

  private start = async () => {
    await this.queryRunner.connect();
    return this.queryRunner.startTransaction(this.isolationLevel);
  };

  constructor(
    db: DataSource,
    private isolationLevel?: IsolationLevel,
    mode?: ReplicationMode,
  ) {
    this.queryRunner = db.createQueryRunner(mode);
  }

  /**
   * Adds the service to the queue for later persistence to the database.
   * @param service
   */
  public add = (service: Service<any>) => {
    this.queues.push(service);
  };

  /**
   * Runs every pending operation in the queue, executing the queries associated
   * with each service. If the transaction has not started yet, it starts it
   * automatically before applying the changes. Clears the queue afterwards.
   */
  public save = async () => {
    if (!this.started) {
      await this.start();
      this.started = true;
    }
    const saving = this.queues.map((data) => {
      return data.save(this.queryRunner.manager);
    });
    await Promise.all(saving);
    this.queues = [];
  };

  /**
   * Applies every query accumulated in the queue, commits the transaction to
   * the database and, optionally, releases the connection used by the query
   * runner. Use this method to guarantee that all operations run atomically and
   * that resources are released correctly.
   * @param release Whether to release the connection after committing (default: false).
   */
  public commit = async (release = false) => {
    await this.save();
    await this.queryRunner.commitTransaction();
    if (release) {
      await this.release();
    }
  };

  /**
   * Releases used database connection. You cannot use query runner methods after connection is released.
   */
  public release = async () => {
    await this.queryRunner.release();
  };

  /**
   * Rollbacks transaction. Error will be thrown if transaction was not started.
   */
  public rollback = async () => {
    if (!this.started) return;
    await this.queryRunner.rollbackTransaction();
  };

  public getManager = () => {
    return this.queryRunner.manager;
  };

  public getRunner = () => {
    return this.queryRunner;
  };
}
