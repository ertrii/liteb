import {
  UnAuthorizedException,
  CustomerException,
  DependencyException,
  DevelopmentException,
  InternalException,
  NotFoundException,
  SchemaException,
} from '..';

/**
 * Evalúa si es un error tipo exception
 * @param error
 */
export default function isException(error: any) {
  return (
    error instanceof DevelopmentException ||
    error instanceof DependencyException ||
    error instanceof SchemaException ||
    error instanceof InternalException ||
    error instanceof CustomerException ||
    error instanceof NotFoundException ||
    error instanceof UnAuthorizedException
  );
}
