import { ReqMetadata } from '../interfaces/arguments-metadata';
import { REQ } from '../keys';

export function Req() {
  return function (target: any, methodKey: string, index: number) {
    const metadata: ReqMetadata = { index };
    Reflect.defineMetadata(REQ, metadata, target, methodKey);
  };
}
