import { asc } from 'drizzle-orm';
import { Endpoint, HttpGet, Group } from '../../../../lib';
import { users } from '../tables/user.table';

@Group('users')
@HttpGet()
export class ListUsersEndpoint extends Endpoint {
  main() {
    // 401 when anonymous, 403 when signed in without the key.
    this.auth.assert('identity.users.view');

    // The columns are named on purpose: the password column must not leave the
    // process, and `select()` with nothing in it brings every column there is.
    return this.db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
      })
      .from(users)
      .orderBy(asc(users.id));
  }
}
