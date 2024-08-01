import dbSource from 'config/db-source';
import { Example } from './entities/example.entity';

export class ExampleService {
  private readonly rep = dbSource.getRepository(Example);

  findAll() {
    return [];
  }

  findOne() {
    return null;
  }

  create() {
    return null;
  }

  update() {
    return null;
  }

  delete(id: number) {
    return this.rep.delete(id);
  }
}
