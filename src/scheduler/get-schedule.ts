import { getTask } from '../metadata/services/schedule';
import { Type } from '../interfaces/type';
import { InternalException } from '../utilities/exceptions';

export function getSchedule<T>(Schedule: Type<T>) {
  function error() {
    return new InternalException('Not found task or is not referenced by cron');
  }

  function start(taskName: keyof T) {
    const task = getTask(Schedule.prototype, taskName as string);
    if (!task) throw error();
    task.start();
  }

  function stop(taskName: keyof T) {
    const task = getTask(Schedule.prototype, taskName as string);
    if (!task) throw error();
    task.start();
  }

  return {
    start,
    stop,
  };
}
