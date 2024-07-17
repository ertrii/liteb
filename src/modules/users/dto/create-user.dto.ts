import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUser {
  @IsString()
  @IsNotEmpty({ message: 'Fullname required' })
  fullName: string;
  @IsString()
  @IsNotEmpty({ message: 'Username required' })
  username: string;
  @IsString()
  @IsNotEmpty({ message: 'Email required' })
  email: string;
}
