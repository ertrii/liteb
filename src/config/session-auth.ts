import { AuthResolver } from '../../lib';
import { UserDirectory } from '../modules/identity/module';

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
 * The session holds nothing but the user id. Permissions are resolved per
 * request through the `identity` contract, so revoking a role takes effect on
 * the next request instead of the next login — and a user deleted mid-session
 * stops being an actor at once.
 *
 * That costs one lookup per request. An application that minds can cache it,
 * but the default should be correct rather than fast.
 */
const sessionAuth: AuthResolver = async (request, { get }) => {
  const userId = request.session?.userId;
  if (!userId) return null;

  const permissions = await get(UserDirectory).permissionsOf(userId);
  if (!permissions) return null;

  return { actor: { userId }, permissions };
};

export default sessionAuth;
