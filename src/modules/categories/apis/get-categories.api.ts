import { Endpoint, HttpGet, Module } from '../../../../lib';
import { Category } from '../entities/category.entity';

@Module('categories')
@HttpGet('all')
export class GetCatoriesApi extends Endpoint {
  private readonly categoryRep = this.db.getRepository(Category);

  main() {
    return this.categoryRep.find();
  }
}
