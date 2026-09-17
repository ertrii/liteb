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

/**
 * The caller is known but not allowed. Maps to 403.
 *
 * Kept apart from {@link AuthError} because the two say opposite things to a
 * client: 401 means "authenticate and try again", 403 means "don't bother".
 */
export class ForbiddenError {
  identifier = ErrorIdentifier.FORBIDDEN;
  status = HttpStatus.FORBIDDEN;

  constructor(
    public message: string,
    /** Permission keys the actor was missing, when the check knows them. */
    public missing: string[] = [],
  ) {}
}

export class CustomError {
  identifier = ErrorIdentifier.CUSTOM;
  constructor(
    public status: HttpStatus,
    public message: string,
    public response: any = null,
  ) {}
}
