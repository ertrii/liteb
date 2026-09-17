import { Listener, On } from '../../../../lib';
import { Registrado, visto } from '../shared';

@On(Registrado)
export class AnotarListener extends Listener<Registrado> {
  on(payload: Registrado) {
    visto.ids.push(payload.id);
  }
}
