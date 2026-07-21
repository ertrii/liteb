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
  setupFiles: ['<rootDir>/test/setup.ts'],
  verbose: true,
};

export default config;
