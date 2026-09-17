import {
  AuthError,
  CustomerError,
  CustomError,
  ForbiddenError,
  NotFoundError,
  SchemaError,
} from '../utilities/errors';

export type ErrorType =
  | Error
  | SchemaError
  | CustomerError
  | NotFoundError
  | AuthError
  | ForbiddenError
  | CustomError
  | Record<string, any>;

export enum ErrorIdentifier {
  SCHEMA = 'schema',
  CUSTOMER = 'customer',
  NOT_FOUND = 'not_found',
  INTERNAL = 'internal',
  UNAUTHORIZED = 'unauthorized',
  FORBIDDEN = 'forbidden',
  CUSTOM = 'custom',
}
