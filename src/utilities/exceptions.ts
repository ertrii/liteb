import logger from './logger';
import { HttpStatus } from '../enums/http-status';
import { TypeException } from '../enums/type-exception';

export class SchemaException<T = Record<string, string>> {
  type = TypeException.SCHEMA;
  response = null;
  status = HttpStatus.UNPROCESSABLE_ENTITY;

  constructor(
    public message: string,
    public fieldsError: Partial<Record<keyof T, string>>,
  ) {}
}

export class CustomerException<T = Record<string, string>> {
  type = TypeException.CUSTOMER;
  response = null;
  status = HttpStatus.NOT_ACCEPTABLE;

  constructor(
    public message: string,
    public fieldsError: Partial<Record<keyof T, string>>,
  ) {}
}

export class DevelopmentException<T = Record<string, string>> {
  type = TypeException.DEVELOPMENT;
  status = HttpStatus.BAD_REQUEST;
  response: any = null;

  constructor(
    public message: string,
    public fieldsError: Partial<Record<keyof T, string>> = {},
  ) {}
}

export class NotFoundException {
  type = TypeException.NOT_FOUND;
  status = HttpStatus.NOT_FOUND;
  fieldsError: Record<string, string> = {};
  response: any = null;

  constructor(public message: string) {}
}

export class UnAuthorizedException {
  type = TypeException.UNAUTHORIZED;
  status = HttpStatus.UNAUTHORIZED;
  fieldsError: Record<string, string> = {};
  response: any = null;

  constructor(public message: string) {}
}

export class ForbiddenException {
  type = TypeException.UNAUTHORIZED;
  status = HttpStatus.FORBIDDEN;
  fieldsError: Record<string, string> = {};
  response: any = null;

  constructor(public message: string = 'Forbidden resource') {}
}

export class DependencyException {
  type = TypeException.DEPENDENCY;
  status = HttpStatus.FAILED_DEPENDENCY;
  fieldsError: Record<string, string> = {};

  constructor(
    public message: string,
    public response: any = null,
  ) {}
}

export class InternalException {
  type = TypeException.INTERNAL;
  status = HttpStatus.INTERNAL_SERVER_ERROR;
  fieldsError: Record<string, string> = {};
  response: any = null;
  message = '';

  constructor(error: Error | string) {
    if (typeof error === 'string') {
      this.message = error;
    } else {
      this.message = error.message;
    }
    logger.error(error);
  }
}
