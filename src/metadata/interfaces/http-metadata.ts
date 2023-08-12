import { RequestMethod } from '../../enums/request-method.enum';

/**
 * @decorator Get(), Post(), Put(), Delete(), Patch()
 */
export interface HttpMetadata {
  method: RequestMethod;
  path: string;
}
