import { Endpoint, HttpPost, Module, Priority } from '../../../../../lib';

@Priority(2)
@HttpPost('cargos')
@Module('facturacion')
export default class CreateCharge extends Endpoint {
  main() {
    return { created: true };
  }
}
