import { DataSource } from 'typeorm';
import type { Provider } from '../templates/provider';
import type { EventBus } from './events';
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

/** A class that implements a contract, or fills an extension point. */
export type ProviderClass = new () => Provider;

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
  ProviderClass: ProviderClass;
  moduleId: string;
  instance?: unknown;
  resolving?: boolean;
}

interface SlotRegistration {
  ProviderClass: ProviderClass;
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
  register(
    moduleId: string,
    token: Contract<unknown>,
    ProviderClass: ProviderClass,
  ): void {
    const { id } = token;
    const existing = this.registry.get(id);

    if (existing) {
      throw new ContractError(
        `Contract "${id}" is provided by both "${existing.moduleId}" and "${moduleId}". Exactly one module can provide it.`,
        id,
      );
    }

    this.registry.set(id, { ProviderClass, moduleId });
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
      registration.instance = this.build(registration.ProviderClass);
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
    moduleId: string,
    target: Slot<unknown>,
    ProviderClass: ProviderClass,
  ): void {
    const current = this.slots.get(target.id) ?? [];
    current.push({ ProviderClass, moduleId });
    this.slots.set(target.id, current);
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
      const built = registrations.map(({ ProviderClass }) =>
        this.build(ProviderClass),
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

  /** See {@link EventBus.useContainer}: the two reference each other. */
  public useEvents(events: EventBus): void {
    this.events = events;
  }

  /**
   * Builds an implementation.
   *
   * `db`, `container` and `events` go on the PROTOTYPE first, so a field
   * initializer — `private readonly users = this.db.getRepository(User)` —
   * already has them when the constructor runs. Then they are copied onto the
   * instance, which pins them: a second application in the same process
   * registering the same class cannot change what this one already built.
   */
  private build(ProviderClass: ProviderClass): unknown {
    const proto = ProviderClass.prototype;
    proto.db = this.db;
    proto.container = this;
    proto.events = this.events;

    const instance = new ProviderClass();
    instance.db = this.db;
    instance.container = this;
    instance.events = this.events;

    return instance;
  }
}

