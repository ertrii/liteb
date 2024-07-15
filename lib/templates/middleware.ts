import { Request } from 'express';

export abstract class Middleware {
  public request: Request;

  public abstract canContinue(): void;
}
