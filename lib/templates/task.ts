import { Routine } from './routine';

/**
 * "Task" is the most common noun in business software — a work order, a case,
 * a to-do — and a framework has no business taking the word: an application
 * with a `Task` entity had to alias one of the two in every file that used
 * both. The class is now {@link Routine}, which names the work without
 * claiming a domain word and without promising a queue the way `Job` would.
 *
 * Kept working while applications move, and goes away in 2.0 final.
 */

/** @deprecated Renamed to {@link Routine}. */
export { Routine as Task } from './routine';
