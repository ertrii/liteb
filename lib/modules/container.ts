import { DataSource } from 'typeorm';
import type { EventBus, EventToken } from './events';
import type { Slot } from './slots';

/**
 * A capability one module publishes and others consume.
 *
 * It carries its type at compile time and its identity at run time, so a
 * consumer imports *this* — never the implementation, which stays private to
 * the module that owns it. That asymmetry is what lets a module be swapped or
 * turned off without its consumers knowing.
 */
export interface Contract<T> {
  readonly id: string;
  /**
   * Tells a contract from a {@link Slot}. Without it the two would be
   * structurally identical and each could be passed where the other goes,
   * which is the one confusion that matters here: a contract has exactly one
   * provider, a slot has many.
   */
  readonly kind: 'contract';
  /** Phantom field: carries T so `get()` returns the right type. Never set. */
  readonly __type?: T;
}

/** Declares a contract. The id is what appears in errors, so name it well. */
export function contract<T>(id: string): Contract<T> {
  return { id, kind: 'contract' };
}

/** What an implementation is built with. */
export interface ContainerContext {
  db: DataSource;
  get: <T>(token: Contract<T>) => T;
  /**
   * Announces something happened. Available here so a contract's
   * implementation — where most of a module's work lives — can emit without
   * reaching for a global.
   */
  emit: <T>(token: EventToken<T>, payload: T) => Promise<void>;
  /** Everything contributed to an extension point. */
  all: <T>(slot: Slot<T>) => T[];
}

/**
 * How a module provides a contract: a class to instantiate, a factory to call,
 * or a value that is already built.
 */
export type Provider<T> =
  | { token: Contract<T>; use: new (ctx: ContainerContext) => T }
  | { token: Contract<T>; factory: (ctx: ContainerContext) => T }
  | { token: Contract<T>; value: T };

/**
 * How a module contributes to someone else's extension point. Same three
 * shapes as {@link Provider}, because it is the same question — how do you
 * build this — asked in a place that allows more than one answer.
 */
export type Contribution<T> =
  | { slot: Slot<T>; use: new (ctx: ContainerContext) => T }
  | { slot: Slot<T>; factory: (ctx: ContainerContext) => T }
  | { slot: Slot<T>; value: T };

export class ContractError extends Error {
  constructor(
    message: string,
    public contractId: string,
  ) {
    super(message);
    this.name = 'ContractError';
  }
}

interface Registration {
  provider: Provider<unknown>;
  moduleId: string;
  instance?: unknown;
  resolving?: boolean;
}

interface SlotRegistration {
  contribution: Contribution<unknown>;
  moduleId: string;
}

/**
 * Holds the contracts the enabled modules publish, and hands them out.
 *
 * One container per application rather than a process-wide singleton: two
 * applications in one process — a test suite, a worker beside a server — must
 * not see each other's implementations.
 *
 * Implementations are built the first time they are asked for, not at startup.
 * A module that is never called never pays for its dependencies, and startup
 * does not hang on something only one endpoint needs.
 */
export class Container {
  private registry = new Map<string, Registration>();
  private slots = new Map<string, SlotRegistration[]>();
  /** Built contributions per slot, cached like a contract's instance. */
  private filled = new Map<string, unknown[]>();
  private resolvingSlots = new Set<string>();
  private events?: EventBus;

  constructor(private readonly db: DataSource) {}

  /**
   * Registers what a module provides.
   *
   * Two modules publishing the same contract is an error: whoever consumed it
   * would get one of them by load order, which is the kind of bug that changes
   * between deploys.
   */
  register(moduleId: string, provider: Provider<any>): void {
    const { id } = provider.token;
    const existing = this.registry.get(id);

    if (existing) {
      throw new ContractError(
        `Contract "${id}" is provided by both "${existing.moduleId}" and "${moduleId}". Exactly one module can provide it.`,
        id,
      );
    }

    this.registry.set(id, { provider, moduleId });
  }

  has<T>(token: Contract<T>): boolean {
    return this.registry.has(token.id);
  }

  /** Which module provides a contract, for diagnostics. */
  providerOf<T>(token: Contract<T>): string | null {
    return this.registry.get(token.id)?.moduleId ?? null;
  }

  /** Every registered contract id, for startup reporting. */
  ids(): string[] {
    return [...this.registry.keys()];
  }

  get<T>(token: Contract<T>): T {
    const registration = this.registry.get(token.id);

    if (!registration) {
      throw new ContractError(
        `No module provides the contract "${token.id}". Check that the module providing it is installed and enabled.`,
        token.id,
      );
    }

    if ('instance' in registration && registration.instance !== undefined) {
      return registration.instance as T;
    }

    // Two implementations asking for each other would recurse until the stack
    // gives out, with a trace that says nothing about which contracts are at
    // fault.
    if (registration.resolving) {
      throw new ContractError(
        `Contract "${token.id}" is being resolved while it is still being built: its implementation depends on itself.`,
        token.id,
      );
    }

    registration.resolving = true;
    try {
      registration.instance = this.build(registration.provider);
      return registration.instance as T;
    } finally {
      registration.resolving = false;
    }
  }

  /**
   * Records what a module contributes to an extension point.
   *
   * Unlike a contract, MORE THAN ONE is the normal case — refusing a second
   * one would defeat the purpose. Order is the order modules are registered in,
   * which by the time this runs is dependency order, so it is stable across
   * boots.
   */
  public contribute(
    contribution: Contribution<unknown>,
    moduleId: string,
  ): void {
    const current = this.slots.get(contribution.slot.id) ?? [];
    current.push({ contribution, moduleId });
    this.slots.set(contribution.slot.id, current);
  }

  /**
   * Everything the enabled modules contributed to an extension point.
   *
   * An empty array is a normal answer: an extension point nobody filled is a
   * feature nobody installed, not an error.
   *
   * Built on first use and cached, like a contract's implementation.
   */
  public all<T>(target: Slot<T>): T[] {
    const cached = this.filled.get(target.id);
    if (cached) return cached as T[];

    const registrations = this.slots.get(target.id);
    if (!registrations || registrations.length === 0) return [];

    // A contribution whose factory asks for its own slot would recurse until
    // the stack gives out, with a trace naming nothing useful.
    if (this.resolvingSlots.has(target.id)) {
      throw new ContractError(
        `Extension point "${target.id}" is being filled while it is still being filled: a contribution asks for the slot it belongs to.`,
        target.id,
      );
    }

    this.resolvingSlots.add(target.id);
    try {
      const built = registrations.map(({ contribution }) =>
        this.build(this.asProvider(contribution)),
      );
      this.filled.set(target.id, built);
      return built as T[];
    } finally {
      this.resolvingSlots.delete(target.id);
    }
  }

  /** Extension points with at least one contribution, for the startup log. */
  public slotIds(): string[] {
    return [...this.slots.keys()];
  }

  /** How many modules filled an extension point. */
  public countFor<T>(target: Slot<T>): number {
    return this.slots.get(target.id)?.length ?? 0;
  }

  /** A contribution and a provider are built the same way. */
  private asProvider(contribution: Contribution<unknown>): Provider<unknown> {
    const token = { id: contribution.slot.id, kind: 'contract' } as Contract<unknown>;
    if ('value' in contribution) return { token, value: contribution.value };
    if ('factory' in contribution) {
      return { token, factory: contribution.factory };
    }
    return { token, use: contribution.use };
  }

  /** See {@link EventBus.useContainer}: the two reference each other. */
  public useEvents(events: EventBus): void {
    this.events = events;
  }

  private build(provider: Provider<unknown>): unknown {
    const ctx: ContainerContext = {
      db: this.db,
      get: (token) => this.get(token),
      emit: async (token, payload) => {
        // An application with no bus (no modules) simply has nobody listening.
        await this.events?.emit(token, payload);
      },
      all: (target) => this.all(target),
    };

    if ('value' in provider) return provider.value;
    if ('factory' in provider) return provider.factory(ctx);
    return new provider.use(ctx);
  }
}
