import { HTTP_METADATA } from '../keys';
import { RequestMethod } from '../../enums/request-method.enum';
import { HttpMetadata } from '../interfaces/http-metadata';

function createDecorator(path: string, method: RequestMethod) {
  return function (
    target: any,
    propertyKey: string,
    descriptor?: TypedPropertyDescriptor<any>,
  ): any {
    const metadata: HttpMetadata = { path, method };
    Reflect.defineMetadata(HTTP_METADATA, metadata, target, propertyKey);
    return descriptor;
  };
}

export function Get(path = '') {
  return createDecorator(path, RequestMethod.GET);
}
export function Post(path = '') {
  return createDecorator(path, RequestMethod.POST);
}
export function Put(path = '') {
  return createDecorator(path, RequestMethod.PUT);
}
export function Delete(path = '') {
  return createDecorator(path, RequestMethod.DELETE);
}
export function Patch(path = '') {
  return createDecorator(path, RequestMethod.PATCH);
}
