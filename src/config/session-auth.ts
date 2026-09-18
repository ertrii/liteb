import { AuthResolver } from '../../lib';
import { User } from '../modules/identity/entities/user.entity';
import { PERMISSIONS_BY_ROLE } from './roles';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

declare global {
  namespace LitebAuth {
    /**
     * What THIS application calls an actor. Declared once, here; from then on
     * `this.auth.actor` is typed in every endpoint and task.
     *
     * liteb declares it empty on purpose: a user id, a tenant or an API key
     * issued to a third-party extension are all valid actors, and the
     * framework picking one is what traps an application later.
     */
    interface Actor {
      userId: number;
    }
  }
}

/**
 * Cookie session -> actor. The ONLY file that knows sessions exist.
 *
 * Replace it with one that reads a bearer token (mobile app) or an API key
 * (third-party extension) and every endpoint keeps working untouched.
 *
 * It queries `db` directly, which is all a resolver needs: liteb stores no
 * users and no roles, it receives a list of keys per request and compares
 * strings. `get` is also available, to reach a module's contract instead —
 * worth it when the resolver must not import a module's entity, because that
 * module comes installed from somewhere else. Here the application owns all
 * three, so the import is the honest shorter path. `reports` is where this
 * demo shows a contract doing its actual job.
 *
 * Permissions are read PER REQUEST, not copied into the session at login, so
 * revoking a role takes effect on the next request and a user deleted
 * mid-session stops being an actor at once. That costs one lookup; an
 * application that minds can cache it, but the default should be correct
 * rather than fast.
 */
const sessionAuth: AuthResolver = async (request, { db }) => {
  const userId = request.session?.userId;
  if (!userId) return null;

  const user = await db.getRepository(User).findOneBy({ id: userId });
  if (!user) return null;

  return { actor: { userId }, permissions: PERMISSIONS_BY_ROLE[user.role] };
};

export default sessionAuth;
