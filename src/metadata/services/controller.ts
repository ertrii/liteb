import { ClassController } from '../../server/types';
import { CONTROLLERS } from '../keys';

export function getMetadataController(Controller: ClassController): string {
  return Reflect.getMetadata(CONTROLLERS, Controller) || '';
}
