import {
  defineBody,
  defineParams,
  defineQuery,
} from '../defines/request.define';
import { Api } from '../templates/api';

export function Params(Schema: new () => Record<string, any>) {
  return function (target: new () => Api) {
    defineParams(target, {
      Schema,
    });
  };
}

export function Body(Schema: new () => Record<string, any>) {
  return function (target: new () => Api) {
    defineBody(target, { Schema });
  };
}

export function Query(Schema: new () => Record<string, any>) {
  return function (target: new () => Api) {
    defineQuery(target, { Schema });
  };
}
