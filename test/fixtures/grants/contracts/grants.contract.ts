import { contract } from '../../../../lib';

export interface Grants {
  forUser(userId: number): Promise<string[] | null>;
}

export const Grants = contract<Grants>('grants.policy');
