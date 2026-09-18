import { defineModule } from '../../../lib';
import { UserDirectory } from '@/identity/contracts/user-directory.contract';
import { ProductCatalog } from '@/catalog/contracts/product-catalog.contract';
import { permissions } from './permissions';

/**
 * The optional one. Not `core`, so it INSTALLS DISABLED: an update must not
 * light up screens nobody asked for. Turn it on with `ModuleStore.enable()`
 * (see `src/demo.http`) and restart.
 */
export default defineModule({
  id: 'reports',
  version: '1.0.0',
  label: 'Reports',
  engine: '^2.0.0',
  dir: __dirname,

  requires: ['identity', 'catalog'],

  // Declaring what it calls turns a missing provider into a refusal to start,
  // instead of a 500 on whichever request happened to need it first. This is a
  // declaration, not logic, which is why it belongs here — what FILLS catalog's
  // extension point is a class in ./providers.
  consumes: [UserDirectory, ProductCatalog],

  permissions,
});
