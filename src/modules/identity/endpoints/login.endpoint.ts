import { eq } from 'drizzle-orm';
import {
  Body,
  CustomerError,
  Endpoint,
  HttpPost,
  Group,
} from '../../../../lib';
import { LoginDto } from '../dto/login.dto';
import { users } from '../tables/user.table';
import { verifyPassword } from '../services/password';

/**
 * The ONLY place that writes to the session. Everywhere else reads the actor
 * through `this.auth`, which is what lets the transport change (a token, an
 * API key) without touching any other endpoint.
 */
@Group('auth')
@HttpPost('login')
@Body(LoginDto)
export class LoginEndpoint extends Endpoint<null, LoginDto> {
  async main() {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, this.body.username))
      .limit(1);

    // Same answer for "no such user" and "wrong password", on purpose.
    if (!user || !verifyPassword(this.body.password, user.password)) {
      throw new CustomerError('Wrong username or password.');
    }

    // The session holds the id and nothing else. Permissions are resolved per
    // request by the auth resolver, through this module's contract.
    this.request.session.userId = user.id;

    return { id: user.id, fullName: user.fullName, role: user.role };
  }
}
