import { slot } from '../../../lib';

export interface PaymentMethod {
  id: string;
  label: string;
}

export const PaymentMethods = slot<PaymentMethod>('billing.payment-methods');
