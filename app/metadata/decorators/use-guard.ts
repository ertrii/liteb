import { GUARDS_METADATA } from '../keys';
import { GuardMetadata, TypeGuard } from '../interfaces/guard-metadata';

/**
 * Agrega middleware
 */
export function UseGuard(Guard: TypeGuard): MethodDecorator & ClassDecorator {
  return function (
    target: any,
    key?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>,
  ): any {
    const metadata: GuardMetadata = {
      Guard,
    };

    if (descriptor) {
      Reflect.defineMetadata(
        GUARDS_METADATA,
        metadata,
        target,
        // descriptor.value,
        key,
      );
      return descriptor;
    } else {
      Reflect.defineMetadata(GUARDS_METADATA, metadata, target);
      return target;
    }
  };
}
