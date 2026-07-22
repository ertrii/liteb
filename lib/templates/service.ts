import { plainToClassFromExist } from 'class-transformer';
import { EntityManager } from 'typeorm';

/**
 * @deprecated Define your own base class in the application. Will be removed in
 * a future major version.
 *
 * `Service` existed to feed {@link Queue}: its `save(manager)` is meant to be
 * invoked by the queue with the transaction manager. With `Queue` deprecated,
 * that contract no longer makes sense, and a base class for domain services is
 * an APPLICATION decision, not a framework one.
 *
 * @example
 * // Save within a transaction, with no intermediaries:
 * await this.db.transaction(async (manager) => {
 *   await manager.save(customer);
 * });
 *
 * // And if the "entity + helpers" pattern is useful, declare it in your own
 * // project with whatever contract you need, instead of inheriting it here.
 */
export abstract class Service<T> {
  protected abstract entity: T;
  /**
   * Returns the entity.
   */
  public getEntity = () => {
    return this.entity;
  };
  /**
   * Commits or performs final operations.
   * @param manager Manager
   */
  abstract save(manager: EntityManager): Promise<void>;
  /**
   * Injects data into the entity's properties.
   * Recommended only for specific cases.
   * @param entity
   */
  public put = (entity: Partial<T>) => {
    this.entity = plainToClassFromExist(this.entity, entity);
  };
}
