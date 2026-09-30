import { Provides, Provider } from '../../../../lib';
import { Badge, Badges } from '../shared';

@Provides(Badges)
export class LoudBadge extends Provider implements Badge {
  public readonly id = 'loud';
}
