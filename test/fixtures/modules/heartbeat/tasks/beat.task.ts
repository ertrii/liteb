import { Schedule, Task } from '../../../../../lib';

/** Contador observable: el test espera a que la tarea corra de verdad. */
export const beats = { count: 0, sawDb: false, sawContainer: false };

@Schedule('* * * * * *')
export default class Beat extends Task {
  start() {
    beats.count += 1;
    beats.sawDb = !!this.db;
    beats.sawContainer = !!this.container;
  }
}
