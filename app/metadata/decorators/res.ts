import { ResMetadata } from '../interfaces/arguments-metadata';
import { RES } from '../keys';

export function Res() {
  return function (target: any, methodKey: string, index: number) {
    const metadata: ResMetadata = { index };
    Reflect.defineMetadata(RES, metadata, target, methodKey);
  };
}
