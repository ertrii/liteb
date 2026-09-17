import { Endpoint, DataJson, HttpGet, Module } from '../../../../lib';
import { UserDirectory } from '../../users/module';

/**
 * Shows the point of contracts: CRM needs a number that belongs to users, and
 * gets it without importing anything from that module — only the contract.
 */
@Module('crm')
@HttpGet('resumen')
export default class SummaryApi extends Endpoint {
  public async main(): Promise<DataJson> {
    const users = this.get(UserDirectory);
    return { usuarios: await users.countUsers() };
  }
}
