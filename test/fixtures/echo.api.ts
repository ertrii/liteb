import { IsString } from 'class-validator';
import { Api, Get, Module, Query } from '../../lib';

export class EchoQueryDto {
  @IsString()
  value: string;

  @IsString()
  delay: string;
}

/**
 * Devuelve el `value` que recibió, tras esperar `delay` ms. El retardo permite
 * solapar dos peticiones a propósito para verificar que el estado es POR
 * INSTANCIA y no por prototype (regresión de estado compartido).
 */
@Module('eco')
@Get('')
@Query(EchoQueryDto)
export class EchoApi extends Api<null, null, EchoQueryDto> {
  async main() {
    await new Promise((resolve) => setTimeout(resolve, Number(this.query.delay)));
    return { value: this.query.value };
  }
}
