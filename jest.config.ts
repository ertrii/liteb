import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
// import compilerOptions from './tsconfig.json';

const config: Config = {
  preset: 'ts-jest',
  verbose: true,
  transform: {
    '\\.[jt]sx?$': 'babel-jest',
  },
  moduleNameMapper: pathsToModuleNameMapper({
    '@shared/*': ['shared/*'],
    '@definitions': ['definitions/index.ts'],
    liteb: ['app/index.ts'],
  }),
  modulePaths: ['<rootDir>'],
};

export default config;
