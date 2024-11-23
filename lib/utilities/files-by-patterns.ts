import path from 'path';
import * as glob from 'glob';

/**
 * Importa archivo por patrón. No use export default es sus archivos.
 * @param pattern /path/**.file.ts/example.ts
 */
export function fileByPattern<T>(pattern: string): T[] {
  // Obtener la ruta absoluta del directorio actual
  const currentDir = path.resolve();

  // Obtener la ruta absoluta de los archivos que coinciden con el patrón
  const matchedFiles = glob.sync(pattern);

  // Importar los archivos encontrados
  return matchedFiles.map((file: string) => {
    const filePath = path.join(currentDir, file);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const firstExport = Object.values(require(filePath))[0];
    return firstExport as T;
  });
}

/**
 * Importa archivos por patrones y entrega el primer export . No use export default es sus archivos.
 * @param patterns [/path/**.file.ts/example.ts]
 */
export default function filesByPatterns<T>(patterns: string[]) {
  return patterns.map((pattern) => fileByPattern<T>(pattern)).flat();
}
