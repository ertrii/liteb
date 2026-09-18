import { MigrationInterface, QueryRunner } from 'typeorm';

/** Una constante suelta en la carpeta: no es una migración y no debe contarse. */
export const NAME_LENGTH = 120;

export class AddName1700000100000 implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
    await runner.query('alter table layout_things add column name varchar(120)');
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query('alter table layout_things drop column name');
  }
}
