import { Cron, Routine } from '../../../../lib';

@Cron('0 3 * * *')
export default class Nightly extends Routine {
  public start(): void {
    // nada: la prueba sólo mira que lo encuentre
  }
}
