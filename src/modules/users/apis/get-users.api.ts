import { Api, Get } from '../../../../lib';
import { User } from '../entities/user.entity';

@Get('all')
export class GetUsersApi extends Api {
  private readonly userRep = this.db.getRepository(User);
  async main() {
    const users = await this.userRep.find();
    return users;
  }
}
