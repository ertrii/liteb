import { NextFunction, Request, Response } from 'express';

export interface ExecutionContext {
  switchToHttp: () => {
    getRequest: () => Request;
    getResponse: () => Response;
    getNext: () => NextFunction;
  };
}

export interface Guard {
  canActive(context: ExecutionContext): boolean | Promise<boolean>;
}
