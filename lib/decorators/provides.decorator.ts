import type { Contract } from '../modules/container';
import type { Slot } from '../modules/slots';
import { Provider } from '../templates/provider';

/**
 * Where a {@link Provider} plugs in.
 *
 * One symbol for both decorators because it is one question — which token is
 * this class the implementation of — and the token itself says whether it is a
 * contract (exactly one provider) or a slot (as many as are installed).
 */
export const PROVIDES = Symbol('__provides__');

export interface ProvidesMetadata {
  target: Contract<unknown> | Slot<unknown>;
}

const define = (
  target: Contract<unknown> | Slot<unknown>,
  decorator: 'Provides' | 'Contributes',
  expected: 'contract' | 'slot',
) => {
  if (!target || target.kind !== expected) {
    const got = target?.kind ?? 'something else';
    throw new Error(
      `@${decorator}() takes a ${expected}, and got a ${got}. Contracts have one provider and are declared with contract(); extension points take many and are declared with slot().`,
    );
  }

  return function (ProviderClass: new () => Provider) {
    Reflect.defineMetadata(
      PROVIDES,
      { target } as ProvidesMetadata,
      ProviderClass,
    );
  };
};

/**
 * Declares that this class answers a contract. Exactly one module may.
 *
 * @example
 * \@Provides(UserDirectory)
 * export class UserDirectoryProvider extends Provider implements UserDirectory {}
 */
export function Provides<T>(token: Contract<T>) {
  return define(token as Contract<unknown>, 'Provides', 'contract');
}

/**
 * Declares that this class fills an extension point another module opened.
 *
 * The module that OPENS the slot is the one extensions depend on: it knows
 * nothing about who fills it, and a contributor imports its token.
 *
 * @example
 * \@Contributes(ProductBadges)
 * export class LowStockBadge extends Provider implements ProductBadge {}
 */
export function Contributes<T>(target: Slot<T>) {
  return define(target as Slot<unknown>, 'Contributes', 'slot');
}
