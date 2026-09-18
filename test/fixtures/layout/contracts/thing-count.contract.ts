import { contract } from '../../../../lib';

export interface ThingCount {
  total(): number;
}

export const ThingCount = contract<ThingCount>('layout.things');
