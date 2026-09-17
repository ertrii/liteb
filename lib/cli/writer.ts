import fs from 'fs';
import path from 'path';
import { CliError } from './names';
import { FileEdit, Plan } from './plan';

export interface WriteOptions {
  /** Project root every path in the plan is relative to. */
  root: string;
  /** Overwrites files that already exist. Off by default. */
  force?: boolean;
}

export interface WriteResult {
  created: string[];
  edited: string[];
  /** Edits that did not apply, turned into instructions. */
  hints: string[];
}

/**
 * Writes a plan.
 *
 * It refuses to overwrite anything unless asked, and it checks EVERY file
 * before writing the first one: a generator that half-creates a module leaves
 * the author reconstructing what it did.
 */
export function apply(target: Plan, options: WriteOptions): WriteResult {
  const absolute = (file: string) => path.resolve(options.root, file);

  if (!options.force) {
    const existing = target.files.filter((file) => fs.existsSync(absolute(file.path)));
    if (existing.length > 0) {
      throw new CliError(
        `Already there: ${existing.map((file) => file.path).join(', ')}. Use --force to overwrite.`,
      );
    }
  }

  const created: string[] = [];
  for (const file of target.files) {
    const full = absolute(file.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content, 'utf8');
    created.push(file.path);
  }

  const edited: string[] = [];
  const hints = [...target.hints];
  for (const edit of target.edits) {
    const full = absolute(edit.path);
    if (!fs.existsSync(full)) {
      hints.push(describe(edit));
      continue;
    }
    const before = fs.readFileSync(full, 'utf8');
    const after = applyEdit(before, edit);
    if (after === null) {
      hints.push(describe(edit));
      continue;
    }
    if (after !== before) {
      fs.writeFileSync(full, after, 'utf8');
      edited.push(edit.path);
    }
  }

  return { created, edited, hints };
}

/**
 * Applies one edit, or answers `null` when the file does not look the way the
 * edit expects.
 *
 * Returning `null` rather than guessing is the whole policy: these edits only
 * ever run against shapes the module template itself produced, and a manifest
 * somebody rewrote by hand gets an instruction instead of a mangled file.
 */
export function applyEdit(source: string, edit: FileEdit): string | null {
  if (edit.append !== undefined) {
    if (source.includes(edit.append)) return source;
    // The empty index carries `export {}` so it is a module at all; the first
    // real export replaces it.
    const cleaned = source.replace(/^export \{\};\r?\n/m, '');
    const separator = cleaned.endsWith('\n') || cleaned.length === 0 ? '' : '\n';
    return `${cleaned}${separator}${edit.append}\n`;
  }

  if (edit.uncomment !== undefined) {
    const lines = source.split('\n');
    const index = lines.findIndex(
      (line) => line.trim() === `// ${edit.uncomment}` || line.trim() === `//${edit.uncomment}`,
    );
    if (index === -1) {
      // Already uncommented is a success, not a failure.
      return lines.some((line) => line.includes(edit.uncomment as string))
        ? source
        : null;
    }
    const indent = lines[index].match(/^\s*/)?.[0] ?? '';
    lines[index] = `${indent}${edit.uncomment}`;
    return lines.join('\n');
  }

  if (edit.arrayEntry) {
    const { field, value, importLine } = edit.arrayEntry;
    const pattern = new RegExp(`(\\b${field}\\s*:\\s*\\[)([^\\]]*)(\\])`);
    const match = source.match(pattern);
    if (!match) return null;

    const current = match[2].trim();
    if (new RegExp(`\\b${value}\\b`).test(current)) return source;

    const filled = current
      ? `${match[1]}${match[2].replace(/\s*$/, '')}, ${value}${match[3]}`
      : `${match[1]}${value}${match[3]}`;
    const withEntry = source.replace(pattern, filled);

    return withImport(withEntry, importLine);
  }

  return null;
}

/** Adds an import after the last one already there. */
function withImport(source: string, importLine: string): string {
  if (source.includes(importLine)) return source;
  const lines = source.split('\n');
  let last = -1;
  lines.forEach((line, index) => {
    if (line.startsWith('import ')) last = index;
  });
  if (last === -1) return `${importLine}\n${source}`;
  lines.splice(last + 1, 0, importLine);
  return lines.join('\n');
}

function describe(edit: FileEdit): string {
  if (edit.append) return `Add to ${edit.path}: ${edit.append}`;
  if (edit.uncomment) return `Add to ${edit.path}: ${edit.uncomment}`;
  if (edit.arrayEntry) {
    return `Add ${edit.arrayEntry.value} to "${edit.arrayEntry.field}" in ${edit.path}, and its import.`;
  }
  return `Check ${edit.path}.`;
}
