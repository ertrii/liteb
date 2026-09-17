/**
 * An open extension point: a place one module defines and MANY may fill.
 *
 * It is the third way modules meet, and the three are not interchangeable:
 *
 * - a **contract** has exactly one provider — "give me the billing service";
 * - an **event** has any number of listeners and no answer — "this happened";
 * - a **slot** has any number of contributions that the definer READS —
 *   "whoever can take a payment, step forward".
 *
 * Slots are what a third-party extension plugs into: `billing` does not know
 * the payment methods that will exist, so it defines the shape and enumerates
 * whatever is installed.
 *
 * @example
 * export interface PaymentMethod {
 *   id: string;
 *   label: string;
 *   charge(amount: number): Promise<void>;
 * }
 * export const PaymentMethods = slot<PaymentMethod>('billing.payment-methods');
 */
export interface Slot<T> {
  readonly id: string;
  /** Tells a slot from a contract, so neither can be passed where the other goes. */
  readonly kind: 'slot';
  /** Phantom field: carries T so `all()` returns the right type. Never set. */
  readonly __type?: T;
}

/** Declares an extension point. The id is what appears in logs and errors. */
export function slot<T>(id: string): Slot<T> {
  return { id, kind: 'slot' };
}
