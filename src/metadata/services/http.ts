import { HttpMetadata } from '../interfaces/http-metadata';
import { HTTP_METADATA } from '../keys';

export function getMetadataHttp(
  controller: Record<any, any>,
  methodName: string,
): HttpMetadata | undefined {
  return Reflect.getMetadata(HTTP_METADATA, controller, methodName);
}
