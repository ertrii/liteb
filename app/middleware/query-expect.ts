import { QueryMetadata } from '../metadata/interfaces/arguments-metadata';
import { DevelopmentException } from '../utilities/exceptions';
import logger from '../utilities/logger';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

export default async function queryExpect(
  query: Record<string, any>,
  metadata?: QueryMetadata,
) {
  if (!metadata) return null;
  if (!metadata?.Schema) return null;

  const Schema = plainToClass(metadata.Schema, query);

  const errors = await validate(Schema);

  if (errors.length > 0) {
    const fieldsErrors: Record<string, string> = {};
    errors.forEach((error) => {
      logger.error(error);
      const constraintArr = Object.values(error.constraints || {});
      if (constraintArr.length > 0) {
        fieldsErrors[error.property] = constraintArr[0];
      }
    });
    return new DevelopmentException('Query Error', fieldsErrors);
  }

  return null;
}
