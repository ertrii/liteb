import { defineModule } from '../../../lib';
import { permissions } from './permissions';

/**
 * Identity: who the people are.
 *
 * Note what a manifest is: where the pieces are wired, and nothing else. No
 * paths, because the folders are the standard layout, and no implementation,
 * because that lives in `providers/`.
 */
export default defineModule({
  id: 'identity',
  version: '1.0.0',
  label: 'Identity',
  // Core: it cannot be turned off. Nothing else would have anyone to serve.
  core: true,
  engine: '^2.0.0',
  // Where this module lives. Everything liteb finds by itself is found from
  // here; without it there is nothing to resolve against.
  dir: __dirname,

  // The vocabulary this module can gate, declared in ./permissions.ts.
  permissions,
});
