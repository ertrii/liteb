import { DataSource } from 'typeorm';

export abstract class Task {
  public db: DataSource;

  abstract start(now: Date | 'manual' | 'init'): any;
  // abstract stop: () => any;
}
