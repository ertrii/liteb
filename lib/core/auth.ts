import { Request } from 'express';
import type { DataSource } from 'typeorm';
import { AuthError, ForbiddenError } from '../utilities/errors';
import type { Contract } from '../modules/container';
import { GRANT_ALL, PermissionRegistry } from '../modules/permissions';

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
 * What a resolver gets besides the request.
 *
 * Without it, any application whose permissions live in the database had to
 * close over an imported DataSource singleton — the exact global the module
 * container exists to avoid — or copy them into the session at login and let
 * them go stale.
 */
export interface AuthContext {
  /** The running DataSource, with every module's entities registered. */
  db: DataSource;

  /**
   * Resolves a contract a module provides, so the policy for who may do what
   * can stay inside the module that owns it.
   *
   * @example
   * auth: async (req, { get }) => {
   *   const userId = req.session?.userId;
   *   if (!userId) return null;
   *   const directory = get(UserDirectory);
   *   return { actor: { userId }, permissions: await directory.permissionsOf(userId) };
   * }
   */
  get<T>(token: Contract<T>): T;
}

/**
 * Turns a request into whoever is behind it, or `null` when nobody is.
 *
 * This is the seam that keeps the transport out of the endpoints: a cookie
 * session today, a bearer token from the mobile app, an API key from a
 * third-party extension — all of them are this one function.
 *
 * Passed as `Liteb.create({ auth })`.
 *
 * It runs once per request, before `previous()`, so keep it cheap. Throwing
 * from here is legitimate (a malformed token is a 401) and maps through the
 * usual error handling.
 */
export type AuthResolver = (
  request: Request,
  context: AuthContext,
) => AuthResult | null | undefined | Promise<AuthResult | null | undefined>;

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
    /**
     * What the installed modules declare. Without it — an `Auth` built by
     * hand — keys are not checked.
     */
    private readonly registry?: PermissionRegistry,
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
    permissions.forEach((permission) => this.assertDeclared(permission));
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
    // BEFORE the 401 on purpose: an undeclared key is a code error, and it must
    // not stay hidden until someone signs in. In development the first request
    // is usually anonymous, which is exactly when you want to hear about it.
    permissions.forEach((permission) => this.assertDeclared(permission));
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

  /**
   * Refuses a key no module declares.
   *
   * It throws a plain `Error` (500) rather than a 403 ON PURPOSE: a key that
   * exists nowhere is a mistake in the code, and answering 403 would send
   * whoever debugs it to look at roles and grants instead of at the typo.
   */
  private assertDeclared(permission: string): void {
    if (!this.registry || this.registry.has(permission)) return;

    const near = this.registry.suggest(permission);
    const hint = near.length > 0 ? ` Did you mean: ${near.join(', ')}?` : '';
    throw new Error(
      `Unknown permission "${permission}": no installed module declares it. Add it to that module's "permissions" in defineModule().${hint}`,
    );
  }

  private requireActor(): Actor {
    if (this.result) return this.result.actor;
    if (!this.configured) {
      throw new Error(
        'This application resolves no actor: pass `auth` to Liteb.create() before reading this.auth.',
      );
    }
    throw new AuthError('Unauthorized.');
  }
}
