import { ClassController } from '../server/types';
import { ControllerMetadata } from './interfaces/controller-metadata';
import controllerConstructorMetadata from './constructors/controller-constructor-metadata';
import { ScheduleMetadata } from './interfaces/schedule-metadata';
import { ClassSchedule } from '../scheduler/types';
import scheduleConstructorMetadata from './constructors/schedule-constructor-metadata';

type TypeClass = 'controller' | 'schedule';
type Metadata<T extends TypeClass> = T extends 'controller'
  ? ControllerMetadata
  : ScheduleMetadata;

export default function metadata<T extends TypeClass>(
  type: T,
  ClassType: ClassController | ClassSchedule,
): Metadata<T> {
  if (type === 'controller') {
    return controllerConstructorMetadata(ClassType) as Metadata<T>;
  } else {
    return scheduleConstructorMetadata(ClassType) as Metadata<T>;
  }
}
