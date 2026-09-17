import { Body, CustomerError, Endpoint, HttpPost, Module } from '../../../../lib';
import { LoginDto } from '../dto/login.dto';
import { User } from '../entities/user.entity';
import { PERMISSIONS_BY_ROLE } from '../roles';
import { verifyPassword } from '../services/password';

/**
 * The ONLY place that writes to the session. Everywhere else reads the actor
 * through `this.auth`, which is what lets the transport change (a token, an
 * API key) without touching any other endpoint.
 */
@Module('auth')
@HttpPost('login')
@Body(LoginDto)
export class LoginApi extends Endpoint<null, LoginDto> {
  private readonly users = this.db.getRepository(User);

  async main() {
    const user = await this.users.findOneBy({ username: this.body.username });

    // Same answer for "no such user" and "wrong password", on purpose.
    if (!user || !verifyPassword(this.body.password, user.password)) {
      throw new CustomerError('Wrong username or password.');
    }

    this.request.session.userId = user.id;
    // Resolved once, at login, so no request pays for a lookup. The trade-off
    // is explicit: a role change only takes effect on the next login.
    this.request.session.permissions = PERMISSIONS_BY_ROLE[user.role];

    return { id: user.id, fullName: user.fullName, role: user.role };
  }
}
