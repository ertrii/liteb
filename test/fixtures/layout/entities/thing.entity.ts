import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Lo que el archivo exporta ADEMÁS de la entidad, que es lo normal. */
export enum ThingKind {
  Big = 'big',
  Small = 'small',
}

export const DEFAULT_KIND = ThingKind.Small;

export class ThingHelper {
  static describe(): string {
    return 'no soy una entidad';
  }
}

@Entity('layout_things')
export class Thing {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar' })
  name: string;
}
