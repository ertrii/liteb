import {
  AuthError,
  CustomerError,
  CustomError,
  InternalError,
  NotFoundError,
  SchemaError,
} from '../utilities/errors';

export type ErrorType =
  | Error
  | SchemaError
  | CustomerError
  | InternalError
  | NotFoundError
  | AuthError
  | CustomError;

export enum ErrorIdentifier {
  SCHEMA = 'schema',
  CUSTOMER = 'customer',
  CLIENT = 'client',
  NOT_FOUND = 'not_found',
  DEPENDENCY = 'dependency',
  INTERNAL = 'internal',
  UNAUTHORIZED = 'unauthorized',
  CUSTOM = 'custom',
}
