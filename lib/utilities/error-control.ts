import {
  SchemaError,
  CustomerError,
  InternalError,
  NotFoundError,
  AuthError,
  CustomError,
} from './errors';
import { ErrorIdentifier, ErrorType } from '../interfaces/type-error';
import { HttpStatus } from '../interfaces/http-status';
import { Logger } from './logger';

export default class ErrorControl {
  private status = HttpStatus.INTERNAL_SERVER_ERROR;
  private isObject = false;
  private response: Record<string, any> | null = null;
  private message =
    'The server has understood the request, but refuses to authorize it.';
  private errorFields: Record<string, any> = {};
  private identifier = ErrorIdentifier.INTERNAL;

  private identify = () => {
    if (this.error instanceof Error) {
      Logger.error(this.error);
      this.message = this.error.message;
    } else if (
      this.error instanceof SchemaError ||
      this.error instanceof CustomerError
    ) {
      this.status = this.error.status;
      this.message = this.error.message;
      this.errorFields = this.error.fieldsError;
      this.identifier = this.error.identifier;
    } else if (this.error instanceof InternalError) {
      Logger.error(this.error);
      this.status = this.error.status;
      this.message = this.error.message;
      this.identifier = this.error.identifier;
    } else if (this.error instanceof NotFoundError) {
      this.status = this.error.status;
      this.message = this.error.message;
      this.identifier = this.error.identifier;
    } else if (this.error instanceof AuthError) {
      Logger.warn(this.error);
      this.status = this.error.status;
      this.message = this.error.message;
      this.identifier = this.error.identifier;
    } else if (this.error instanceof CustomError) {
      this.status = this.error.status;
      this.message = this.error.message;
      this.identifier = this.error.identifier;
      this.response = this.error.response;
    } else if (typeof this.error === 'object' && this.error !== null) {
      this.isObject = true;
      this.status = HttpStatus.FORBIDDEN;
      this.message = this.error?.message ?? this.message;
      this.response = this.error;
    }
  };

  constructor(private error: ErrorType | Record<string, any>) {
    this.identify();
  }

  public getStatus = () => this.status;

  public toJson = () => {
    if (this.isObject) {
      return this.response;
    }
    return {
      message: this.message,
      response: this.response,
      errorFields: this.errorFields,
      identifier: this.identifier,
    };
  };
}
