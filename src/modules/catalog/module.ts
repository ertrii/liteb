import { defineModule } from '../../../lib';
import { permissions } from './permissions';

/**
 * Catalog: products and their stock.
 *
 * What it publishes is in `contracts/`, `events/` and `slots/`; how it answers
 * is in `providers/`. None of it is named here, which is what leaves the
 * manifest saying only what is particular to this module.
 */
export default defineModule({
  id: 'catalog',
  version: '1.0.0',
  label: 'Catalog',
  core: true,
  engine: '^2.0.0',
  dir: __dirname,

  // Declared, and checked at boot: catalog refuses to start without identity.
  requires: ['identity'],

  // Declared in ./permissions.ts, so the keys have one home.
  permissions,
});
