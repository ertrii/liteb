import { Type } from '../../interfaces/type';
import { Guard } from './guard-arguments';

export type TypeGuard = Type<Guard>;

export interface GuardMetadata {
  Guard: TypeGuard;
}
