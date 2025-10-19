import session from 'express-session';
import { ErrorType } from './type-error';

export type SessionDataExtends<T> = session.Session &
  Partial<session.SessionData & T>;

export type ErrorResponse = void | ErrorType;
