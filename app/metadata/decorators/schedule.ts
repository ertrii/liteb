import { InternalException } from '../../utilities/exceptions';
import { CronMetadata } from '../interfaces/schedule-metadata';
import { CRON } from '../keys';
import { ScheduleOptions, validate } from 'node-cron';

/**
 * Creates a new task to execute the given function when the cron expression ticks.
 */
export function Cron(expression: string, options: ScheduleOptions = {}) {
  if (!validate(expression)) {
    throw new InternalException('Cron: invalid expression');
  }

  return function (
    target: any,
    key?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>,
  ) {
    const metadata: CronMetadata = { expression, options };
    Reflect.defineMetadata(CRON, metadata, target, key);
    return descriptor;
  };
}
