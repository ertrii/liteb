import { Contributes, Provider } from '../../../../../lib';
import { PaymentMethod, PaymentMethods } from '../../shared';

@Contributes(PaymentMethods)
export class BankMethod extends Provider implements PaymentMethod {
  public readonly id = 'bank';
  public readonly label = 'Transferencia';
}
