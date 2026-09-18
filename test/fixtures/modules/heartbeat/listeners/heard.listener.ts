import { Listener, On } from '../../../../../lib';
import { Beat, heard } from '../shared';

@On(Beat)
export default class HeardListener extends Listener<{ n: number }> {
  async on(): Promise<void> {
    heard.count += 1;
  }
}
