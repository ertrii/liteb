import { Endpoint, HttpPost, Module } from '../../../../lib';

@Module('auth')
@HttpPost('logout')
export class LogoutApi extends Endpoint {
  main() {
    this.request.session.userId = undefined;
    this.request.session.permissions = undefined;
    return { ok: true };
  }
}
