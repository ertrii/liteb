import { describe, expect, it } from '@jest/globals';
import ErrorControl from '../lib/utilities/error-control';
import {
  AuthError,
  CustomError,
  CustomerError,
  NotFoundError,
  SchemaError,
} from '../lib/utilities/errors';
import { HttpStatus } from '../lib/interfaces/http-status';
import { ErrorIdentifier } from '../lib/interfaces/type-error';

describe('ErrorControl', () => {
  it('mapea NotFoundError a 404', () => {
    const control = new ErrorControl(new NotFoundError('no existe'));

    expect(control.getStatus()).toBe(HttpStatus.NOT_FOUND);
    // La forma es la de RFC 9457: `title` es estable y describe la CLASE de
    // problema, `detail` es lo que pasó esta vez, y `code` es contra lo que un
    // cliente ramifica.
    expect(control.toJson()).toEqual({
      type: '/problems/not-found',
      title: 'Not found',
      status: HttpStatus.NOT_FOUND,
      detail: 'no existe',
      code: ErrorIdentifier.NOT_FOUND,
      errors: {},
    });
  });

  it('un fallo de validación dice DE QUÉ CAMPO, que es para lo que existe', () => {
    // Sin esto un formulario sólo puede poner el mensaje en un cartel: no sabe
    // debajo de qué input va.
    const control = new ErrorControl(
      new SchemaError('datos inválidos', {
        email: 'no es un correo',
        edad: 'debe ser un número',
      }),
    );

    expect(control.toJson().errors).toEqual({
      email: 'no es un correo',
      edad: 'debe ser un número',
    });
  });

  it('mapea AuthError a 401', () => {
    const control = new ErrorControl(new AuthError('sin permiso'));

    expect(control.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(control.toJson()).toMatchObject({
      code: ErrorIdentifier.UNAUTHORIZED,
    });
  });

  it('mapea SchemaError a 422 conservando los campos con error', () => {
    const control = new ErrorControl(
      new SchemaError('datos inválidos', { name: 'requerido' }),
    );

    expect(control.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(control.toJson()).toMatchObject({
      detail: 'datos inválidos',
      code: ErrorIdentifier.SCHEMA,
      errors: { name: 'requerido' },
    });
  });

  it('mapea CustomerError a 406', () => {
    const control = new ErrorControl(new CustomerError('saldo insuficiente'));

    expect(control.getStatus()).toBe(HttpStatus.NOT_ACCEPTABLE);
    expect(control.toJson()).toMatchObject({
      code: ErrorIdentifier.CUSTOMER,
    });
  });

  it('respeta el status y la respuesta de CustomError', () => {
    const control = new ErrorControl(
      new CustomError(HttpStatus.CONFLICT, 'duplicado', { id: 7 }),
    );

    expect(control.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(control.toJson()).toMatchObject({
      detail: 'duplicado',
      code: ErrorIdentifier.CUSTOM,
      response: { id: 7 },
    });
  });

  it('un Error nativo cae en 500 conservando su mensaje', () => {
    const control = new ErrorControl(new Error('algo explotó'));

    expect(control.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(control.toJson()).toMatchObject({
      detail: 'algo explotó',
      code: ErrorIdentifier.INTERNAL,
    });
  });

  it('un error desconocido usa el mensaje por defecto, coherente con el 500', () => {
    // Throwing a primitive matches no known branch.
    const control = new ErrorControl('boom' as unknown as Error);

    expect(control.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(control.toJson()).toMatchObject({
      detail: 'Internal server error.',
    });
  });
});
