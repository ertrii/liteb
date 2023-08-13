import DBSource from './db-source';
import {
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectId,
  SaveOptions,
} from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

/**
 * Creates a query runner used for perform queries on a single database connection. Using query runners you can control your queries to execute using single database connection and manually control your database transaction.
 * Mode is used in replication mode and indicates whatever you want to connect to master database or any of slave databases. If you perform writes you must use master database, if you perform reads you can use slave databases.
 */
export class Transaction {
  readonly queryRunner = DBSource.DataSource.createQueryRunner();

  /**
   * Starts transaction.
   */
  async start(isolationLevel?: IsolationLevel) {
    await this.queryRunner.connect();
    return this.queryRunner.startTransaction(isolationLevel);
  }

  /**
   * Commits transaction. Error will be thrown if transaction was not started.
   */
  commit() {
    return this.queryRunner.commitTransaction();
  }

  /**
   * Rollbacks transaction. Error will be thrown if transaction was not started.
   */
  rollback() {
    return this.queryRunner.rollbackTransaction();
  }

  /**
   * Releases used database connection. You cannot use query runner methods after connection is released.
   */
  release() {
    return this.queryRunner.release();
  }

  /**
   * Saves all given entities in the database. If entities do not exist in the database then inserts, otherwise updates.
   */
  save<T>(entities: T, options?: SaveOptions) {
    return this.queryRunner.manager.save(entities, options);
  }

  /**
   * Deletes entities by a given condition(s). Unlike save method executes a primitive operation without cascades, relations and other operations included. Executes fast and efficient DELETE query. Does not check if entity exist in the database. Condition(s) cannot be empty.
   */
  delete<T>(
    targetOrEntity: EntityTarget<T>,
    criteria:
      | string
      | number
      | string[]
      | FindOptionsWhere<T>
      | Date
      | ObjectId
      | number[]
      | Date[]
      | ObjectId[],
  ) {
    return this.queryRunner.manager.delete<T>(targetOrEntity, criteria);
  }

  find<T>(entityClass: EntityTarget<T>, options: FindManyOptions<T>) {
    return this.queryRunner.manager.find(entityClass, options);
  }

  /**
   * Finds first entity by a given find options. If entity was not found in the database - returns null.
   */
  findOne<T>(entityClass: EntityTarget<T>, options: FindOneOptions<T>) {
    return this.queryRunner.manager.findOne(entityClass, options);
  }

  /**
   * Entity manager working only with this query runner.
   */
  get manager() {
    return this.queryRunner.manager;
  }
}
