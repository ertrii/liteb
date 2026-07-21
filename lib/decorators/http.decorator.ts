import { Api } from '../templates/api';

export const GET = Symbol('__get__');
export const POST = Symbol('__post__');
export const PUT = Symbol('__put__');
export const DELETE = Symbol('__delete__');
export const PATCH = Symbol('__patch__');
export const QUERY_METHOD = Symbol('__query_method__');

export interface HTTPMetadata {
  path: string;
}

const httpDecorator = (KEY: symbol) => {
  return (path: string = '') => {
    return function (target: new () => Api<any, any, any>) {
      Reflect.defineMetadata(KEY, { path } as HTTPMetadata, target);
    };
  };
};

/** Registra la clase como endpoint HTTP GET. */
export const HttpGet = httpDecorator(GET);
/** Registra la clase como endpoint HTTP POST. */
export const HttpPost = httpDecorator(POST);
/** Registra la clase como endpoint HTTP PUT. */
export const HttpPut = httpDecorator(PUT);
/** Registra la clase como endpoint HTTP DELETE. */
export const HttpDelete = httpDecorator(DELETE);
/** Registra la clase como endpoint HTTP PATCH. */
export const HttpPatch = httpDecorator(PATCH);
/**
 * Registra la clase como endpoint HTTP QUERY: un método seguro e idempotente
 * que, a diferencia de GET, admite cuerpo. Pensado para búsquedas cuyos
 * criterios son demasiado grandes o complejos para el query-string; esos
 * criterios se declaran con `@Body`.
 *
 * Ojo: QUERY es un borrador de la IETF (`draft-ietf-httpbis-safe-method-w-body`),
 * no un estándar cerrado. Requiere un Node cuyo parser HTTP lo reconozca y
 * puede no estar soportado por proxies, CDNs o clientes intermedios.
 */
export const HttpQuery = httpDecorator(QUERY_METHOD);

/** @deprecated usa `HttpGet`. Se eliminará en una versión mayor futura. */
export const Get = HttpGet;
/** @deprecated usa `HttpPost`. Se eliminará en una versión mayor futura. */
export const Post = HttpPost;
/** @deprecated usa `HttpPut`. Se eliminará en una versión mayor futura. */
export const Put = HttpPut;
/** @deprecated usa `HttpDelete`. Se eliminará en una versión mayor futura. */
export const Delete = HttpDelete;
/** @deprecated usa `HttpPatch`. Se eliminará en una versión mayor futura. */
export const Patch = HttpPatch;
