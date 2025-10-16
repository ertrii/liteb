import { DataSource } from 'typeorm';
import { SCHEDULE, ScheduleMetadata } from '../decorators/schedule.decorator';
import cron from 'node-cron';
import { Task } from '../templates/task';

export default class InterpreterTask {
  private options: cron.ScheduleOptions;
  private expression: string;
  private valid: boolean = false;
  private started = false;

  private readSchedule() {
    const metadata = Reflect.getMetadata(
      SCHEDULE,
      this.TaskClass,
    ) as ScheduleMetadata;
    if (metadata) {
      this.options = metadata.options;
      this.expression = metadata.expression;
      this.valid = true;
    }
  }

  constructor(
    private TaskClass: new () => Task,
    private dbSource: DataSource,
  ) {
    this.readSchedule();
  }

  public start = () => {
    if (this.started) return;
    this.started = true;
    this.TaskClass.prototype.db = this.dbSource;
    const task = new this.TaskClass();
    task.start.bind(task);
    cron.schedule(this.expression, (now) => task.start(now), this.options);
  };

  public isInvalid = () => !this.valid;
}
