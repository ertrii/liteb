import { Api, Get, Module } from '../../../../lib';
import { User } from '../entities/user.entity';

@Module('users')
@Get('all')
export class GetUsersApi extends Api {
  private readonly userRep = this.db.getRepository(User);
  async main() {
    const users = await this.userRep.find();
    return users;
  }
}
