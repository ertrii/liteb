import { Api, Module, Get } from '../../../../lib';
import { GetUserDto } from '../dto/get-user.dto';
import { User } from '../entities/user.entity';

@Module('users')
@Get(':user_id')
export class GetUserApi extends Api<GetUserDto> {
  userRep = this.db.getRepository(User);
  main() {
    const userId = +this.params.user_id;
    return this.userRep.findOneBy({ id: userId });
  }
}
