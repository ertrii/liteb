import { Api, Module, Post, Body } from '../../../../lib';
import { CreateUser } from '../dto/create-user.dto';
import { User } from '../entities/user.entity';

@Module('users')
@Post()
@Body(CreateUser)
export class CreateUserApi extends Api<null, CreateUser> {
  private readonly userRep = this.db.getRepository(User);
  async main() {
    const user = new User();
    user.fullName = this.body.fullName;
    user.email = this.body.email;
    user.username = this.body.username;
    return this.userRep.save(user);
  }
}
