import { DataSource } from 'typeorm';
import { CRON, CronMetadata } from '../decorators/cron.decorator';
import cron from 'node-cron';
import { Routine } from '../templates/routine';
import type { Container } from '../modules/container';
import type { EventBus } from '../modules/events';

export default class InterpreterRoutine {
  private options: cron.ScheduleOptions;
  private expression: string;
  private valid: boolean = false;
  private started = false;

  private readCron() {
    if (typeof this.RoutineClass !== 'function') return;
    const metadata = Reflect.getMetadata(
      CRON,
      this.RoutineClass,
    ) as CronMetadata;
    if (metadata) {
      this.options = metadata.options;
      this.expression = metadata.expression;
      this.valid = true;
    }
  }

  constructor(
    private RoutineClass: new () => Routine,
    private dbSource: DataSource,
    private container?: Container,
    private eventBus?: EventBus,
  ) {
    this.readCron();
  }

  public start = (): cron.ScheduledTask | undefined => {
    if (this.started) return;
    this.started = true;
    this.RoutineClass.prototype.db = this.dbSource;
    this.RoutineClass.prototype.container = this.container;
    this.RoutineClass.prototype.events = this.eventBus;
    const routine = new this.RoutineClass();
    return cron.schedule(
      this.expression,
      (now) => routine.start(now),
      this.options,
    );
  };

  public isInvalid = () => !this.valid;
}
