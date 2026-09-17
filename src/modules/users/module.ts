import { contract, defineModule } from '../../../lib';
import { User } from './entities/user.entity';

/** What other modules may ask of users, without importing this module. */
export interface UserDirectory {
  countUsers(): Promise<number>;
}

export const UserDirectory = contract<UserDirectory>('users.directory');

export default defineModule({
  id: 'users',
  version: '1.0.0',
  label: 'Users',
  core: true,
  dir: __dirname,
  entities: [User],
  routes: './apis/*.api.ts',
  tasks: './tasks/*.task.ts',
  permissions: [{ key: 'users.view', label: 'View users' }],
  provides: [
    {
      token: UserDirectory,
      factory: (ctx) => ({
        countUsers: () => ctx.db.getRepository(User).count(),
      }),
    },
  ],
});
