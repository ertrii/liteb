import { DataSource } from 'typeorm';
import type { Container, Contract } from '../modules/container';

export abstract class Task {
  public db: DataSource;

  /** Container of the application this task belongs to, injected like `db`. */
  public container?: Container;

  /**
   * Resolves a contract another module provides. Same rule as an endpoint: the
   * task knows the contract, never the implementation.
   */
  protected get<T>(token: Contract<T>): T {
    if (!this.container) {
      throw new Error(
        `Cannot resolve the contract "${token.id}": this application has no modules. Start it with Liteb.create({ modules }).`,
      );
    }
    return this.container.get(token);
  }

  abstract start(now: Date | 'manual' | 'init'): any;
}
