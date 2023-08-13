import DBSource from './db-source';
import { EntityTarget, ObjectLiteral } from 'typeorm';

export function getRepository<T = ObjectLiteral>(target: EntityTarget<T>) {
  return DBSource.DataSource.getRepository<T>(target);
}
