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
     * What this application calls an actor. Declared ONCE, here; from then on
     * `this.auth.actor` is typed in every endpoint.
     */
    interface Actor {
      userId: number;
    }
  }
}

/**
 * Cookie session -> actor.
 *
 * This is the only file that knows sessions exist. Swapping it for one that
 * reads a bearer token (mobile app) or an API key (third-party extension)
 * changes how every endpoint authenticates without touching a single one.
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
