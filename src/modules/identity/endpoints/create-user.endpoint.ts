import {
  Body,
  CustomerError,
  Endpoint,
  HttpPost,
  HttpStatus,
  Group,
} from '../../../../lib';
import { permissions } from '../permissions';
import { CreateUserDto } from '../dto/create-user.dto';
import { User } from '../entities/user.entity';
import { hashPassword } from '../services/password';

@Group('users')
@HttpPost()
@Body(CreateUserDto)
export class CreateUserEndpoint extends Endpoint<null, CreateUserDto> {
  private readonly users = this.db.getRepository(User);

  async main() {
    this.auth.assert(permissions['users.manage']);

    const taken = await this.users.existsBy({ username: this.body.username });
    if (taken) {
      throw new CustomerError('That username is taken.', {
        username: 'Already in use',
      });
    }

    const user = await this.users.save(
      this.users.create({
        username: this.body.username,
        fullName: this.body.fullName,
        password: hashPassword(this.body.password),
        role: this.body.role,
      }),
    );

    this.httpStatus = HttpStatus.CREATED;
    return { id: user.id, username: user.username, role: user.role };
  }
}
