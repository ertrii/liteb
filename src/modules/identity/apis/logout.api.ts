import { Endpoint, HttpPost, Module } from '../../../../lib';

@Module('auth')
@HttpPost('logout')
export class LogoutApi extends Endpoint {
  main() {
    this.request.session.userId = undefined;
    return { ok: true };
  }
}
