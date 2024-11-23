import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { Request, Response } from 'express';
import { SchemaError } from '../utilities/errors';

/**
 * Validate the schema using class-validator.
 * @param name
 * @param schema
 */
async function validateSchema(name: string, schema: Record<string, any>) {
  const errors = await validate(schema, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    const fieldsErrors: Record<string, string> = {};
    errors.forEach((error) => {
      const constraintArr = Object.values(error.constraints || {});
      if (constraintArr.length > 0) {
        fieldsErrors[error.property] = constraintArr[0];
      }
    });
    // return new SchemaException('Datos no válidos', fieldsErrors);
    return new SchemaError(`${name}: Datos no válidos`, fieldsErrors);
  }

  return null;
}

/**
 * Inspecciona el body por la validación
 * @param Schema
 * @returns
 */
export function bodyExpect<T extends Record<string, any>>(Schema: new () => T) {
  return async function (
    req: Request<any, any, T>,
    res: Response,
    next: () => void,
  ) {
    const schema = plainToClass(Schema, req.body);
    const result = await validateSchema('Body', schema);

    // Si validación paso correctamente
    if (!result) {
      next();
      return;
    }
    result.path = req.originalUrl;
    // si no pasó la validación entregará un objeto de error.
    res.status(result.status).json(result);
  };
}

/**
 * Inspecciona el query por la validación
 * @param Schema
 * @returns
 */
export function queryExpect<T extends Record<string, any>>(
  Schema: new () => T,
) {
  return async function (
    req: Request<any, any, any, T>,
    res: Response,
    next: () => void,
  ) {
    const schema = plainToClass(Schema, req.query);
    const result = await validateSchema('Query', schema);

    // Si validación paso correctamente
    if (!result) {
      next();
      return;
    }
    result.path = req.originalUrl;
    // si no pasó la validación entregará un objeto de error.
    res.status(result.status).json(result);
  };
}

/**
 * Inspecciona el params por la validación
 * @param Schema
 * @returns
 */
export function paramsExpect<T extends Record<string, any>>(
  Schema: new () => T,
) {
  return async function (req: Request<T>, res: Response, next: () => void) {
    const schema = plainToClass(Schema, req.params);
    const result = await validateSchema('Params', schema);

    // Si validación paso correctamente
    if (!result) {
      next();
      return;
    }
    result.path = req.originalUrl;
    // si no pasó la validación entregará un objeto de error.
    res.status(result.status).json(result);
  };
}
