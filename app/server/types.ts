import { Seeder } from '../seeder/templates';
import { Type } from '../interfaces/type';

/**
 * Metadata for APP
 */
export interface ModuleMetadata {
  controllers: string[];
  schedules: string[];
  sockets?: string[];
  seeders?: Array<new () => Seeder<any>>;
}

export type ClassController<T = Record<string, any>> = Type<T>;

export interface PatternsServer {
  controllers: string[];
  schedules: string[];
}
