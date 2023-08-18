import fs from 'fs';
import path from 'path';

type Service = 'typeorm';

interface ConfigValues {
  dir: string;
  version: number;
  services: Service[];
}

export default function Config(): ConfigValues {
  const initialConfig: ConfigValues = {
    dir: 'src',
    version: 1,
    services: [],
  };

  try {
    const configStringJson = fs.readFileSync(
      `${path.resolve()}/liteb.json`,
      'utf-8',
    );

    const configValues = JSON.parse(configStringJson) as Partial<ConfigValues>;

    return {
      ...initialConfig,
      ...configValues,
    };
  } catch (error) {
    return initialConfig;
  }
}
