import { contract, slot } from '../../../lib';

export interface Greeter {
  hello(): string;
}
export const Greeter = contract<Greeter>('demo.greeter');

export interface Clock {
  now(): string;
}
export const Clock = contract<Clock>('demo.clock');

export interface Badge {
  id: string;
}
export const Badges = slot<Badge>('demo.badges');

/** Cuántas veces se CONSTRUYÓ cada implementación. */
export const built = { greeter: 0, clock: 0 };
