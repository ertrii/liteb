import 'reflect-metadata';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import {
  Column,
  DataSource,
  Entity,
  MigrationInterface,
  PrimaryGeneratedColumn,
  QueryRunner,
} from 'typeorm';
import { ModuleMigrator } from '../lib/modules/module-migrator';
import {
  schemaDiff,
  tableOwners,
  tablesMentioned,
} from '../lib/modules/schema-diff';
import { generateMigration } from '../lib/cli/migration-generator';
import { createMigration } from '../lib/cli/generators';
import type { ResolvedModule } from '../lib/modules/module-manifest';
import { closeTestDb, createTestDb, resetSchema } from './helpers/test-db';

@Entity('gen_users')
class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

@Entity('gen_invoices')
class InvoiceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  total!: string;
}

/**
 * El reparto de trabajo: TypeORM lee el esquema vivo, calcula qué le falta a
 * las entidades y escribe el SQL —eso lo hace mejor que cualquier cosa a mano
 * y es la parte que TIENE que estar bien—. Lo que no puede es decidir dónde va
 * la migración, porque para él los módulos no existen. Esa parte es de liteb.
 */
describe('migration:generate', () => {
  let db: DataSource;

  beforeAll(async () => {
    db = await createTestDb([UserEntity, InvoiceEntity]);
  });

  beforeEach(async () => {
    await resetSchema(db);
  });

  afterAll(closeTestDb);

  const modulos = [
    { id: 'users', entities: [UserEntity] },
    { id: 'billing', entities: [InvoiceEntity] },
  ] as unknown as ResolvedModule[];

  it('pregunta a TypeORM qué falta, y no cambia nada', async () => {
    const diff = await schemaDiff(db);

    expect(diff.up.join('\n')).toMatch(/create table[\s\S]*gen_users/i);
    // Preguntar no es aplicar: la tabla sigue sin existir.
    const existe = await db.query(
      "select to_regclass('public.gen_users') as t",
    );
    expect(existe[0].t).toBeNull();
  });

  it('con la base al día, no hay nada que generar', async () => {
    await db.synchronize();

    expect((await schemaDiff(db)).up).toEqual([]);
  });

  it('sabe de qué módulo es cada tabla, que es lo que TypeORM no puede saber', () => {
    expect(tableOwners(db, modulos)).toEqual(
      new Map([
        ['gen_users', 'users'],
        ['gen_invoices', 'billing'],
      ]),
    );
  });

  it('escribe una migración que liteb sabe correr', async () => {
    const diff = await schemaDiff(db);

    const [archivo] = generateMigration({
      target: 'users/create-users',
      diff,
      owners: tableOwners(db, modulos),
      now: 1789779741336,
    }).files;

    expect(archivo.path).toBe(
      'src/modules/users/migrations/1789779741336-create-users.ts',
    );
    // El sello al final del nombre es lo que ordena dentro del módulo; sin él
    // liteb rechaza la clase.
    expect(archivo.content).toContain(
      'export class CreateUsers1789779741336 implements MigrationInterface',
    );
    expect(archivo.content).toMatch(/async up\(runner: QueryRunner\)/);
    expect(archivo.content).toMatch(/async down\(runner: QueryRunner\)/);
    expect(archivo.content).toMatch(/gen_users/);
  });

  it('se niega cuando nada de lo que cambió es de ese módulo', async () => {
    // Una migración en el módulo equivocado corre en el orden equivocado
    // —después de quien la necesitaba, o nunca si ese módulo está apagado— y
    // eso se descubre en producción, sobre datos que ya existen.
    const diff = { up: ['CREATE TABLE "gen_invoices" ()'], down: [] };

    expect(() =>
      generateMigration({
        target: 'users/lo-que-sea',
        diff,
        owners: tableOwners(db, modulos),
      }),
    ).toThrow(/Nothing here belongs to "users"[\s\S]*billing: gen_invoices/);
  });

  it('avisa cuando toca tablas de otro módulo, sin decidir por vos', async () => {
    const diff = {
      up: ['CREATE TABLE "gen_users" ()', 'ALTER TABLE "gen_invoices" ADD x int'],
      down: [],
    };

    const { hints } = generateMigration({
      target: 'users/mixta',
      diff,
      owners: tableOwners(db, modulos),
    });

    expect(hints.join(' ')).toMatch(/gen_invoices \(billing\)/);
  });

  it('no rompe el literal cuando el SQL trae backticks', () => {
    const diff = { up: ['SELECT `raro`, "${x}"'], down: [] };

    const [archivo] = generateMigration({
      target: 'users/raro',
      diff,
      owners: new Map([['gen_users', 'users']]),
      now: 1,
    }).files;

    expect(archivo.content).toContain('SELECT \\`raro\\`');
    expect(archivo.content).toContain('\\${x}');
  });

  it('reconoce las tablas que conoce, venga el SQL como venga', () => {
    expect(
      tablesMentioned(
        ['ALTER TABLE `gen_users` ADD x', 'create table [gen_invoices] ()'],
        ['gen_users', 'gen_invoices', 'otra'],
      ),
    ).toEqual(['gen_users', 'gen_invoices']);
  });
});

/**
 * La trampa que esto cierra: una migración VACÍA se aplica sin error.
 *
 * Una consulta que es sólo un comentario corre bien, así que liteb la anota
 * como aplicada — y desde ahí no tiene razón para volver a correrla. El SQL
 * que se escriba después no se ejecuta nunca, y `liteb migrate` sigue
 * contestando "nothing to migrate" sobre una tabla que jamás se creó.
 */
describe('una migración sin escribir', () => {
  let db: DataSource;

  beforeAll(async () => {
    db = await createTestDb();
  });

  beforeEach(async () => {
    await resetSchema(db);
  });

  afterAll(closeTestDb);

  const conMigracion = (clase: Function): ResolvedModule =>
    ({ id: 'users', migrations: [clase] }) as unknown as ResolvedModule;

  it('el andamiaje se niega a correr hasta que tenga SQL', async () => {
    const [archivo] = createMigration({
      target: 'users/create-users',
      modulesDir: 'src/modules',
      from: 'liteb',
      now: 1789779741336,
    }).files;

    expect(archivo.content).toContain('has no SQL yet');
  });

  it('y al negarse no deja rastro: vuelve a estar pendiente', async () => {
    class CreateUsers1000 implements MigrationInterface {
      public async up(runner: QueryRunner): Promise<void> {
        await runner.query(`
          -- what this migration creates
        `);
        throw new Error('CreateUsers1000 has no SQL yet: write it, or delete the file.');
      }
      public async down(): Promise<void> {}
    }

    const migrator = new ModuleMigrator(db);
    const modulos = [conMigracion(CreateUsers1000)];

    await expect(migrator.run(modulos)).rejects.toThrow(/has no SQL yet/);

    // Lo que importa: sigue pendiente. Si se hubiera anotado, escribir el SQL
    // después no habría servido de nada.
    expect(await migrator.pending(modulos)).toEqual([
      { module: 'users', name: 'CreateUsers1000' },
    ]);
  });

  it('sin el freno, una vacía queda anotada y ya no vuelve a correr', async () => {
    // Este es el comportamiento que hacía falta atajar, escrito como prueba
    // para que se vea por qué el andamiaje lanza.
    class Vacia1000 implements MigrationInterface {
      public async up(runner: QueryRunner): Promise<void> {
        await runner.query(`
          -- what this migration creates
        `);
      }
      public async down(): Promise<void> {}
    }

    const migrator = new ModuleMigrator(db);
    const modulos = [conMigracion(Vacia1000)];

    await migrator.run(modulos);

    expect(await migrator.pending(modulos)).toEqual([]);
  });
});
