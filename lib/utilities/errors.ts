import { HttpStatus } from '../interfaces/http-status';
import { Logger } from '../services/logger';
import { TypeError } from '../interfaces/type-error';
import { ErrorBase } from '../templates/error-base';

export class SchemaError<T = Record<string, string>> extends ErrorBase {
  type = TypeError.SCHEMA;
  status = HttpStatus.UNPROCESSABLE_ENTITY;
  response = null;

  constructor(message: string, fieldsError: Partial<Record<keyof T, string>>) {
    super(message, fieldsError);
  }
}

export class CustomerError<T = Record<string, string>> extends ErrorBase {
  type = TypeError.CUSTOMER;
  response = null;
  status = HttpStatus.NOT_ACCEPTABLE;

  constructor(message: string, fieldsError: Partial<Record<keyof T, string>>) {
    super(message, fieldsError);
  }
}

export class InternalError extends ErrorBase {
  type = TypeError.INTERNAL;
  status = HttpStatus.INTERNAL_SERVER_ERROR;
  fieldsError: Record<string, string> = {};
  response: any = null;
  message = '';

  constructor(error: Error) {
    super('Error Internal');
    Logger.error(error);
  }
}

export class NotFoundError extends ErrorBase {
  type = TypeError.NOT_FOUND;
  status = HttpStatus.NOT_FOUND;
  fieldsError: Record<string, string> = {};
  response: any = null;

  constructor(message: string) {
    super(message);
  }
}

export class AuthError extends ErrorBase {
  type: TypeError.UNAUTHORIZED;
  status: HttpStatus.UNAUTHORIZED;

  constructor(message: string) {
    super(message);
  }
}

/**
 * Verifica si es un error gestionado por nosotros.
 * @param error
 */
export function isManagedError(
  error: any,
): error is SchemaError | CustomerError | InternalError | NotFoundError {
  if (error instanceof SchemaError) return true;
  if (error instanceof CustomerError) return true;
  if (error instanceof InternalError) return true;
  if (error instanceof NotFoundError) return true;
  return false;
}

export class HttpException {
  constructor(
    public message: string,
    public status: HttpStatus,
  ) {}
}
