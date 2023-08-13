import { IncomingHttpHeaders } from 'http2';
import { Seeder } from '../seeder/templates';
import { Type } from '../interfaces/type';

/**
 * Metadata for APP
 */
export interface ModuleMetadata {
  controllers: string[];
  schedules: string[];
  sockets?: string[];
  entities: string[];
  seeders?: Array<new () => Seeder<any>>;
}

export interface ReqHeader extends IncomingHttpHeaders {
  /**
   * @deprecated
   */
  'project-id'?: string;
  /**
   * userOwnerID es la id del usuario dueño del proyecto.
   * Existen datos que se registran a nombre del dueño y
   * para que los usuarios invitados puedan obtener necesitará
   * de la id del dueño
   */
  'user-owner-id'?: string;
}

export type ClassController<T = Record<string, any>> = Type<T>;
