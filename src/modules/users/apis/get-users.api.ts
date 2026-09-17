import { Endpoint, HttpGet, Module, Priority } from '../../../../lib';
import { User } from '../entities/user.entity';

@Module('users')
@HttpGet('all')
@Priority(2)
export class GetUsersApi extends Endpoint {
  private readonly userRep = this.db.getRepository(User);

  public previous(): void | Promise<void> {
    // Runs before main(), with the request state already in place.
    console.log('Loading...');
  }

  async main() {
    const users = await this.userRep.find();
    return users;
  }
}
