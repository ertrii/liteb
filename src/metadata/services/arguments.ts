import {
  BodyMetadata,
  HeaderMetadata,
  ParamMetadata,
  QueryMetadata,
  ReqMetadata,
  ResMetadata,
} from '../interfaces/arguments-metadata';
import { BODY, HEADERS_METADATA, PARAM, QUERY, REQ, RES } from '../keys';

export function getMetadataQuery(
  controller: Record<string, any>,
  methodName: string,
): QueryMetadata | undefined {
  return Reflect.getMetadata(QUERY, controller, methodName);
}

export function getMetadataParam(
  controller: Record<string, any>,
  methodName: string,
): ParamMetadata | undefined {
  return Reflect.getMetadata(PARAM, controller, methodName);
}

export function getMetadataHeader(
  controller: Record<string, any>,
  methodName: string,
): HeaderMetadata | undefined {
  return Reflect.getMetadata(HEADERS_METADATA, controller, methodName);
}

export function getMetadataBody(
  controller: Record<string, any>,
  methodName: string,
): BodyMetadata | undefined {
  return Reflect.getMetadata(BODY, controller, methodName);
}

export function getMetadataReq(
  controller: Record<string, any>,
  methodName: string,
): ReqMetadata | undefined {
  return Reflect.getMetadata(REQ, controller, methodName);
}

export function getMetadataRes(
  controller: Record<string, any>,
  methodName: string,
): ResMetadata | undefined {
  return Reflect.getMetadata(RES, controller, methodName);
}
