import { defineModule } from '../../../lib';
import { Category } from './entities/category.entity';

export default defineModule({
  id: 'categories',
  version: '1.0.0',
  label: 'Categories',
  dir: __dirname,
  entities: [Category],
  routes: './apis/*.api.ts',
  permissions: [{ key: 'categories.view', label: 'View categories' }],
});
