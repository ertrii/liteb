import { GuardMetadata } from '../interfaces/guard-metadata';
import { GUARDS_METADATA } from '../keys';

export function getMetadataUseGuard(
  controller: Record<string, any>,
  methodName?: string,
): GuardMetadata | undefined {
  return Reflect.getMetadata(GUARDS_METADATA, controller, methodName);
}
