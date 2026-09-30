import type { Contract } from './container';
import type { EventToken } from './events';
import type { Slot } from './slots';

/**
 * What a token is for.
 *
 * It lives on the TOKEN and nowhere else. `@Provides` reads it off the token to
 * know whether it is registering the one implementation of a capability or one
 * contribution among many, and the container reads it again when it decides
 * between handing back an instance and handing back a list. Nothing repeats it:
 * a second place to say it would be a second place to say it wrong.
 */
export type TokenKind = 'contract' | 'slot' | 'event';

/**
 * Declares a **contract**: a capability one module publishes and others call,
 * with exactly one provider.
 *
 * @example
 * export interface BillingService {
 *   issueCharge(input: IssueChargeInput): Promise<Charge>;
 * }
 * export const BillingService = token<BillingService>(
 *   'billing.service',
 *   'contract',
 * );
 */
export function token<T>(id: string, kind: 'contract'): Contract<T>;

/**
 * Declares an **extension point**: a place one module opens and as many as are
 * installed may fill. `T` is the shape of ONE contribution.
 *
 * @example
 * export interface PaymentMethod {
 *   id: string;
 *   charge(amount: number): Promise<void>;
 * }
 * export const PaymentMethods = token<PaymentMethod>(
 *   'billing.payment-methods',
 *   'slot',
 * );
 */
export function token<T>(id: string, kind: 'slot'): Slot<T>;

/**
 * Declares an **event**: something that happened, with the shape of what it
 * carries. Any number of listeners, and no answer.
 *
 * @example
 * export interface ChargeCreated {
 *   chargeId: number;
 *   customerId: number;
 * }
 * export const ChargeCreated = token<ChargeCreated>(
 *   'billing.charge.created',
 *   'event',
 * );
 */
export function token<T>(id: string, kind: 'event'): EventToken<T>;

/**
 * The one way to declare what two modules share.
 *
 * A token carries its type at compile time and its identity at run time, so a
 * consumer imports *this* — never the implementation, which stays private to
 * the module that owns it. That asymmetry is what lets a module be swapped or
 * turned off without its consumers knowing.
 *
 * One function and not three because the three differ in exactly one thing:
 * how many may answer. Naming that in the call makes it the token's own
 * property, which is where every other part of the framework reads it from.
 *
 * The id is what appears in errors and in the startup log, so namespace it
 * under the module id (`billing.service`, not `service`): every installed
 * module shares one id space, and the namespace is what keeps two of them from
 * claiming the same one.
 */
export function token<T>(
  id: string,
  kind: TokenKind,
): Contract<T> | Slot<T> | EventToken<T> {
  // Runs once per token, at import time, so it costs nothing per request. Both
  // mistakes are silent otherwise: an empty id collides with the next empty
  // id, and an unknown kind produces a token that nothing ever resolves.
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(
      `token(): the id must be a non-empty string, and got ${JSON.stringify(
        id,
      )}. Namespace it under the module id, like "billing.service".`,
    );
  }

  if (kind !== 'contract' && kind !== 'slot' && kind !== 'event') {
    throw new Error(
      `token("${id}"): unknown kind ${JSON.stringify(kind)}. It is 'contract' (exactly one provider), 'slot' (as many as are installed) or 'event' (a notification with no answer).`,
    );
  }

  return { id, kind } as Contract<T> | Slot<T> | EventToken<T>;
}
