import { CONTROLLERS } from '../keys';

export function Controller(tagName: string) {
  return function <T extends { new (...args: any[]): Record<any, any> }>(
    className: T,
  ) {
    Reflect.defineMetadata(CONTROLLERS, tagName, className);
    return className;
  };
}
