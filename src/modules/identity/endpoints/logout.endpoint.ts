import { Endpoint, HttpPost, Module } from '../../../../lib';

@Module('auth')
@HttpPost('logout')
export class LogoutEndpoint extends Endpoint {
  main() {
    this.request.session.userId = undefined;
    return { ok: true };
  }
}
