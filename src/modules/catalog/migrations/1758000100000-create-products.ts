import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProducts1758000100000 implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table demo_products (
        id serial primary key,
        name varchar not null,
        stock int not null default 0,
        enabled boolean not null default true
      )
    `);

    await runner.query(`
      create table demo_stock_moves (
        id serial primary key,
        "productId" int not null references demo_products(id),
        quantity int not null,
        "userId" int not null,
        "createdAt" timestamptz not null default now()
      )
    `);

    await runner.query(
      `insert into demo_products (name, stock) values ($1, $2), ($3, $4)`,
      ['Antenna 5GHz', 12, 'PoE Injector', 40],
    );
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query('drop table demo_stock_moves');
    await runner.query('drop table demo_products');
  }
}
