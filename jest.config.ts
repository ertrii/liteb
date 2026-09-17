import type { Config } from 'jest';

/**
 * ts-jest puro: el framework es decorator-driven, así que la transformación
 * DEBE honrar `experimentalDecorators` y `emitDecoratorMetadata` del
 * tsconfig. Transformar con babel-jest rompería los decoradores.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  /**
   * Lo que genera el CLI importa `liteb` como lo haría un proyecto consumidor.
   * Sin esto, la prueba tendría que generar rutas relativas y dejaría de
   * probar el caso real.
   */
  moduleNameMapper: { '^liteb$': '<rootDir>/lib' },
  setupFiles: ['<rootDir>/test/setup.ts'],
  /**
   * Los 5s por defecto alcanzaban hasta que las suites que levantan PGlite
   * pasaron a competir por CPU entre workers: un `beforeAll` que arma la base,
   * corre migraciones y arranca la app tarda más que eso bajo carga, y fallaba
   * por tiempo, no por lógica. El límite sigue existiendo para atajar un
   * cuelgue de verdad.
   */
  testTimeout: 30000,
  verbose: true,
};

export default config;
