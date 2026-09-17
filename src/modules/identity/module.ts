import { contract, defineModule } from '../../../lib';
import { User } from './entities/user.entity';
import * as migrations from './migrations';
import { PERMISSIONS_BY_ROLE } from './roles';

/**
 * What other modules may ask about users — WITHOUT importing anything from
 * here. They import this token; the implementation stays private.
 */
export interface UserDirectory {
  count(): Promise<number>;
  nameOf(userId: number): Promise<string | null>;
  /**
   * Permission keys this user holds, or `null` if the user is gone.
   *
   * It lives here because WHO MAY DO WHAT is identity's business. The auth
   * resolver calls it through the contract, so the rule can change — roles in
   * a table, per-tenant overrides — without touching the resolver or a single
   * endpoint.
   */
  permissionsOf(userId: number): Promise<string[] | null>;
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

  // The vocabulary this module can gate. Every key MUST start with the module
  // id: all modules, including third-party ones, share a single space.
  permissions: [
    { key: 'identity.users.view', label: 'View users' },
    { key: 'identity.users.manage', label: 'Create and edit users' },
  ],

  provides: [
    {
      token: UserDirectory,
      factory: ({ db }) => {
        const users = db.getRepository(User);
        return {
          count: () => users.count(),
          nameOf: async (userId) =>
            (await users.findOneBy({ id: userId }))?.fullName ?? null,
          permissionsOf: async (userId) => {
            const user = await users.findOneBy({ id: userId });
            return user ? PERMISSIONS_BY_ROLE[user.role] : null;
          },
        };
      },
    },
  ],
});
