import { Contributes, Provider } from '../../../../lib';
import { Badge, Badges } from '../shared';

@Contributes(Badges)
export class LoudBadge extends Provider implements Badge {
  public readonly id = 'loud';
}
