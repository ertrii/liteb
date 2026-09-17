import {
  AuthError,
  CustomerError,
  CustomError,
  NotFoundError,
  SchemaError,
} from '../utilities/errors';

export type ErrorType =
  | Error
  | SchemaError
  | CustomerError
  | NotFoundError
  | AuthError
  | CustomError
  | Record<string, any>;

export enum ErrorIdentifier {
  SCHEMA = 'schema',
  CUSTOMER = 'customer',
  NOT_FOUND = 'not_found',
  INTERNAL = 'internal',
  UNAUTHORIZED = 'unauthorized',
  CUSTOM = 'custom',
}
