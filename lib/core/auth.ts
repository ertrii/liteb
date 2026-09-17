import { Request } from 'express';
import { AuthError, ForbiddenError } from '../utilities/errors';

declare global {
  /**
   * Types the application fills in by declaration merging. It lives in the
   * global scope on purpose: an interface re-exported from the package entry
   * cannot be merged from outside, so this is the only shape a consumer can
   * actually widen.
   */
  namespace LitebAuth {
    /**
     * Whoever is making the request.
     *
     * liteb declares it EMPTY deliberately. The framework has no business
     * deciding what an actor looks like — a user id, a tenant, an API key
     * issued to a third-party extension are all valid, and baking one of them
     * into the framework is what made `getSession('userId')` impossible to
     * move away from.
     *
     * @example
     * // anywhere in the application, once
     * declare global {
     *   namespace LitebAuth {
     *     interface Actor {
     *       userId: number;
     *       role: UserRole;
     *     }
     *   }
     * }
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Actor {}
  }
}

/** Whoever is making the request, as the application declared it. */
export type Actor = LitebAuth.Actor;

/** What an {@link AuthResolver} hands back when it recognizes the caller. */
export interface AuthResult {
  /** The actor itself. Shape is the application's. */
  actor: Actor;
  /**
   * Permission keys this actor holds, matched against the `permissions` each
   * module declares in its manifest. `*` grants everything.
   */
  permissions?: readonly string[];
}

/**
 * Turns a request into whoever is behind it, or `null` when nobody is.
 *
 * This is the seam that keeps the transport out of the endpoints: a cookie
 * session today, a bearer token from the mobile app, an API key from a
 * third-party extension — all of them are this one function.
 *
 * It runs once per request, before `previous()`, so keep it cheap. Throwing
 * from here is legitimate (a malformed token is a 401) and maps through the
 * usual error handling.
 */
export type AuthResolver = (
  request: Request,
) => AuthResult | null | undefined | Promise<AuthResult | null | undefined>;

/** Permission key that grants every other one. */
const GRANT_ALL = '*';

/**
 * Per-request view of who is asking and what they may do.
 *
 * Reachable as `this.auth` inside an {@link Endpoint}.
 */
export class Auth {
  private readonly granted: Set<string>;

  /**
   * @param result What the resolver returned, or `null` for an anonymous call.
   * @param configured Whether the application has a resolver at all. It tells
   * "nobody is logged in" (a 401) apart from "this app never wired auth up"
   * (a programming mistake, which must not look like a 401 to the client).
   */
  constructor(
    private readonly result: AuthResult | null = null,
    private readonly configured = false,
  ) {
    this.granted = new Set(result?.permissions ?? []);
  }

  /** True when the resolver recognized the caller. */
  public get isAuthenticated(): boolean {
    return this.result !== null;
  }

  /**
   * The actor, or `null`. For endpoints that serve signed-in and anonymous
   * callers alike — everywhere else prefer {@link actor}, which fails loudly.
   */
  public get optional(): Actor | null {
    return this.result?.actor ?? null;
  }

  /**
   * The actor. THROWS `AuthError` (401) when the call is anonymous.
   *
   * The throw is the point: reading the actor and checking it exists were two
   * steps that had to be written together every single time, and forgetting
   * the second one failed silently.
   */
  public get actor(): Actor {
    return this.requireActor();
  }

  /** Permission keys held by this actor. Empty when anonymous. */
  public get permissions(): string[] {
    return [...this.granted];
  }

  /**
   * Whether the actor holds every permission given. Anonymous is always false.
   *
   * @example
   * if (!this.auth.can('billing.void')) return this.readOnlyView();
   */
  public can(...permissions: string[]): boolean {
    if (!this.result) return false;
    if (this.granted.has(GRANT_ALL)) return true;
    return permissions.every((permission) => this.granted.has(permission));
  }

  /**
   * Demands the permissions, or stops the request: `AuthError` (401) when
   * nobody is signed in, `ForbiddenError` (403) when someone is but lacks one.
   *
   * The two statuses are not interchangeable — 401 tells a client to
   * authenticate, 403 tells it not to bother.
   *
   * @example
   * this.auth.assert('billing.void');
   */
  public assert(...permissions: string[]): void {
    this.requireActor();
    if (this.can(...permissions)) return;
    const missing = permissions.filter(
      (permission) => !this.granted.has(permission),
    );
    throw new ForbiddenError(
      `Missing permission: ${missing.join(', ')}.`,
      missing,
    );
  }

  private requireActor(): Actor {
    if (this.result) return this.result.actor;
    if (!this.configured) {
      throw new Error(
        'This application resolves no actor: pass `auth` to Liteb.create() (or call setAuth()) before reading this.auth.',
      );
    }
    throw new AuthError('Unauthorized.');
  }
}
