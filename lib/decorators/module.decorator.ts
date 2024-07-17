import { defineModule } from '../defines/module.define';
import { Api } from '../templates/api';

export function Module(basePath: string) {
  return function (target: new () => Api) {
    defineModule(target, {
      basePath,
    });
  };
}
