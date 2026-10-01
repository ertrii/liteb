import { Database } from '../modules/database';
import type { Container, Contract } from '../modules/container';
import type { Slot } from '../modules/slots';
import type { EventBus, EventToken } from '../modules/events';

/**
 * One implementation of a domain interface another module opened.
 *
 * The interface belongs to the HOST: `catalog` decides what a product badge
 * is, what it receives and what it may answer. A strategy implements that
 * interface and nothing else — it is not its module's public face, nobody asks
 * for it by name, and the only thing it ever sees is what the host passes.
 *
 * Which is exactly how it differs from a {@link Provider}:
 *
 * | | Answers to | How many | Who calls it |
 * | --- | --- | --- | --- |
 * | {@link Provider} | a contract, with `@Provides` | exactly one | whoever resolved it |
 * | **Strategy** | an extension point, with `@Fills` | as many as are deployed | **the host, and only the host** |
 *
 * Two consequences worth knowing before writing one:
 *
 * - **The host runs it inside its own flow.** Throwing here fails the host's
 *   request — a strategy is a direct call, not a notification. When the point
 *   is a side effect that must not be able to break the caller, that is an
 *   event and a {@link Listener}.
 * - **It is built once and reused** for the life of the application, so it is
 *   effectively a singleton. Never keep per-request state in one.
 *
 * @example
 * \@Fills(ProductBadges)
 * export class LowStockBadge extends Strategy implements ProductBadge {
 *   public readonly id = 'low-stock';
 *
 *   public for(product: { stock: number }): string | null {
 *     return product.stock < 10 ? 'Low stock' : null;
 *   }
 * }
 */
export abstract class Strategy {
  /** The open connection, injected before the instance is built. */
  public db: Database;

  /** Container of the application this strategy belongs to. */
  public container?: Container;

  /** Event bus of this application. */
  public events?: EventBus;

  /**
   * Resolves a contract. A strategy may depend on contracts like anything
   * else — including one the host provides.
   */
  protected get<T>(token: Contract<T>): T {
    if (!this.container) {
      throw new Error(
        `Cannot resolve the contract "${token.id}": this application has no modules. Start it with Liteb.create({ modules }).`,
      );
    }
    return this.container.get(token);
  }

  /**
   * Everything contributed to an extension point.
   *
   * Reading the slot this very class fills is reported instead of recursing
   * until the stack gives out.
   */
  protected all<T>(target: Slot<T>): T[] {
    if (!this.container) {
      throw new Error(
        `Cannot read the extension point "${target.id}": this application has no modules. Start it with Liteb.create({ modules }).`,
      );
    }
    return this.container.all(target);
  }

  /**
   * Announces that something happened, for whatever modules are listening.
   *
   * Note what this is NOT for: answering the host. The host reads what this
   * class returns, so an event here is a side effect of doing the work, never
   * the way the work gets reported.
   */
  protected async emit<T>(token: EventToken<T>, payload: T): Promise<void> {
    if (!this.events) return;
    await this.events.emit(token, payload);
  }
}
