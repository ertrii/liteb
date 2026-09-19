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
  // ts-node reads this. Without it the alias above type-checks and
  // \`npm run dev\` dies on the first import: \`paths\` is the compiler's
  // business and Node has never heard of \`@/\`. \`liteb build\` rewrites
  // them in the output, so the built app needs nothing.
  "ts-node": { "require": ["tsconfig-paths/register"] },
  "include": ["src"]
}
`;

  const index = `import { ConfigService, Liteb } from 'liteb';
import auth from './config/auth';

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

    // \`liteb module <name>\` registers it here.
    modules: [],

    // THIS application's version — what each module's \`engine\` range is
    // checked against. It is not liteb's version.
    version: '1.0.0',

    basePath: '/api',

    // Can this application serve? An unauthenticated 200/503 that a load
    // balancer, a container runtime or an uptime check reads. It answers 503
    // while the database does not, and while the app is shutting down — which
    // is what gives a balancer the window to stop sending traffic before the
    // process stops accepting it. Outside \`basePath\`, and kept out of the
    // access log so a probe every few seconds does not bury every real
    // request.
    // \`checks\` is where YOUR dependencies go: liteb only knows the process
    // and the database, and whether a queue, a provider or a warm cache has
    // to be up for this application to serve is something it cannot guess.
    //   checks: { queue: () => bridge.isConnected() },
    health: { path: '/health' },

    // Interactive docs at /docs, the raw OpenAPI 3 at /docs.json — generated
    // from the same decorators that mount the routes, so they cannot drift
    // from what the API does.
    //
    // Worth knowing: this publishes the full shape of your API to anyone who
    // finds the URL. Put it behind your own gate, or drop the option in
    // production, if that is not what you want.
    docs: {
      path: '/docs',
      info: { title: 'API', version: '1.0.0' },
    },

    // Rotating files in \`logs/\`: \`app.log\` with everything in one stream,
    // \`info\`/\`warn\`/\`error\` split out for grepping, and \`router.log\` — the
    // map of what answers where, in registration order, which is the fastest
    // answer to "why is my route a 404".
    //
    // This is only for moving the directory, renaming a file
    // (\`files: { error: 'errores' }\`) or dropping one
    // (\`files: { info: false }\`). \`dir: null\` writes none at all, which is
    // what a container wants: there the disk is not where anyone reads logs,
    // and the files go with the container.
    logs: { dir: 'logs' },

    // No option for the request id: it is always on. Every log line written
    // while serving a request carries it, and so does the error body and the
    // \`x-request-id\` response header. \`requestId: { header: '...' }\` only
    // changes which header carries it, for a gateway that sends its own.

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

    // How a request becomes whoever is behind it. See ./config/auth.ts — it
    // lets EVERYONE through, with every permission, so a new project answers
    // from the first request instead of 401ing at a resolver you have not
    // written yet. Replace it before this has users.
    auth,
  });
}

async function main() {
  const app = await createApp();
  await app.start(+ConfigService.get('SERVER_PORT') || 3000);
}

// Importing this file must not start a server.
if (require.main === module) void main();
`;

  const env = `NODE_ENV=development
SERVER_PORT=3000

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
 * system, and \`liteb module\` appends a block per module — interface
 * merging joins them, so nothing below ever has to be reopened.
 *
 * Empty, as it starts, every string is accepted and the run-time check is the
 * only net. It stops being empty with the first module.
 */
declare global {
  namespace LitebAuth {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Permissions extends PermissionsOf<{}> {}
  }
}
`;

  const authFile = `import type { AuthResolver } from 'liteb';
import { Logger } from 'liteb';

let warned = false;

/**
 * Turns a request into whoever is behind it. THIS ONE LETS EVERYONE THROUGH.
 *
 * It is here so a new project answers from the first request: \`this.auth\`
 * works, \`this.auth.assert(...)\` passes, the permission keys are checked by
 * the compiler, and nothing 401s at a resolver nobody has written yet. The
 * gate is in place and open. It is NOT authentication.
 *
 * Replace the body with how your application recognizes a caller — a session,
 * a bearer token, an API key — and return \`null\` when it recognizes nobody.
 * That \`null\` is what turns an assertion into a 401.
 *
 * \`db\` and \`get\` come in for exactly that: permissions are usually a query,
 * and \`get\` reaches a module's contract when this file must not import that
 * module's entities.
 *
 * Declare what an actor IS at the same time. liteb leaves it empty on purpose
 * — a user id, a tenant, an API key issued to an extension are all valid, and
 * a framework that picks one is a framework you fight later. Declared once,
 * \`this.auth.actor\` is typed in every endpoint and routine:
 *
 * @example
 * declare global {
 *   namespace LitebAuth {
 *     interface Actor {
 *       userId: number;
 *     }
 *   }
 * }
 *
 * const auth: AuthResolver = async (request, { db }) => {
 *   const userId = request.session?.userId;
 *   if (!userId) return null;
 *   const user = await db.getRepository(User).findOneBy({ id: userId });
 *   if (!user) return null;
 *   return { actor: { userId }, permissions: PERMISSIONS_BY_ROLE[user.role] };
 * };
 */
const auth: AuthResolver = async () => {
  if (!warned) {
    warned = true;
    Logger.warn(
      'Everyone is allowed: src/config/auth.ts still grants every permission to every request.',
    );
  }

  return {
    // Nobody, in the shape your application will give an actor. The cast is
    // the honest part: there is no one behind this request to describe.
    actor: {} as LitebAuth.Actor,
    // \`*\` grants everything. Real ones are the keys your modules declare,
    // which src/config/permissions.ts carries into the type system.
    permissions: ['*'],
  };
};

export default auth;
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
      { path: 'src/config/auth.ts', content: authFile },
    ],
    [],
    [
      `Fill in .env (the database has to exist; liteb creates tables, not databases).`,
      `Once it runs: /health answers the probes, /docs has the API, and logs/ has the route map.`,
      `src/config/auth.ts lets EVERYONE through, so endpoints answer from the first request. Replace it before this has users.`,
      // `npx liteb` without a version resolves the `latest` tag, which is a
      // different major with a different CLI. Inside the project it is the
      // local install that answers, so no version is needed here.
      `Create your first module: npx liteb module <name>${
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
