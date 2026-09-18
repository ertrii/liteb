import { Provider, Provides } from '../../../../lib';
import { Grants } from '../contracts/grants.contract';

/** Lee de la base: prueba que `this.db` llega vivo al proveedor. */
@Provides(Grants)
export class GrantsProvider extends Provider implements Grants {
  public async forUser(userId: number): Promise<string[] | null> {
    const rows: Array<{ perms: string }> = await this.db.query(
      'select perms from permisos_demo where user_id = $1',
      [userId],
    );
    return rows.length > 0 ? rows[0].perms.split(',') : null;
  }
}
