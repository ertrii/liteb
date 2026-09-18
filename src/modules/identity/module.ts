import { contract, defineModule } from '../../../lib';
import { permissions } from './permissions';
import { User } from './entities/user.entity';
import * as migrations from './migrations';

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
  // Without `dir` the globs below would resolve against the process's working
  // directory, and the module would break the moment it is moved.
  dir: __dirname,

  entities: [User],
  migrations,
  routes: './endpoints/*.endpoint.ts',

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
