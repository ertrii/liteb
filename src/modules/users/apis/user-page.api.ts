import { Api, DataJson, Get, Module, Priority, View } from '../../../../lib';

@Module('users')
@Get('/page')
@View('page-user')
@Priority(1)
export class UsePageApi extends Api {
  public main(): DataJson | Promise<DataJson> {
    return {
      message: 'Hello, this is a test',
    };
  }
}
