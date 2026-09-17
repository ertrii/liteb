import { MigrationInterface, QueryRunner } from 'typeorm';
import { hashPassword } from '../services/password';

/**
 * The class name ENDS IN A TIMESTAMP, and that is not decoration: liteb orders
 * a module's migrations by it, and refuses to start without one.
 */
export class CreateUsers1758000000000 implements MigrationInterface {
  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table demo_users (
        id serial primary key,
        username varchar not null unique,
        "fullName" varchar not null,
        password varchar not null,
        role varchar not null default 'staff'
      )
    `);

    // Seeding from a migration keeps the demo runnable with one command.
    await runner.query(
      `insert into demo_users (username, "fullName", password, role)
       values ($1, $2, $3, $4), ($5, $6, $7, $8)`,
      [
        'owner',
        'Demo Owner',
        hashPassword('demo1234'),
        'owner',
        'staff',
        'Demo Staff',
        hashPassword('demo1234'),
        'staff',
      ],
    );
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query('drop table demo_users');
  }
}
