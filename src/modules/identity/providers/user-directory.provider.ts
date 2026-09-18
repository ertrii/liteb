import { Provider, Provides } from '../../../../lib';
import { UserDirectory } from '../contracts/user-directory.contract';
import { User } from '../entities/user.entity';

/**
 * The half the consumer never sees. Change how users are stored and nothing
 * outside this file moves.
 *
 * `this.db` is set before the instance is built, which is what lets a field
 * initializer reach for a repository.
 */
@Provides(UserDirectory)
export class UserDirectoryProvider extends Provider implements UserDirectory {
  private readonly users = this.db.getRepository(User);

  public count(): Promise<number> {
    return this.users.count();
  }

  public async nameOf(userId: number): Promise<string | null> {
    return (await this.users.findOneBy({ id: userId }))?.fullName ?? null;
  }
}
