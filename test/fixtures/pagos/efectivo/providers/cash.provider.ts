import { Contributes, Provider } from '../../../../../lib';
import { PaymentMethod, PaymentMethods } from '../../shared';

@Contributes(PaymentMethods)
export class CashMethod extends Provider implements PaymentMethod {
  public readonly id = 'cash';
  public readonly label = 'Efectivo';
}
