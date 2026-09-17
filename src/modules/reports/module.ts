import { defineModule } from '../../../lib';
import { UserDirectory } from '../identity/module';
import { ProductCatalog } from '../catalog/module';

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
  // instead of a 500 on whichever request happened to need it first.
  consumes: [UserDirectory, ProductCatalog],

  routes: './apis/*.api.ts',
  tasks: './tasks/*.task.ts',
  listeners: './listeners/*.listener.ts',

  permissions: [{ key: 'reports.view', label: 'View reports' }],
});
