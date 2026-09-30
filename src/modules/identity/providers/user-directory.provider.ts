import { eq } from 'drizzle-orm';
import { Provider, Provides } from '../../../../lib';
import { UserDirectory } from '../tokens/user-directory.token';
import { users } from '../tables/user.table';

/**
 * The half the consumer never sees. Change how users are stored and nothing
 * outside this file moves.
 */
@Provides(UserDirectory)
export class UserDirectoryProvider extends Provider implements UserDirectory {
  public count(): Promise<number> {
    return this.db.$count(users);
  }

  public async nameOf(userId: number): Promise<string | null> {
    const [user] = await this.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user?.fullName ?? null;
  }
}
