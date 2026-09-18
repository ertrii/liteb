import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateThings1700000000000 implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
    await runner.query('create table if not exists layout_things (id int)');
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query('drop table if exists layout_things');
  }
}
