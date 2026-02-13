import {
  Api,
  DataJson,
  Get,
  Module,
  Priority,
  Template,
} from '../../../../lib';

@Module('users')
@Get('/page')
@Template('page-user')
@Priority(1)
export class UsePageApi extends Api {
  public main(): DataJson | Promise<DataJson> {
    return {
      message:
        'Hello, this is a test. Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quod.',
    };
  }
}
