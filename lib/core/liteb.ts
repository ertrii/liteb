import { DataSource, DataSourceOptions } from 'typeorm';
import { Request, Response } from 'express';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import EndpointHandler from './endpoint-handler';
import EndpointReader from './endpoint-reader';
import PatternResolve from './pattern-resolver';
import Server, { RouterOption } from './server';
import { Logger } from '../utilities/logger';
import ErrorControl from '../utilities/error-control';
import { NotFoundError } from '../utilities/errors';
import { Endpoint } from '../templates/endpoint';
import { Task } from '../templates/task';
import InterpreterTask from './interpreter-task';
import path from 'path';
import {
  OpenAPIGenerator,
  OpenAPIInfo,
} from '../services/openapi-generator';
import { ResolvedModule } from '../modules/module-manifest';
import { ModuleStore } from '../modules/module-store';
import { ModuleMigrator } from '../modules/module-migrator';
import { resolveModules } from '../modules/resolve-modules';
import {
  LoadedModule,
  loadModules,
  loadModuleTasks,
} from '../modules/module-loader';
import { collectModuleEntities } from '../modules/collect-entities';
import { buildContainer } from '../modules/build-container';
import { Container } from '../modules/container';
import { AuthResolver } from './auth';

/** What {@link Liteb.create} takes. */
export interface LitebOptions {
  /**
   * Connection options, or a DataSource the application already owns. With
   * options, liteb adds the modules' entities before building it.
   */
  db: DataSourceOptions | DataSource;

  /** Manifests built with `defineModule()`. */
  modules?: ResolvedModule[];

  /** Prefix for every module route. Defaults to `/api`. */
  basePath?: string;

  /** Host version, checked against each module's `engine` range. */
  version?: string;

  /**
   * Turns a request into whoever is behind it. Without one, `this.auth` in an
   * endpoint stays anonymous and reading `this.auth.actor` is an error.
   */
  auth?: AuthResolver;
}

interface EndpointGroup {
  basePath: string;
  modulesAsync: Promise<Array<new () => Endpoint> | undefined>[];
}

/**
 * This framework allows you to configure API and task patterns based on modules,
 * resolving their routes and dynamically loading the defined controllers and tasks.
 */
export default class Liteb extends Server {
  private endpointGroups: EndpointGroup[] = [];
  private modules: ResolvedModule[] = [];
  private moduleBasePath = '/api';
  private hostVersion?: string;
  private loadedModules: LoadedModule[] = [];
  private container?: Container;
  private authResolver?: AuthResolver;
  private moduleTasks: Array<new () => Task> = [];
  private tasksAsync: Promise<Array<new () => Task>>[] = [];
  private templatesAsync: Promise<string[]>[] = [];
  private started = false;
  private scheduledTasks: cron.ScheduledTask[] = [];
  private shuttingDown = false;
  private swaggerConfig: {
    path: string;
    info?: OpenAPIInfo;
  } | null = null;

  /**
   * Groups EndpointReaders by module name.
   *
   * @param endpointReaders Array of EndpointReader instances.
   * @returns An object holding the EndpointReaders grouped by module name.
   */
  private groupEndpointReaders = (endpointReaders: EndpointReader[]) => {
    return endpointReaders.reduce(
      (acc, endpointReader) => {
        const moduleName = endpointReader.moduleName || 'default';
        if (!acc[moduleName]) {
          acc[moduleName] = [];
        }
        acc[moduleName].push(endpointReader);
        return acc;
      },
      {} as { [moduleName: string]: typeof endpointReaders },
    );
  };

  /**
   * Creates a Liteb instance.
   *
   * Prefer {@link Liteb.create} when the application has modules: the
   * DataSource has to know their entities, and only `create` can add them
   * before the connection is built.
   *
   * @param dbSource TypeORM DataSource instance for database access.
   */
  constructor(private dbSource: DataSource) {
    super();
  }

  /**
   * Builds an application from its modules, owning the DataSource.
   *
   * This is the inversion modules require. TypeORM needs the full entity list
   * when the DataSource is *constructed*, and that list is the union of what
   * every module contributes — which the application cannot assemble by hand
   * without knowing each module's internals. So liteb builds it.
   *
   * Entities come from every module present in the code, enabled or not:
   * disabling a module decides what runs, never whether its data is reachable.
   *
   * A DataSource can still be passed instead of connection options, for an
   * application that already owns one. Its entities are then its own business —
   * liteb has nothing to add to a connection it did not build.
   *
   * @example
   * const app = await Liteb.create({
   *   db: { type: 'postgres', host, database },
   *   modules: [identity, billing],
   *   version: '3.0.0',
   * });
   * await app.start(4000);
   */
  public static create = async (options: LitebOptions): Promise<Liteb> => {
    const modules = options.modules ?? [];

    const dataSource =
      options.db instanceof DataSource
        ? options.db
        : new DataSource({
            ...options.db,
            entities: [
              ...((options.db.entities ?? []) as unknown[]),
              ...collectModuleEntities(modules),
            ],
          } as DataSourceOptions);

    const app = new Liteb(dataSource);

    if (options.auth) app.setAuth(options.auth);

    if (modules.length > 0) {
      app.useModules(modules, {
        basePath: options.basePath,
        version: options.version,
      });
    }

    return app;
  };

  /**
   * Sets how a request becomes an actor, for applications built with
   * `new Liteb(dataSource)`. {@link Liteb.create} takes it as the `auth`
   * option instead.
   *
   * It has to be set before `start()`: handlers capture the resolver when the
   * routes are mounted.
   *
   * @example
   * app.setAuth((req) => {
   *   const userId = req.session?.userId;
   *   if (!userId) return null;
   *   return { actor: { userId }, permissions: req.session.permissions };
   * });
   */
  public setAuth = (resolver: AuthResolver) => {
    this.authResolver = resolver;
  };

  private resolveApiPatterns = (
    pattern: string[],
  ): EndpointGroup['modulesAsync'] => {
    return pattern
      .map(async (apiPattern) => {
        const patternResolver = new PatternResolve<new () => Endpoint>(apiPattern);
        await patternResolver.readModule();
        if (!patternResolver.hasExport()) return undefined;
        return patternResolver.getModules().flat();
      })
      .flat() as EndpointGroup['modulesAsync'];
  };

  /**
   * Defines the API patterns that will be read and analyzed under a single
   * base path. Replaces any previously configured groups.
   *
   * For multi-base-path setups (e.g. legacy under `/` plus new code under
   * `/api`), use {@link addApis} instead.
   *
   * @param path Base path under which the resolved endpoints will be mounted.
   * @param pattern Array of glob patterns pointing at API module files.
   */
  public setApis = (path: string, pattern: string[]) => {
    this.endpointGroups = [
      { basePath: path, modulesAsync: this.resolveApiPatterns(pattern) },
    ];
  };

  /**
   * Adds another API group on top of any already configured. Each group
   * has its own base path; the resolved endpoints are mounted at
   * `path.join(basePath, @Module(name), @Get/@Post/...(path))`.
   *
   * Useful when different file globs should resolve under different prefixes
   * (e.g. legacy controllers under `/`, new controllers under `/api`).
   *
   * @param path Base path for this group.
   * @param pattern Array of glob patterns pointing at API module files.
   */
  public addApis = (path: string, pattern: string[]) => {
    this.endpointGroups.push({
      basePath: path,
      modulesAsync: this.resolveApiPatterns(pattern),
    });
  };

  /**
   * Configures the template engine and the views directory.
   *
   * @param engine Template engine (e.g. 'ejs' or 'pug').
   * @param root Root directory where the templates live.
   */
  public setTemplates = async (
    engine: 'ejs' | 'pug',
    root: string | string[],
  ) => {
    this.app.set('view engine', engine);
    const patternResolvers = Array.isArray(root)
      ? root.map((r) => new PatternResolve<string>(r))
      : [new PatternResolve<string>(root)];
    const modules = patternResolvers
      .map(async (r) => {
        await r.readPath();
        return r.getPaths();
      })
      .flat();

    this.templatesAsync = modules;
  };

  /**
   * Enable Swagger / OpenAPI docs. The spec is generated automatically from
   * the same `@Module`/`@Get`/`@Post`/`@Body`/`@Params`/`@Query` decorators
   * already used for routing. Optional `@ApiTag`, `@ApiSummary`,
   * `@ApiDescription`, `@ApiResponse` decorators add detail.
   *
   * Mounts:
   * - `<docsPath>` -> Swagger UI
   * - `<docsPath>.json` -> raw OpenAPI 3 JSON
   *
   * Must be called before `start()`.
   *
   * @param docsPath Path under which the UI is served (e.g. `/docs`).
   * @param info Optional title/version/description for the spec.
   */
  public swagger = (docsPath: string, info?: OpenAPIInfo) => {
    this.swaggerConfig = { path: docsPath, info };
  };

  /**
   * Defines the task patterns (Tasks) that will be read and analyzed.
   *
   * @param pattern Array of path patterns to task modules.
   */
  public setTasks = (pattern: string[]) => {
    const tasksAsync = pattern
      .map(async (taskPattern) => {
        const patternResolver = new PatternResolve<new () => Task>(taskPattern);
        await patternResolver.readModule();
        if (!patternResolver.hasExport()) return;
        return patternResolver.getModules().flat();
      })
      .flat();
    this.tasksAsync = tasksAsync;
  };

  /**
   * Registers the modules this application is made of.
   *
   * On start they go through the full cycle: their state is read from
   * `_modules`, the graph is resolved into dependency order, their pending
   * migrations run, and only the enabled ones get their routes mounted.
   *
   * @param modules Manifests built with `defineModule()`.
   * @param options `basePath` prefixes every module route (default `/api`);
   * `version` is the host version checked against each module's `engine`.
   */
  public useModules = (
    modules: ResolvedModule[],
    options: { basePath?: string; version?: string } = {},
  ) => {
    this.modules = modules;
    if (options.basePath) this.moduleBasePath = options.basePath;
    if (options.version) this.hostVersion = options.version;
  };

  /**
   * Brings the installation in line with the modules in the code and prepares
   * what has to be mounted.
   *
   * Order is not incidental: state is read before resolving, resolving before
   * migrating, and migrating before anything is mounted — a route must never
   * answer against a table its migration has not created yet.
   */
  private bootModules = async () => {
    const store = new ModuleStore(this.dbSource);
    await store.ensureTable();

    const reconciliation = await store.sync(this.modules);
    for (const entry of reconciliation.install) {
      Logger.info(
        `Module "${entry.id}" installed${entry.enabled ? '' : ' (disabled)'}`,
      );
    }
    for (const entry of reconciliation.upgrade) {
      const direction = entry.downgrade ? 'DOWNGRADED' : 'upgraded';
      Logger.warn(`Module "${entry.id}" ${direction}: ${entry.from} -> ${entry.to}`);
    }
    for (const entry of reconciliation.orphaned) {
      Logger.warn(
        `Module "${entry.id}" is recorded but no longer in the code. Its data was left untouched.`,
      );
    }

    const active = resolveModules(this.modules, {
      enabled: reconciliation.enabledIds,
      hostVersion: this.hostVersion,
    });

    const migrator = new ModuleMigrator(this.dbSource);
    const ran = await migrator.run(active);
    for (const entry of ran) {
      Logger.info(`Migration applied: ${entry.module}:${entry.name}`);
    }

    // Built before anything is mounted: a module consuming a contract nobody
    // provides must stop the boot, not the first request that needs it.
    this.container = buildContainer(active, this.dbSource);
    const contracts = this.container.ids();
    if (contracts.length > 0) {
      Logger.info(`Contracts registered: ${contracts.join(', ')}`);
    }

    this.loadedModules = await loadModules(active);

    // Scheduled tasks follow the same rule as routes: only enabled modules get
    // theirs started. A disabled module must not keep a cron running.
    this.moduleTasks = [];
    for (const mod of active) {
      this.moduleTasks.push(...(await loadModuleTasks(mod)));
    }
    Logger.info(
      `Modules enabled: ${active.map((mod) => mod.id).join(', ') || 'none'}`,
    );
  };

  /**
   * Starts the main framework flow: connects to the database,
   * resolves APIs and tasks, creates routes, and starts the HTTP server.
   *
   * @param port Port where the HTTP server will be started.
   */
  public start = async (port: number) => {
    if (this.started) return;
    this.started = true;

    // Initialize the database. If it fails it is a FATAL error: rethrow so the
    // process exits with a non-zero code and the orchestrator (Docker/PM2)
    // restarts it, instead of staying alive with no server.
    Logger.info('Loading database...');
    try {
      // A caller may hand over a DataSource it already connected (an app
      // embedding liteb, a test suite reusing one). Initializing twice throws,
      // so adopt the live connection instead of fighting it.
      if (!this.dbSource.isInitialized) {
        await this.dbSource.initialize();
      }
    } catch (error) {
      Logger.error('Fatal: could not connect to the database', error);
      this.started = false;
      throw error;
    }

    if (this.modules.length > 0) {
      Logger.info('Loading modules...');
      try {
        await this.bootModules();
      } catch (error) {
        // A broken module graph or a failed migration is fatal: serving
        // half-mounted is worse than not starting.
        Logger.error('Fatal: could not load modules', error);
        this.started = false;
        throw error;
      }
    }

    if (this.templatesAsync.length > 0) {
      Logger.info('Reading templates...');
      const templates = await Promise.all(this.templatesAsync);
      this.app.set('views', templates.flat());
    }

    Logger.info('Reading API and creating routes...');
    // Resolve API patterns per group (each group has its own basePath)
    const resolvedGroups: Array<{
      basePath: string;
      endpointReaders: EndpointReader[];
    }> = [];
    for (const group of this.endpointGroups) {
      const modules = await Promise.all(group.modulesAsync);
      const exporteds = modules
        .filter((m): m is Array<new () => Endpoint> => m !== undefined)
        .flat()
        // A controller/view file may export things besides the class
        // (constants, helpers, types). `Reflect.getMetadata` blows up with a
        // TypeError if given a primitive, so we only consider classes that
        // extend `Endpoint`; everything else is silently ignored.
        .filter(
          (exported): exported is new () => Endpoint =>
            typeof exported === 'function' &&
            exported.prototype instanceof Endpoint,
        );
      const endpointReaders = exporteds
        .map((exported) => {
          const endpointReader = new EndpointReader(exported);
          if (endpointReader.isInvalid()) return;
          return endpointReader;
        })
        .filter((endpointReader): endpointReader is EndpointReader => endpointReader !== undefined)
        .sort((a, b) => {
          if (a.priority === null && b.priority === null) return 0;
          if (a.priority === null) return 1;
          if (b.priority === null) return -1;
          return a.priority - b.priority;
        });
      resolvedGroups.push({ basePath: group.basePath, endpointReaders });
    }

    // Module routes share the pipeline with the configured groups, so they get
    // the same OpenAPI spec, the same logging and the same 404 behind them.
    for (const loaded of this.loadedModules) {
      if (loaded.readers.length === 0) continue;
      resolvedGroups.push({
        basePath: this.moduleBasePath,
        endpointReaders: loaded.readers,
      });
    }

    // Mount Swagger UI first so /<docsPath> doesn't get shadowed by a
    // module router that happens to share its prefix.
    if (this.swaggerConfig) {
      const generator = new OpenAPIGenerator();
      const spec = generator.generate({
        groups: resolvedGroups,
        info: this.swaggerConfig.info,
      });
      const docsPath = this.swaggerConfig.path;
      const jsonPath = docsPath.replace(/\/$/, '') + '.json';
      this.app.get(jsonPath, (_req, res) => {
        res.json(spec);
      });
      this.app.use(docsPath, swaggerUi.serve, swaggerUi.setup(spec));
      Logger.info(`Swagger UI at ${docsPath} (spec: ${jsonPath})`);
    }

    // Create routes and attach handlers, once per group
    Logger.clear('router');
    for (const { basePath, endpointReaders } of resolvedGroups) {
      Logger.router(`[API] BASE PATH: ${basePath}`);
      const endpointReadersByModule = this.groupEndpointReaders(endpointReaders);
      Object.entries(endpointReadersByModule).forEach(
        ([moduleName, moduleReaders]) => {
          const options = moduleReaders.map((endpointReader) => {
            const endpointHandler = new EndpointHandler(
              endpointReader,
              this.dbSource,
              this.container,
              this.authResolver,
            );
            const option = new RouterOption(
              endpointReader.pathname,
              endpointReader.method,
            );
            if (endpointReader.hasMiddleware()) {
              option.setHandler(endpointHandler.middleware);
            }
            if (endpointReader.hasSchema()) {
              option.setHandler(endpointHandler.schema);
            }
            option.setHandler(endpointHandler.main);
            Logger.router(endpointReader);
            return option;
          });
          this.router(path.join(basePath, moduleName), options);
        },
      );
    }

    // 404 fallback: goes AFTER every router so it only catches what none of
    // them handled.
    this.registerNotFoundHandler();

    // Start the HTTP server
    Logger.info('Loading server...');
    await this.listen(port);

    if (this.tasksAsync.length > 0 || this.moduleTasks.length > 0) {
      // Read task modules
      Logger.info('Reading and loader tasks');
      const taskModules = await Promise.all(this.tasksAsync);

      // Start tasks. We filter out null/undefined because `setTasks` can emit
      // promises resolved to `undefined` when a pattern matches no files.
      [...taskModules.flat(), ...this.moduleTasks]
        .filter((taskMod): taskMod is new () => Task => taskMod != null)
        .forEach((taskMod) => {
          const interpreterTask = new InterpreterTask(
            taskMod,
            this.dbSource,
            this.container,
          );
          if (interpreterTask.isInvalid()) return;
          const scheduled = interpreterTask.start();
          if (scheduled) this.scheduledTasks.push(scheduled);
        });
    }

    this.registerShutdownHooks();
    Logger.info('Done!');
  };

  /**
   * Registers the final handler for unmatched routes, so a 404 responds with
   * the SAME error contract as the rest of the framework
   * (`{ message, response, errorFields, identifier }`) instead of Express's
   * default HTML.
   *
   * It is registered at the end of startup, so any route added by hand via
   * `getApp()` AFTER `start()` would sit behind this fallback and never be
   * reached: add those before starting.
   */
  private registerNotFoundHandler = () => {
    this.app.use((req: Request, res: Response) => {
      const errResult = new ErrorControl(
        new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`),
      );
      res.status(errResult.getStatus()).json(errResult.toJson());
    });
  };

  /**
   * Registers SIGTERM/SIGINT handlers for an ordered shutdown.
   * Uses `process.once` so a second signal does not re-enter.
   */
  private registerShutdownHooks = () => {
    process.once('SIGTERM', () => void this.shutdown('SIGTERM'));
    process.once('SIGINT', () => void this.shutdown('SIGINT'));
  };

  /**
   * Ordered shutdown: stops the cron tasks, stops accepting new requests and
   * waits for in-flight ones, closes the database connection and ends the
   * process. Safe against multiple calls.
   *
   * @param signal Signal or reason that triggered the shutdown (informational).
   */
  /**
   * Stops the application without ending the process: cron tasks first, then
   * the HTTP server, then the database connection.
   *
   * `shutdown()` is the signal handler and exits the process, which makes it
   * unusable for a test or for anything embedding liteb inside a larger
   * process. This is the same ordered stop, minus the exit.
   *
   * @param options `database: false` leaves the connection open, for when the
   * DataSource is owned by the caller and outlives the server.
   */
  public close = async (options: { database?: boolean } = {}) => {
    const { database = true } = options;

    // Stop scheduled tasks so nothing new starts.
    this.scheduledTasks.forEach((task) => task.stop());
    this.scheduledTasks = [];

    try {
      await this.closeServer();
    } catch (error) {
      Logger.error('Error closing HTTP server', error);
    }

    if (database) {
      try {
        if (this.dbSource.isInitialized) await this.dbSource.destroy();
      } catch (error) {
        Logger.error('Error closing database connection', error);
      }
    }

    this.started = false;
  };

  public shutdown = async (signal: string = 'manual') => {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    Logger.info(`Shutting down (${signal})...`);

    // Safety net: if the ordered shutdown hangs (e.g. keep-alive connections),
    // force the exit so the restart is not blocked.
    const forceExit = setTimeout(() => {
      Logger.error('Shutdown timed out; forcing exit.');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    await this.close();

    Logger.info('Shutdown complete.');
    process.exit(0);
  };
}
