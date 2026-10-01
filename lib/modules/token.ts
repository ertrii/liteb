import type { Contract } from './container';
import type { Slot } from './slots';
import type { ScheduleToken } from './schedules';

/**
 * What a token is for.
 *
 * It lives on the TOKEN and nowhere else. Each decorator reads it off the token
 * to refuse the one that is not its own, and the container reads it again when
 * it decides between handing back an instance and handing back a list. Nothing
 * repeats it: a second place to say it would be a second place to say it wrong.
 *
 * Two of them are about two modules meeting. `'schedule'` is the odd one: it
 * names a clock the application turns on and off, and what it buys is that a
 * schedule can be addressed without importing the `Routine` that runs on it.
 */
export type TokenKind = 'contract' | 'slot' | 'schedule';

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
 * Declares a **task**: a schedule the application can start and stop.
 *
 * It carries no type, because nothing is handed over — what it identifies is a
 * clock. The class that runs on it names it in its `@Cron`.
 *
 * @example
 * export const NightlyBackup = token('system.nightly-backup', 'schedule');
 */
export function token(id: string, kind: 'schedule'): ScheduleToken;

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
): Contract<T> | Slot<T> | ScheduleToken {
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

  if (kind !== 'contract' && kind !== 'slot' && kind !== 'schedule') {
    throw new Error(
      `token("${id}"): unknown kind ${JSON.stringify(kind)}. It is 'contract' (exactly one provider), 'slot' (as many as are installed, read with all() or announced to with notify()) or 'schedule' (a clock that can be started and stopped).`,
    );
  }

  return { id, kind } as Contract<T> | Slot<T> | ScheduleToken;
}
