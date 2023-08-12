import { ParamMetadata } from '../interfaces/arguments-metadata';
import { PARAM, PARAMTYPES_METADATA } from '../keys';

export function Param(name?: string) {
  return function (target: any, methodKey: string, index: number) {
    const t = Reflect.getMetadata(PARAMTYPES_METADATA, target, methodKey);
    const paramType = t[index].name;
    const metadata: ParamMetadata = {
      index,
      name,
      type: paramType,
    };
    Reflect.defineMetadata(PARAM, metadata, target, methodKey);
  };
}
