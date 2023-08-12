import { BodyMetadata } from '../metadata/interfaces/arguments-metadata';
import { SchemaException } from '../utilities/exceptions';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

export default async function bodyExpect(
  body: Record<string, any>,
  metadata?: BodyMetadata,
) {
  if (!metadata) return null;
  if (!metadata?.Schema) return null;

  const Schema = plainToClass(metadata.Schema, body);

  const errors = await validate(Schema);

  if (errors.length > 0) {
    const fieldsErrors: Record<string, string> = {};
    errors.forEach((error) => {
      const constraintArr = Object.values(error.constraints || {});
      if (constraintArr.length > 0) {
        fieldsErrors[error.property] = constraintArr[0];
      }
    });
    return new SchemaException('Datos no válidos', fieldsErrors);
  }

  return null;
}
