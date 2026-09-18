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
    "dev": "nodemon --watch src --ext ts --exec \\"ts-node -r tsconfig-paths/register src/index.ts\\"",
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
    "tsconfig-paths": "^4.2.0",
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
    // \`@/billing/contracts/x.contract\` instead of
    // \`../../billing/contracts/x.contract\`. A module only ever imports
    // another module's TOKENS, and those are the deep paths.
    //
    // A path alias is compile-time only: \`tsc\` checks it and then emits it
    // verbatim, which Node does not understand. \`liteb build\` rewrites them
    // to relative paths, and \`npm run dev\` resolves them with
    // tsconfig-paths. Change this and change the dev script with it.
    "baseUrl": ".",
    "paths": { "@/*": ["${modulesDir}/*"] },
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

    // Who may call this API from a browser. \`credentials\` sends and accepts
    // cookies, which a session needs — and which forces an explicit list: a
    // browser refuses \`*\` on a request that carries them.
    cors: {
      origin: (ConfigService.get('CORS_ORIGIN') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      credentials: true,
    },

    // How a request becomes an actor. OPTIONAL: an endpoint that never reads
    // \`this.auth\` needs no resolver, and a plain API works without this.
    //
    // Uncomment it together with the \`this.auth.assert(...)\` line your
    // endpoints carry commented out — asserting with no resolver is a
    // configuration error, not a 401, and answers 500 on purpose.
    //
    // auth: async (request, { db, get }) => {
    //   const userId = Number(request.headers['x-user']);
    //   if (!userId) return null;              // anonymous: 401 where asserted
    //   // \`*\` grants everything; real ones are the keys your modules declare.
    //   return { actor: { userId }, permissions: ['*'] };
    // },
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

# Origins allowed to call this API from a browser, comma separated. Exact,
# with scheme and port. Empty means no browser may.
CORS_ORIGIN=http://localhost:5173

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

  const permissionTypes = `import type { PermissionsOf } from 'liteb';

/**
 * Every permission key the installed modules declare, taught to the compiler.
 *
 * With a module listed here, \`this.auth.assert('tasks.manage')\` is a plain
 * string that TypeScript CHECKS: misspell it and the build fails, instead of
 * the framework answering 500 on the first request that reaches the line.
 *
 * Each module still declares its own keys, with their labels, in its own
 * \`permissions.ts\`. This file only carries those spellings into the type
 * system, and \`liteb create module\` appends a block per module — interface
 * merging joins them, so nothing here ever has to be reopened.
 *
 * Empty, every string is accepted and the run-time check is the only net.
 *
 * The import above is what the blocks extend — an interface may only extend an
 * identifier, so it cannot be inlined — and it is also what makes this file a
 * module, which \`declare global\` requires. Until the first module is added it
 * looks unused; that is expected.
 *
 * @example
 * declare global {
 *   namespace LitebAuth {
 *     interface Permissions
 *       extends PermissionsOf<
 *         typeof import('../modules/tasks/permissions').permissions
 *       > {}
 *   }
 * }
 */
`;

  return plan(
    [
      { path: 'package.json', content: pkg },
      { path: 'tsconfig.json', content: tsconfig },
      { path: '.gitignore', content: ignore },
      { path: '.env', content: env },
      { path: '.env.template', content: env.replace(/=.+$/gm, '=') },
      { path: 'src/index.ts', content: index },
      { path: 'src/config/permissions.ts', content: permissionTypes },
    ],
    [],
    [
      `Fill in .env (the database has to exist; liteb creates tables, not databases).`,
      // `npx liteb` without a version resolves the `latest` tag, which is a
      // different major with a different CLI. Inside the project it is the
      // local install that answers, so no version is needed here.
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
