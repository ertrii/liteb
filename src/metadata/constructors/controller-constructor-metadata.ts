import { ClassController } from '../../server/types';
import {
  ControllerMetadata,
  MetadataControllerMethod,
} from '../interfaces/controller-metadata';
import { getMetadataUseGuard } from '../services/guard';
import {
  getMetadataBody,
  getMetadataHeader,
  getMetadataParam,
  getMetadataQuery,
  getMetadataReq,
  getMetadataRes,
} from '../services/arguments';
import { getMetadataHttp } from '../services/http';
import { getMetadataController } from '../services/controller';

export default function controllerConstructorMetadata(
  Controller: ClassController,
): ControllerMetadata {
  /**
   * Nombre del controlador
   */
  const name = getMetadataController(Controller);
  const guard = getMetadataUseGuard(Controller);
  const controller = new Controller();
  const methods: MetadataControllerMethod[] = [];
  const propertyDescriptors = Object.getOwnPropertyDescriptors(
    Controller.prototype,
  );
  Object.entries(propertyDescriptors).forEach(([key, descriptor]) => {
    if (key === 'constructor') return;
    if (typeof descriptor.value !== 'function') return;
    const http = getMetadataHttp(controller, key);
    if (!http) return;

    methods.push({
      name: key,
      func: descriptor.value.bind(controller),
      metadata: {
        http,
        body: getMetadataBody(controller, key),
        query: getMetadataQuery(controller, key),
        param: getMetadataParam(controller, key),
        res: getMetadataRes(controller, key),
        req: getMetadataReq(controller, key),
        header: getMetadataHeader(controller, key),
        guard: getMetadataUseGuard(controller, key),
      },
    });
  });

  return {
    name,
    guard,
    methods,
    Controller,
  };
}
