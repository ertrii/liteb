import { defineModule } from '../../../lib';
import { UserDirectory } from '../users/module';

/**
 * Depends on users, and says so: it consumes the contract instead of importing
 * anything from that module.
 */
export default defineModule({
  id: 'crm',
  version: '1.0.0',
  label: 'CRM',
  dir: __dirname,
  requires: ['users'],
  consumes: [UserDirectory],
  routes: './apis/*.api.ts',
});
