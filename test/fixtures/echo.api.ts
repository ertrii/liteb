import { IsString } from 'class-validator';
import { Api, Get, Module, Query } from '../../lib';

export class EchoQueryDto {
  @IsString()
  value: string;

  @IsString()
  delay: string;
}

/**
 * Returns the `value` it received, after waiting `delay` ms. The delay lets us
 * overlap two requests on purpose to verify that state is PER INSTANCE and not
 * per prototype (shared-state regression).
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
