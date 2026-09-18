import { Cron, Routine } from '../../../../../lib';
import { Beat, beats } from '../shared';

@Cron('* * * * * *')
export default class BeatRoutine extends Routine {
  async start() {
    beats.count += 1;
    beats.sawDb = !!this.db;
    beats.sawContainer = !!this.container;
    await this.emit(Beat, { n: beats.count });
  }
}
