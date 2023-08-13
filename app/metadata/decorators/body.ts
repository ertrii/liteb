import { BodyMetadata } from '../interfaces/arguments-metadata';
import { BODY, PARAMTYPES_METADATA } from '../keys';

export function Body(Schema?: new () => Record<string, any>) {
  return function (target: any, methodKey: string, index: number) {
    const t = Reflect.getMetadata(PARAMTYPES_METADATA, target, methodKey);
    const bodyType = t[index].name;
    const metadata: BodyMetadata = {
      type: bodyType,
      index,
      Schema,
    };
    Reflect.defineMetadata(BODY, metadata, target, methodKey);
  };
}
