import { AuthResolver } from '../../lib';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    permissions?: string[];
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
 * It runs once per request, before `previous()`, so it must stay cheap: this
 * one reads the session and nothing else. Throwing from here is legitimate — a
 * malformed credential is a 401 — and maps like any other error.
 */
const sessionAuth: AuthResolver = (request) => {
  const userId = request.session?.userId;
  if (!userId) return null;

  return {
    actor: { userId },
    permissions: request.session.permissions ?? [],
  };
};

export default sessionAuth;
