import { contract, defineModule } from '../../../lib';
import { permissions } from './permissions';
import { User } from './entities/user.entity';

/**
 * What other modules may ask about users — WITHOUT importing anything from
 * here. They import this token; the implementation stays private.
 */
export interface UserDirectory {
  count(): Promise<number>;
  nameOf(userId: number): Promise<string | null>;
}

export const UserDirectory = contract<UserDirectory>('identity.directory');

export default defineModule({
  id: 'identity',
  version: '1.0.0',
  label: 'Identity',
  // Core: it cannot be turned off. Nothing else would have anyone to serve.
  core: true,
  engine: '^2.0.0',
  // Where this module lives. Its entities, migrations and endpoints are found
  // from here by the standard layout, so nothing below repeats a path. Without
  // `dir` there is nothing to resolve against and liteb looks for none of it.
  dir: __dirname,

  // The vocabulary this module can gate, declared in ./permissions.ts.
  permissions,

  provides: [
    {
      token: UserDirectory,
      factory: ({ db }) => {
        const users = db.getRepository(User);
        return {
          count: () => users.count(),
          nameOf: async (userId) =>
            (await users.findOneBy({ id: userId }))?.fullName ?? null,
        };
      },
    },
  ],
});
