import { HttpStatus } from '../interfaces/http-status';
import { Logger } from './logger';
import { ErrorIdentifier } from '../interfaces/type-error';

export class SchemaError<T = Record<string, string>> {
  identifier = ErrorIdentifier.SCHEMA;
  status = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(
    public message: string,
    public fieldsError: Partial<Record<keyof T, string>> = {},
  ) {}
}

export class CustomerError<T = Record<string, string>> {
  identifier = ErrorIdentifier.CUSTOMER;
  status = HttpStatus.NOT_ACCEPTABLE;

  constructor(
    public message: string,
    public fieldsError: Partial<Record<keyof T, string>> = {},
  ) {}
}

/**
 * @deprecated Lanza un `Error` nativo. Se eliminará en una versión mayor futura.
 *
 * `ErrorControl` ya mapea cualquier `Error` a un 500 conservando su mensaje y
 * dejándolo en el log, así que envolverlo no aporta nada.
 *
 * @example
 * throw new Error('No se pudo declarar el pago.');
 */
export class InternalError {
  identifier = ErrorIdentifier.INTERNAL;
  status = HttpStatus.INTERNAL_SERVER_ERROR;
  message = '';

  constructor(public error: Error) {
    this.message = error.message;
    Logger.error(error);
  }
}

export class NotFoundError {
  identifier = ErrorIdentifier.NOT_FOUND;
  status = HttpStatus.NOT_FOUND;

  constructor(public message: string) {}
}

export class AuthError {
  identifier = ErrorIdentifier.UNAUTHORIZED;
  status = HttpStatus.UNAUTHORIZED;

  constructor(public message: string) {}
}

export class CustomError {
  identifier = ErrorIdentifier.CUSTOM;
  constructor(
    public status: HttpStatus,
    public message: string,
    public response: any = null,
  ) {}
}
