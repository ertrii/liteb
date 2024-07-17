import { defineOrder } from '../defines/utils';
import { Api } from '../templates/api';
/**
 * El orden importa en las apis, evita conflictos reorganizando como se registran las apis.
 * El orden de la lista se basa por defecto en el orden descendente de los archivos de cada modulo.
 * @param number número de orden
 * @default 0 Por defecto todos tienen el valor 0
 */
export function Order(number: number) {
  return function (target: new () => Api) {
    defineOrder(target, {
      number,
    });
  };
}
