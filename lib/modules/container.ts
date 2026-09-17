import { DataSource } from 'typeorm';

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
  /** Phantom field: carries T so `get()` returns the right type. Never set. */
  readonly __type?: T;
}

/** Declares a contract. The id is what appears in errors, so name it well. */
export function contract<T>(id: string): Contract<T> {
  return { id };
}

/** What an implementation is built with. */
export interface ContainerContext {
  db: DataSource;
  get: <T>(token: Contract<T>) => T;
}

/**
 * How a module provides a contract: a class to instantiate, a factory to call,
 * or a value that is already built.
 */
export type Provider<T> =
  | { token: Contract<T>; use: new (ctx: ContainerContext) => T }
  | { token: Contract<T>; factory: (ctx: ContainerContext) => T }
  | { token: Contract<T>; value: T };

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

  private build(provider: Provider<unknown>): unknown {
    const ctx: ContainerContext = {
      db: this.db,
      get: (token) => this.get(token),
    };

    if ('value' in provider) return provider.value;
    if ('factory' in provider) return provider.factory(ctx);
    return new provider.use(ctx);
  }
}
