import { Api, HttpGet, Module } from '../../../../lib';
import { Category } from '../entities/category.entity';

@Module('categories')
@HttpGet('all')
export class GetCatoriesApi extends Api {
  private readonly categoryRep = this.db.getRepository(Category);

  main() {
    return this.categoryRep.find();
  }
}
