import type { DataSource } from 'typeorm';
import { Logger } from '../utilities/logger';
import type { Listener } from '../templates/listener';
import type { Container } from './container';

/**
 * A named thing that happened, with the shape of what it carries.
 *
 * Like a contract, it is the ONLY thing two modules share: the emitter exports
 * the token, a listener imports it. Neither imports the other's code.
 *
 * @example
 * export interface ChargeCreated {
 *   chargeId: number;
 *   customerId: number;
 * }
 * export const ChargeCreated = event<ChargeCreated>('billing.charge.created');
 */
export interface EventToken<T> {
  readonly id: string;
  /** Carries the payload type. Never read at runtime. */
  readonly payload?: T;
}

/** Declares an event. The id is what shows up in logs. */
export function event<T>(id: string): EventToken<T> {
  return { id };
}

interface Registration {
  /** Which module contributed the listener, so a failure names a culprit. */
  moduleId: string;
  ListenerClass: new () => Listener<any>;
}

/**
 * In-process publish/subscribe between modules.
 *
 * The rule that keeps it from turning into RPC with extra steps: an event says
 * "this happened", never "do this for me". A listener that fails does NOT fail
 * the emitter — if the caller needs the outcome, it wants a contract, not an
 * event.
 *
 * GOTCHA worth knowing before you use it: listeners run on their own connection.
 * Emitting from inside `db.transaction()` means a listener that reads the
 * database will not see the uncommitted rows. Emit AFTER the transaction
 * commits, or pass what the listener needs in the payload.
 */
export class EventBus {
  private readonly registrations = new Map<string, Registration[]>();

  private container?: Container;

  constructor(private readonly db: DataSource) {}

  /**
   * Hands the bus the application's container, so listeners can resolve
   * contracts.
   *
   * Set afterwards rather than in the constructor because the two reference
   * each other: a contract's implementation may emit, and a listener may
   * resolve a contract. Wiring it explicitly keeps that visible instead of
   * hiding it behind a lazy global.
   */
  public useContainer(container: Container): void {
    this.container = container;
  }

  /** Subscribes a listener class to an event. */
  public register<T>(
    token: EventToken<T>,
    ListenerClass: new () => Listener<T>,
    moduleId: string,
  ): void {
    const current = this.registrations.get(token.id) ?? [];
    current.push({ moduleId, ListenerClass });
    this.registrations.set(token.id, current);
  }

  /** Event ids with at least one listener, for the startup log. */
  public ids(): string[] {
    return [...this.registrations.keys()];
  }

  /** How many listeners an event has. */
  public countFor<T>(token: EventToken<T>): number {
    return this.registrations.get(token.id)?.length ?? 0;
  }

  /**
   * Announces that something happened.
   *
   * Every listener runs — independently, in parallel — and the returned promise
   * resolves once they all settled. Failures are logged with the module and the
   * event, and never propagate: one module's broken side effect must not fail
   * another module's request.
   *
   * An event nobody listens to is not an error. That is the point.
   */
  public async emit<T>(token: EventToken<T>, payload: T): Promise<void> {
    const registrations = this.registrations.get(token.id);
    if (!registrations || registrations.length === 0) return;

    const results = await Promise.allSettled(
      registrations.map(async ({ ListenerClass }) => {
        const listener = new ListenerClass();
        listener.db = this.db;
        listener.container = this.container;
        await listener.on(payload);
      }),
    );

    results.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      const { moduleId, ListenerClass } = registrations[index];
      Logger.error(
        `Listener ${ListenerClass.name} (module "${moduleId}") failed on "${token.id}"`,
        result.reason,
      );
    });
  }
}
