import { IsString } from 'class-validator';
import { Api, Body, Module, NotFoundError, HttpPost } from '../../lib';

export class CreateBodyDto {
  @IsString()
  name: string;
}

@Module('clientes')
@HttpPost('')
@Body(CreateBodyDto)
export class CreateCustomerApi extends Api<null, CreateBodyDto> {
  main() {
    return { created: this.body.name };
  }
}

/** Throws a domain error: it must come out mapped to 404 by ErrorControl. */
@Module('clientes')
@HttpPost('falla')
export class FailingApi extends Api {
  main(): never {
    throw new NotFoundError('cliente no existe');
  }
}
