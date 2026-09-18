import { Schedule, Task } from '../../../../lib';

@Schedule('0 3 * * *')
export default class Nightly extends Task {
  public start(): void {
    // nada: la prueba sólo mira que lo encuentre
  }
}
