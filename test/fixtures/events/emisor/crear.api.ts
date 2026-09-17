import { Endpoint, HttpPost, Module } from '../../../../lib';
import { Registrado } from '../shared';

@Module('demo')
@HttpPost('crear')
export class CrearApi extends Endpoint {
  async main() {
    await this.emit(Registrado, { id: 7 });
    return { ok: true };
  }
}
