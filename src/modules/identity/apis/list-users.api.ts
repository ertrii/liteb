import { Endpoint, HttpGet, Module } from '../../../../lib';
import { User } from '../entities/user.entity';

@Module('users')
@HttpGet()
export class ListUsersApi extends Endpoint {
  private readonly users = this.db.getRepository(User);

  main() {
    // 401 when anonymous, 403 when signed in without the key.
    this.auth.assert('identity.users.view');

    // `select` on purpose: the password column must not leave the process.
    return this.users.find({
      select: ['id', 'username', 'fullName', 'role'],
      order: { id: 'ASC' },
    });
  }
}
