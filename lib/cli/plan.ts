/**
 * What a generator produces, before anything touches the disk.
 *
 * Generators are pure: they answer "what should exist" and nothing else. The
 * writer is the only part that can fail on permissions, overwrite something or
 * print. That split is what makes the templates testable — a test asserts on
 * the text, and the same text is what gets written.
 */
export interface GeneratedFile {
  /** Path relative to the project root. */
  path: string;
  content: string;
}

/**
 * A change to a file the generator did not write.
 *
 * Only the edits that can be made without parsing TypeScript: appending a line,
 * uncommenting one the module template itself left there, adding an entry to an
 * array literal. Anything less certain than that is a hint instead — a
 * scaffolder that silently mangles a file people already wrote is worse than
 * one that tells them what to add.
 */
export interface FileEdit {
  path: string;
  /** Adds the line at the end, unless it is already there. */
  append?: string;
  /** Uncomments the line containing this fragment (`// tasks: ...`). */
  uncomment?: string;
  /** Adds a value to an array literal field, plus the import it needs. */
  arrayEntry?: {
    /** The field holding the array, e.g. `entities`. */
    field: string;
    /** What to add, e.g. `Product`. */
    value: string;
    /** The import that makes it resolve. */
    importLine: string;
  };
}

export interface Plan {
  files: GeneratedFile[];
  edits: FileEdit[];
  /** What the author still has to do by hand, in plain words. */
  hints: string[];
}

export const plan = (
  files: GeneratedFile[],
  edits: FileEdit[] = [],
  hints: string[] = [],
): Plan => ({ files, edits, hints });
