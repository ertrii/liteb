import { IsString } from 'class-validator';
import { Api, Body, Module, NotFoundError, Post } from '../../lib';

export class CreateBodyDto {
  @IsString()
  name: string;
}

@Module('clientes')
@Post('')
@Body(CreateBodyDto)
export class CreateCustomerApi extends Api<null, CreateBodyDto> {
  main() {
    return { created: this.body.name };
  }
}

/** Lanza un error de dominio: debe salir mapeado a 404 por ErrorControl. */
@Module('clientes')
@Post('falla')
export class FailingApi extends Api {
  main(): never {
    throw new NotFoundError('cliente no existe');
  }
}
