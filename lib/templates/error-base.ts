import { HttpStatus } from '../interfaces/http-status';
import { TypeError } from '../interfaces/type-error';

export abstract class ErrorBase {
  abstract type: TypeError;
  abstract status: HttpStatus;
  public response: any = null;
  path: string = null;

  constructor(
    public message: string,
    public fieldsError: Record<string, string> = {},
  ) {}
}
