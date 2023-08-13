import { QueryMetadata } from '../interfaces/arguments-metadata';
import { PARAMTYPES_METADATA, QUERY } from '../keys';

export function Query(Schema?: new () => Record<string, any>) {
  return function (target: any, methodKey: string, index: number) {
    const t = Reflect.getMetadata(PARAMTYPES_METADATA, target, methodKey);
    const queryType = t[index].name;
    const metadata: QueryMetadata = {
      type: queryType,
      index,
      Schema,
    };
    Reflect.defineMetadata(QUERY, metadata, target, methodKey);
  };
}
