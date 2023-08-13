import { ClassController } from '../../server/types';
import {
  BodyMetadata,
  HeaderMetadata,
  ParamMetadata,
  QueryMetadata,
  ReqMetadata,
  ResMetadata,
} from './arguments-metadata';
import { GuardMetadata } from './guard-metadata';
import { HttpMetadata } from './http-metadata';

/**
 * Metadata por los decoradores que tenga el método.
 */
export interface MethodMetaData {
  http: HttpMetadata;
  body?: BodyMetadata;
  query?: QueryMetadata;
  param?: ParamMetadata;
  res?: ResMetadata;
  req?: ReqMetadata;
  header?: HeaderMetadata;
  guard?: GuardMetadata;
}

export interface MetadataControllerMethod {
  name: string;
  metadata: MethodMetaData;
  func: (...args: any[]) => Promise<Record<string, any>>;
}

export interface ControllerMetadata {
  name: string;
  guard?: GuardMetadata;
  methods: MetadataControllerMethod[];
  Controller: ClassController;
}
