import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import { Seeder } from './templates';

export default class SeederModule {
  constructor(
    private dataSource: DataSource,
    private seeders: Array<new () => Seeder<any>>,
  ) {}

  public async make() {
    for (const Seeder of this.seeders) {
      const seeder = new Seeder();
      if (!seeder.Entity) {
        console.log('Se requiere el Entity Target');
      }
      const repository = this.dataSource.getRepository(seeder.Entity);
      console.log(`[${repository.metadata.name}] Seeding... 0/${seeder.count}`);
      let countDones = 0;
      try {
        for (let i = 0; i < seeder.count; i++) {
          const entity = seeder.define(faker);
          await repository.save(entity);
          countDones++;
          console.log(
            `[${repository.metadata.name}] Seeding... ${countDones}/${seeder.count}`,
          );
        }
        console.log(`[${repository.metadata.name}] Seed ${countDones} done!`);
      } catch (error) {
        const err = error as Error;
        console.error(
          `[${repository.metadata.name}] ${err.message} ${countDones}/${seeder.count}`,
        );
      }
    }
  }
}
