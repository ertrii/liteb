import {
  Api,
  ErrorResponse,
  ErrorType,
  Get,
  Module,
  Priority,
} from '../../../../lib';
import { User } from '../entities/user.entity';

@Module('users')
@Get('all')
@Priority(2)
export class GetUsersApi extends Api {
  private readonly userRep = this.db.getRepository(User);

  public previous(): void | Promise<void> {
    console.log('Loading...');
  }

  async main() {
    const users = await this.userRep.find();
    return users;
  }

  public error(error: ErrorType): ErrorResponse {
    console.log(error);
  }

  public final(): void | Promise<void> {
    console.log('Final');
  }
}
