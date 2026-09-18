import { Endpoint, HttpGet, Group } from '../../../../lib';
import { permissions } from '../permissions';
import { User } from '../entities/user.entity';

@Group('users')
@HttpGet()
export class ListUsersEndpoint extends Endpoint {
  private readonly users = this.db.getRepository(User);

  main() {
    // 401 when anonymous, 403 when signed in without the key.
    this.auth.assert(permissions['users.view']);

    // `select` on purpose: the password column must not leave the process.
    return this.users.find({
      select: ['id', 'username', 'fullName', 'role'],
      order: { id: 'ASC' },
    });
  }
}
