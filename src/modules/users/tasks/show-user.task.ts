import { Schedule, Task } from '../../../../lib';
import { User } from '../entities/user.entity';

@Schedule('* * * * *')
export class ShowUserTask extends Task {
  userRep = this.db.getRepository(User);

  async start() {
    const users = await this.userRep.find();
    console.log(users);
  }
}
