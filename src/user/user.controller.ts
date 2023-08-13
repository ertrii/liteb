import { Controller, Get, Param, Post, Delete } from '@app';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  private readonly userService = new UserService();

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':user_id')
  findOne(@Param('user_id') userId: string) {
    return this.userService.findOne(+userId);
  }

  @Post()
  create() {
    return null;
  }

  @Delete(':user_id')
  delete(@Param('user_id') userId: string) {
    return this.userService.delete(+userId);
  }
}
