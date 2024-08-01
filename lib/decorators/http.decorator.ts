import {
  defineDelete,
  defineGet,
  definePatch,
  definePost,
  definePut,
} from '../defines/http.define';
import { Api } from '../templates/api';

export function Get(path: string = '') {
  return function (target: new () => Api) {
    defineGet(target, {
      path,
    });
  };
}

export function Post(path: string = '') {
  return function (target: new () => Api) {
    definePost(target, { path });
  };
}

export function Put(path: string = '') {
  return function (target: new () => Api) {
    definePut(target, { path });
  };
}

export function Delete(path: string = '') {
  return function (target: new () => Api) {
    defineDelete(target, { path });
  };
}

export function Patch(path: string = '') {
  return function (target: new () => Api) {
    definePatch(target, { path });
  };
}
