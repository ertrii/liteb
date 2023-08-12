import { ClassSchedule } from '../../scheduler/types';
import {
  ScheduleMetadata,
  ScheduleMethod,
} from '../interfaces/schedule-metadata';
import { getCronMetadata } from '../services/schedule';

export default function scheduleConstructorMetadata(
  Schedule: ClassSchedule,
): ScheduleMetadata {
  const propertyDescriptors = Object.getOwnPropertyDescriptors(
    Schedule.prototype,
  );
  const schema = new Schedule();
  const methods: ScheduleMethod[] = [];
  Object.entries(propertyDescriptors).forEach(([key, descriptor]) => {
    if (key === 'constructor') return;
    if (typeof descriptor.value !== 'function') return;
    const metadataCron = getCronMetadata(schema, key);
    if (!metadataCron) return;
    methods.push({
      name: key,
      func: descriptor.value.bind(schema),
      metadata: {
        cron: metadataCron,
      },
    });
  });

  return {
    methods,
    name: '',
    Schedule,
  };
}
