import { ClassSchedule } from '../../scheduler/types';
import { ScheduleOptions } from 'node-cron';

export interface CronMetadata {
  expression: string;
  options: ScheduleOptions;
}

export interface ScheduleMethod {
  func: () => void;
  name: string;
  metadata: {
    cron: CronMetadata;
  };
}

export interface ScheduleMetadata {
  methods: ScheduleMethod[];
  name: string;
  Schedule: ClassSchedule;
}
