import type { EventToken } from '../modules/events';
import type { Listener } from '../templates/listener';

export const ON = Symbol('__on__');

export interface OnMetadata {
  token: EventToken<unknown>;
}

/**
 * Subscribes a {@link Listener} to an event.
 *
 * The generic ties the two together: a listener that DECLARES its payload
 * parameter with a type the token does not match fails to compile, so a renamed
 * field cannot quietly reach a handler that still expects the old one. (A
 * listener that ignores the payload — `on() {}` — compiles against any token,
 * which is harmless: it cannot misread a field it never touches.)
 *
 * @example
 * @On(ChargeCreated)
 * export class NotifyOnCharge extends Listener<ChargeCreated> { ... }
 */
export function On<T>(token: EventToken<T>) {
  return function (target: new () => Listener<T>) {
    Reflect.defineMetadata(ON, { token } as OnMetadata, target);
  };
}
