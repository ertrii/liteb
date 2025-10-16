import { plainToClassFromExist } from 'class-transformer';
import { QueryRunner } from 'typeorm';

export abstract class Service<T> {
  protected abstract entity: T;
  /**
   * Obtiene la entidad
   */
  public getEntity() {
    return this.entity;
  }
  /**
   * Realiza el commit de la entidad
   * @param t Transaction
   */
  abstract commit(queryRunner: QueryRunner): Promise<void>;
  /**
   * Inyecta datos a las propiedades de la entidad.
   * Recomendado solo para cosas puntuales.
   * @param entity
   */
  public put(entity: Partial<T>) {
    this.entity = plainToClassFromExist(this.entity, entity);
  }

  // public load = async (db: DataSource) => {
  //   db.getRepository<T>(this.entity)
  // };
}
