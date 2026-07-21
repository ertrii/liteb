import { plainToClassFromExist } from 'class-transformer';
import { EntityManager } from 'typeorm';

/**
 * @deprecated Define tu propia clase base en la aplicación. Se eliminará en una
 * versión mayor futura.
 *
 * `Service` existía para alimentar a {@link Queue}: su `save(manager)` está
 * pensado para que la cola lo invoque con el manager de la transacción. Al
 * quedar `Queue` deprecado, ese contrato pierde sentido, y una clase base para
 * servicios de dominio es una decisión de la APLICACIÓN, no del framework.
 *
 * @example
 * // Guardar dentro de una transacción, sin intermediarios:
 * await this.db.transaction(async (manager) => {
 *   await manager.save(cliente);
 * });
 *
 * // Y si te sirve el patrón "entidad + helpers", declaralo en tu proyecto
 * // con el contrato que necesites, en vez de heredarlo del framework.
 */
export abstract class Service<T> {
  protected abstract entity: T;
  /**
   * Obtiene la entidad
   */
  public getEntity = () => {
    return this.entity;
  };
  /**
   * Realiza commits o realiza operaciones finales.
   * @param manager Manager
   */
  abstract save(manager: EntityManager): Promise<void>;
  /**
   * Inyecta datos a las propiedades de la entidad.
   * Recomendado solo para cosas puntuales.
   * @param entity
   */
  public put = (entity: Partial<T>) => {
    this.entity = plainToClassFromExist(this.entity, entity);
  };
}
