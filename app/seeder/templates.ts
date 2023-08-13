import { faker as Faker } from '@faker-js/faker';
import { EntityTarget, ObjectLiteral } from 'typeorm';

export abstract class Seeder<T> {
  public abstract Entity: EntityTarget<ObjectLiteral>;
  public abstract count: number;
  public abstract define(faker: typeof Faker): T;
}
