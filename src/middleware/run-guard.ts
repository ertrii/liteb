import { ExecutionContext } from '../metadata/interfaces/guard-arguments';
import { GuardMetadata } from '../metadata/interfaces/guard-metadata';
import { ForbiddenException, InternalException } from '../utilities/exceptions';
import { NextFunction, Request, Response } from 'express';

export class GuardContext implements ExecutionContext {
  constructor(private args: [Request, Response, NextFunction]) {}

  switchToHttp() {
    const getRequest = () => this.args[0];
    const getResponse = () => this.args[1];
    const getNext = () => this.args[2];

    return {
      getRequest,
      getResponse,
      getNext,
    };
  }
}

export default async function runGuard(
  context: [Request, Response, NextFunction],
  metadata?: GuardMetadata,
) {
  if (!metadata) return null;
  const guard = new metadata.Guard();
  const guardContext = new GuardContext(context);
  try {
    const result = await guard.canActive(guardContext);
    if (!result) {
      return new ForbiddenException();
    }
  } catch (error) {
    return new InternalException(error);
  }
}
