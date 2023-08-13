import { HeaderMetadata } from '../interfaces/arguments-metadata';
import { HEADERS_METADATA, PARAMTYPES_METADATA } from '../keys';

export function Header() {
  return function (target: any, methodKey: string, index: number) {
    const t = Reflect.getMetadata(PARAMTYPES_METADATA, target, methodKey);
    const paramType = t[index].name;
    const metadata: HeaderMetadata = {
      index,
      type: paramType,
    };
    Reflect.defineMetadata(HEADERS_METADATA, metadata, target, methodKey);
  };
}
