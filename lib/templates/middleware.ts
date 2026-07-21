import { Request } from 'express';

/**
 * @deprecated Use a middleware function with `@Use`. Will be removed in a future
 * major version.
 *
 * The class variant only receives `request` and signals rejection by throwing
 * (which always responds 401), so it cannot read the response, set headers or
 * choose a different status. A function receives `(req, res, next)` and has none
 * of those limitations.
 *
 * @example
 * function adminOnly(req: Request, res: Response, next: NextFunction) {
 *   if (!req.session.user) {
 *     res.status(403).json({ message: 'Forbidden' });
 *     return;
 *   }
 *   next();
 * }
 *
 * @Module('customers')
 * @HttpGet('')
 * @Use(adminOnly)
 * export class ListCustomers extends Api { ... }
 */
export abstract class Middleware {
  public request: Request;

  public abstract canContinue(): void | Promise<void>;
}
