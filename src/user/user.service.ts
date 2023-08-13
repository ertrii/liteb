import { getRepository } from '@app';
import { User } from './entities/user.entity';

export class UserService {
  private readonly rep = getRepository(User);

  findAll() {
    return this.rep.find();
  }

  findOne(userId: number) {
    return this.rep.findOne({
      where: {
        id: userId,
      },
    });
  }

  delete(id: number) {
    return this.rep.delete(id);
  }
}
