import { execFileSync } from 'child_process';
import { CliError, toKebab } from './names';
import { plan, Plan } from './plan';

/**
 * `liteb init` — a project that runs.
 *
 * The pieces are small but there are enough of them to get one wrong and spend
 * an evening on it: decorators need two compiler flags, an entity breaks under
 * `strictPropertyInitialization`, the application's own version is what each
 * module's `engine` is checked against. None of that is interesting, and all of
 * it is the same every time.
 */

export interface InitOptions {
  /** Project name. Also the folder, when it is not the current one. */
  name: string;
  /** Version of liteb to depend on. */
  litebVersion: string;
  /** Where modules will live. */
  modulesDir?: string;
}

export function createProject(options: InitOptions): Plan {
  const name = toKebab(options.name);
  if (!name) throw new CliError('A project needs a name: liteb init <name>.');

  const modulesDir = options.modulesDir ?? 'src/modules';

  const pkg = `{
  "name": "${name}",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "nodemon --watch src --ext ts --exec ts-node src/index.ts",
    "build": "liteb build",
    "start": "node build/index.js"
  },
  "dependencies": {
    "class-validator": "^0.14.0",
    "express": "^4.18.2",
    "liteb": "${options.litebVersion}",
    "pg": "^8.11.2",
    "reflect-metadata": "^0.1.13",
    "typeorm": "^0.3.17"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "nodemon": "^3.1.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.0"
  }
}
`;

  const tsconfig = `{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "moduleResolution": "Node",
    "rootDir": "src",
    "outDir": "build",
    "strict": true,
    // TypeORM entities and validated DTOs declare fields the constructor never
    // assigns: the ORM fills them. With this on, every one of them is an error.
    "strictPropertyInitialization": false,
    // What makes the decorators work. Removing either one turns every route
    // and every entity into a silent no-op.
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
`;

  const index = `import { ConfigService, Liteb } from 'liteb';

/**
 * The application: a database, the modules it is made of, and how a request
 * becomes whoever is behind it.
 *
 * Exported so a test or a script can build it without starting a server.
 */
export async function createApp() {
  return Liteb.create({
    db: {
      type: 'postgres',
      host: ConfigService.get('DB_HOST'),
      port: +ConfigService.get('DB_PORT'),
      username: ConfigService.get('DB_USERNAME'),
      password: ConfigService.get('DB_PASSWORD'),
      database: ConfigService.get('DB_NAME'),
      // Off on purpose: every table comes from a module's own migration,
      // which is what an installation does.
      synchronize: false,
    },

    // \`liteb create module <name>\` registers it here.
    modules: [],

    // THIS application's version — what each module's \`engine\` range is
    // checked against. It is not liteb's version.
    version: '1.0.0',

    basePath: '/api',

    // How a request becomes an actor. Until there is one, \`this.auth\` is
    // anonymous and reading \`this.auth.actor\` is an error.
    // auth: async (request, { db, get }) => ({ actor: { userId: 1 }, permissions: [] }),
  });
}

async function main() {
  const app = await createApp();
  await app.start(+ConfigService.get('SERVER_PORT') || 3000);
}

// Importing this file must not start a server.
if (require.main === module) void main();
`;

  const env = `SERVER_PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=
DB_NAME=${name.replace(/-/g, '_')}
`;

  const ignore = `node_modules
build
.env
logs
*.log
`;

  return plan(
    [
      { path: 'package.json', content: pkg },
      { path: 'tsconfig.json', content: tsconfig },
      { path: '.gitignore', content: ignore },
      { path: '.env', content: env },
      { path: '.env.template', content: env.replace(/=.+$/gm, '=') },
      { path: 'src/index.ts', content: index },
    ],
    [],
    [
      `Fill in .env (the database has to exist; liteb creates tables, not databases).`,
      `Create your first module: npx liteb create module <name>${
        modulesDir === 'src/modules' ? '' : ` --dir ${modulesDir}`
      }`,
      `Then: npm run dev`,
    ],
  );
}

/**
 * Installs the dependencies of the project just created.
 *
 * `shell: true` because on Windows `npm` is a `.cmd`, and spawning one from a
 * modern Node without a shell fails with EINVAL. The arguments are fixed, so
 * there is nothing here for a shell to reinterpret.
 */
export function install(cwd: string): void {
  try {
    execFileSync('npm', ['install'], { cwd, stdio: 'inherit', shell: true });
  } catch {
    throw new CliError(
      'npm install failed. The project is written: fix the error above and run it yourself.',
    );
  }
}
