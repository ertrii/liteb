import type { Contract } from '../modules/container';
import type { Slot } from '../modules/slots';
import { Provider } from '../templates/provider';

/**
 * Where a {@link Provider} plugs in: the contract it answers, or the extension
 * point it fills.
 */
export const PROVIDES = Symbol('__provides__');

export interface ProvidesMetadata {
  target: Contract<unknown> | Slot<unknown>;
}

/**
 * Declares what this class is the implementation of.
 *
 * One decorator for a contract and for an extension point, because the token
 * already says which it is — a contract has exactly one provider, a slot takes
 * as many as are installed — and everything downstream reads that off the
 * token: the container decides between an instance and a list by looking at
 * `kind`, never at how the class was declared. A second decorator would be a
 * second place to state the same thing, and two places that can disagree is
 * the only reason a "you mixed them up" error would need to exist.
 *
 * @example
 * // the one implementation of a contract
 * \@Provides(UserDirectory)
 * export class UserDirectoryProvider
 *   extends Provider
 *   implements UserDirectory {}
 *
 * @example
 * // one contribution among however many are installed
 * \@Provides(ProductBadges)
 * export class LowStockBadge extends Provider implements ProductBadge {}
 */
export function Provides<T>(target: Contract<T> | Slot<T>) {
  const kind = (target as { kind?: string } | null | undefined)?.kind;

  if (kind === 'event') {
    throw new Error(
      `@Provides() takes a contract or an extension point, and got an event. Nothing provides an event: a module announces it with this.emit(), and a Listener reacts to it with @On().`,
    );
  }

  if (kind !== 'contract' && kind !== 'slot') {
    throw new Error(
      `@Provides() takes a contract or an extension point, and got something that is not a token. Declare one with token(id, 'contract') — exactly one provider — or token(id, 'slot') — as many as are installed.`,
    );
  }

  return function (ProviderClass: new () => Provider) {
    Reflect.defineMetadata(
      PROVIDES,
      { target } as ProvidesMetadata,
      ProviderClass,
    );
  };
}
