import { DataSource, DataSourceOptions } from 'typeorm';
import { NextFunction, Request, Response } from 'express';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import EndpointHandler from './endpoint-handler';
import EndpointReader from './endpoint-reader';
import PatternResolve from './pattern-resolver';
import Server, { RouterOption } from './server';
import { Logger } from '../utilities/logger';
import ErrorControl from '../utilities/error-control';
import { NotFoundError } from '../utilities/errors';
import { ErrorType } from '../interfaces/type-error';
import { Routine } from '../templates/routine';
import InterpreterRoutine from './interpreter-routine';
import path from 'path';
import {
  OpenAPIGenerator,
  OpenAPIInfo,
} from '../services/openapi-generator';
import { ResolvedModule } from '../modules/module-manifest';
import { ModuleStore } from '../modules/module-store';
import { AppliedMigration, ModuleMigrator } from '../modules/module-migrator';
import { reconcileModules } from '../modules/reconcile-modules';
import { resolveModules } from '../modules/resolve-modules';
import {
  LoadedModule,
  loadModules,
  loadModuleListeners,
  loadModuleRoutines,
} from '../modules/module-loader';
import { collectModuleEntities } from '../modules/collect-entities';
import { buildContainer } from '../modules/build-container';
import { Container } from '../modules/container';
import { EventBus } from '../modules/events';
import {
  PermissionRegistry,
  RegisteredPermission,
} from '../modules/permissions';
import { AuthResolver } from './auth';
import { buildCors, CorsConfig } from './cors';

/** One module's migrations, and which of them already ran. */
export interface ModuleMigrationStatus {
  module: string;
  /** Disabled modules do not migrate: that is why they are reported. */
  enabled: boolean;
  migrations: Array<{ name: string; applied: boolean }>;
}

/** What {@link Liteb.create} takes. */
export interface LitebOptions {
  /**
   * Connection options, or a DataSource the application already owns. With
   * options, liteb adds the modules' entities before building it.
   */
  db: DataSourceOptions | DataSource;

  /**
   * Manifests built with `defineModule()`. Required, and the ONLY way to mount
   * routes or routines: an application is its modules.
   */
  modules: ResolvedModule[];

  /** Prefix for every module route. Defaults to `/api`. */
  basePath?: string;

  /** Host version, checked against each module's `engine` range. */
  version?: string;

  /**
   * Turns a request into whoever is behind it. Without one, `this.auth` in an
   * endpoint stays anonymous and reading `this.auth.actor` is an error.
   */
  auth?: AuthResolver;

  /**
   * Who may call this API from a browser. Left out, no CORS headers are sent,
   * which is right for an API no browser calls cross-origin.
   *
   * It is mounted before anything else so a preflight is answered without
   * reaching a route, and so the headers are present on an error too.
   */
  cors?: CorsConfig;
}

/**
 * This framework allows you to configure API and routine patterns based on
 * modules, resolving their routes and dynamically loading what they declare.
 */
export default class Liteb extends Server {
  private modules: ResolvedModule[] = [];
  private moduleBasePath = '/api';
  private hostVersion?: string;
  private loadedModules: LoadedModule[] = [];
  private container?: Container;
  private events?: EventBus;
  private permissionRegistry = new PermissionRegistry();
  private authResolver?: AuthResolver;
  private moduleRoutines: Array<new () => Routine> = [];
  private templatesAsync: Promise<string[]>[] = [];
  private started = false;
  private scheduled: cron.ScheduledTask[] = [];
  private shuttingDown = false;
  private swaggerConfig: {
    path: string;
    info?: OpenAPIInfo;
  } | null = null;

  /**
   * Splits a module's endpoints by where each one hangs from.
   *
   * An application that serves pages AND an API cannot share one prefix:
   * `/api/products/page` is not a URL anybody would link to. So a group can
   * declare its own with `@Group(name, { mount })`, and the same module
   * ends up mounted in more than one place — which is why this returns groups
   * rather than one base path per module.
   *
   * Insertion order is kept, so `@Priority` still decides who answers first
   * among routes that could shadow each other. Routes under different prefixes
   * cannot shadow each other at all.
   */
  private byBasePath = (
    readers: EndpointReader[],
  ): Map<string, EndpointReader[]> => {
    const groups = new Map<string, EndpointReader[]>();
    for (const reader of readers) {
      const base = reader.mountAt ?? this.moduleBasePath;
      const current = groups.get(base) ?? [];
      current.push(reader);
      groups.set(base, current);
    }
    return groups;
  };

  /**
   * Groups EndpointReaders by their URL prefix: `@Group`, or the module id.
   *
   * One Express Router per group is what keeps `@Priority` deciding among
   * routes that could shadow each other and nothing else.
   *
   * @param endpointReaders Array of EndpointReader instances.
   * @returns An object holding the EndpointReaders grouped by prefix.
   */
  private groupEndpointReaders = (endpointReaders: EndpointReader[]) => {
    return endpointReaders.reduce(
      (acc, endpointReader) => {
        const group = endpointReader.group;
        if (!acc[group]) {
          acc[group] = [];
        }
        acc[group].push(endpointReader);
        return acc;
      },
      {} as { [group: string]: typeof endpointReaders },
    );
  };

  /**
   * Private on purpose: {@link Liteb.create} is the only way in.
   *
   * A hand-built instance could only ever be an application with no modules —
   * and therefore no routes and no routines — or one whose DataSource never
   * learned about its modules' entities, which fails later, at the first query.
   *
   * @param dbSource TypeORM DataSource instance for database access.
   */
  private constructor(private dbSource: DataSource) {
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
    const modules = options.modules;

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

    // First, and before any `app.use()` the caller adds: a preflight has no
    // business reaching a route, and a response that fails still needs the
    // headers or the browser hides the reason.
    if (options.cors) app.use(buildCors(options.cors));

    app.authResolver = options.auth;
    app.useModules(modules, {
      basePath: options.basePath,
      version: options.version,
    });

    return app;
  };

  /**
   * Every permission the installed modules declare, with the module that owns
   * each one.
   *
   * This is what a "who may do what" screen is built from: the catalog comes
   * from the modules, so adding a feature adds its permission without editing
   * a central list somebody has to remember. Modules that are installed but
   * DISABLED are included — turning one off decides what runs, not what exists.
   *
   * Populated during `start()`, so call it after.
   */
  public permissions = (): RegisteredPermission[] =>
    this.permissionRegistry.list();

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
  private useModules = (
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
  /**
   * Reconciles the installation with the modules in the code and returns the
   * ones that are active, in dependency order.
   *
   * Shared by `start()` and by the migration commands so there is ONE
   * definition of "which modules count": a CLI that resolved them differently
   * from the server would migrate a set nobody runs.
   *
   * @param write `false` computes the same answer without recording anything,
   * for a dry run.
   */
  private prepareModules = async (
    write = true,
  ): Promise<ResolvedModule[]> => {
    const store = new ModuleStore(this.dbSource);
    await store.ensureTable();

    const reconciliation = write
      ? await store.sync(this.modules)
      : reconcileModules(this.modules, await store.list());

    if (write) {
      for (const entry of reconciliation.install) {
        Logger.info(
          `Module "${entry.id}" installed${entry.enabled ? '' : ' (disabled)'}`,
        );
      }
      for (const entry of reconciliation.upgrade) {
        const direction = entry.downgrade ? 'DOWNGRADED' : 'upgraded';
        Logger.warn(
          `Module "${entry.id}" ${direction}: ${entry.from} -> ${entry.to}`,
        );
      }
      for (const entry of reconciliation.orphaned) {
        Logger.warn(
          `Module "${entry.id}" is recorded but no longer in the code. Its data was left untouched.`,
        );
      }
    }

    return resolveModules(this.modules, {
      enabled: reconciliation.enabledIds,
      hostVersion: this.hostVersion,
    });
  };

  /**
   * Opens the connection if the caller has not. A command that only migrates
   * has no reason to call `start()`, and `start()` would mount an HTTP server
   * it never wanted.
   *
   * Public so a caller can tell "could not reach the database" apart from
   * anything that happens afterwards — `migrate()` calls it anyway, and a
   * driver error surfacing from there reads like a framework crash.
   */
  public connect = async (): Promise<void> => {
    if (!this.dbSource.isInitialized) await this.dbSource.initialize();
  };

  /**
   * Runs every pending migration and mounts nothing.
   *
   * This is what `start()` already does before mounting a single route — same
   * reconciliation, same order — exposed on its own because the moment you
   * deploy to a machine you do not watch, "migrate, then start" has to be two
   * steps: the first one can fail loudly and stop the release, instead of a
   * server that came up and answered wrong.
   *
   * @param options `dryRun` answers what WOULD run, recording nothing.
   * @returns What ran, in the order it ran.
   *
   * @example
   * const app = await createApp();
   * const ran = await app.migrate();
   * await app.close();
   */
  public migrate = async (
    options: { dryRun?: boolean } = {},
  ): Promise<AppliedMigration[]> => {
    await this.connect();

    const active = await this.prepareModules(!options.dryRun);
    const migrator = new ModuleMigrator(this.dbSource);

    if (options.dryRun) return migrator.pending(active);

    const ran = await migrator.run(active);
    for (const entry of ran) {
      Logger.info(`Migration applied: ${entry.module}:${entry.name}`);
    }
    return ran;
  };

  /**
   * What each module declares and what of it already ran.
   *
   * Written for the question people actually ask — "why didn't my migration
   * run?" — so it reports DECLARED count too: zero declared means the module's
   * `migrations` index exports nothing, which looks identical from the
   * database and is the most common cause.
   */
  public migrationStatus = async (): Promise<ModuleMigrationStatus[]> => {
    await this.connect();

    const active = await this.prepareModules(false);
    const activeIds = new Set(active.map((mod) => mod.id));
    // No `ensureTable()`: reading the state must not create anything.
    const applied = await new ModuleMigrator(this.dbSource).applied();

    return this.modules.map((mod) => ({
      module: mod.id,
      enabled: activeIds.has(mod.id),
      migrations: mod.migrations.map((migration) => ({
        name: migration.name,
        applied: applied.has(`${mod.id}:${migration.name}`),
      })),
    }));
  };

  private bootModules = async () => {
    const active = await this.prepareModules();

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

    const slots = this.container.slotIds();
    if (slots.length > 0) {
      Logger.info(`Extension points filled: ${slots.join(', ')}`);
    }

    // The bus and the container reference each other: an implementation may
    // emit, a listener may resolve a contract. Wired here, in the open.
    this.events = new EventBus(this.dbSource);
    this.container.useEvents(this.events);
    this.events.useContainer(this.container);

    // Listeners follow the same rule as routes and tasks: only ENABLED modules
    // react. Turning a module off has to stop its side effects too, or
    // disabling it would be a lie.
    for (const mod of active) {
      for (const { token, ListenerClass } of await loadModuleListeners(mod)) {
        this.events.register(token, ListenerClass, mod.id);
      }
    }
    const events = this.events.ids();
    if (events.length > 0) {
      Logger.info(`Events with listeners: ${events.join(', ')}`);
    }

    // From every module PRESENT, enabled or not — like entities. Turning a
    // module off must not change what a permission key means.
    this.permissionRegistry = PermissionRegistry.from(this.modules);
    if (this.permissionRegistry.size() > 0) {
      Logger.info(`Permissions declared: ${this.permissionRegistry.size()}`);
    }

    this.loadedModules = await loadModules(active);

    // Scheduled routines follow the same rule as routes: only enabled modules
    // get theirs started. A disabled module must not keep a cron running.
    this.moduleRoutines = [];
    for (const mod of active) {
      this.moduleRoutines.push(...(await loadModuleRoutines(mod)));
    }
    Logger.info(
      `Modules enabled: ${active.map((mod) => mod.id).join(', ') || 'none'}`,
    );
  };

  /**
   * Starts the main framework flow: connects to the database,
   * resolves APIs and routines, creates routes, and starts the HTTP server.
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

    if (this.modules.length === 0) {
      // Not fatal — an application may mount its own Express handlers through
      // `getApp()` — but it is almost always a mistake worth saying out loud.
      Logger.warn(
        'This application declares no modules: it will serve nothing but what you mounted by hand.',
      );
    } else {
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
    // Every route belongs to a module. Grouping by module keeps each one's
    // routers, OpenAPI spec and logging together, and lets a disabled module
    // contribute nothing at all.
    const resolvedGroups: Array<{
      basePath: string;
      endpointReaders: EndpointReader[];
    }> = [];
    for (const loaded of this.loadedModules) {
      if (loaded.readers.length === 0) continue;
      for (const [basePath, endpointReaders] of this.byBasePath(loaded.readers)) {
        resolvedGroups.push({ basePath, endpointReaders });
      }
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

    // Create routes and attach handlers, once per group.
    //
    // The counter is global to the whole mount, not per module: what decides
    // which route answers is the order Express saw them in, across every
    // router. A per-module number would read as a map and be one.
    Logger.clear('router');
    Logger.router('[MAP] registration order; the first match answers');
    let order = 0;
    for (const { basePath, endpointReaders } of resolvedGroups) {
      const endpointReadersByGroup = this.groupEndpointReaders(endpointReaders);
      Object.entries(endpointReadersByGroup).forEach(
        ([group, groupReaders]) => {
          const options = groupReaders.map((endpointReader) => {
            const endpointHandler = new EndpointHandler(
              endpointReader,
              this.dbSource,
              this.container,
              this.authResolver,
              this.events,
              this.permissionRegistry,
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
            order += 1;
            Logger.router(endpointReader, { order, basePath });
            return option;
          });
          this.router(path.join(basePath, group), options);
        },
      );
    }

    // 404 fallback: goes AFTER every router so it only catches what none of
    // them handled, and the error handler after that — Express only recognizes
    // one registered last.
    this.registerNotFoundHandler();
    this.registerErrorHandler();

    // Start the HTTP server
    Logger.info('Loading server...');
    await this.listen(port);

    if (this.moduleRoutines.length > 0) {
      Logger.info('Starting module routines...');
      this.moduleRoutines.forEach((RoutineClass) => {
        const interpreter = new InterpreterRoutine(
          RoutineClass,
          this.dbSource,
          this.container,
          // Without this a routine's `this.emit()` did nothing at all: the bus
          // never reached it, and `emit` returns quietly when there is none.
          this.events,
        );
        if (interpreter.isInvalid()) return;
        const scheduled = interpreter.start();
        if (scheduled) this.scheduled.push(scheduled);
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
  /**
   * Maps anything a MIDDLEWARE throws to the same contract an endpoint answers.
   *
   * Without it Express falls back to its own handler, which replies with an
   * HTML stack page: a client that only knows liteb's error shape gets
   * something it cannot parse, and the stack goes out with it. A rejected CORS
   * origin is the usual way to meet this, which is why it looked like liteb was
   * missing CORS support rather than missing this.
   *
   * Four arguments and registered LAST — that is how Express tells an error
   * handler from an ordinary one.
   */
  private registerErrorHandler = () => {
    this.app.use(
      (error: unknown, _req: Request, res: Response, next: NextFunction) => {
        // Bytes are already on the wire (a file mid-transfer): only Express can
        // close that connection properly.
        if (res.headersSent) return next(error);

        const errResult = new ErrorControl(error as ErrorType);
        res.status(errResult.getStatus()).json(errResult.toJson());
      },
    );
  };

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
   * Ordered shutdown: stops the routines, stops accepting new requests and
   * waits for in-flight ones, closes the database connection and ends the
   * process. Safe against multiple calls.
   *
   * @param signal Signal or reason that triggered the shutdown (informational).
   */
  /**
   * Stops the application without ending the process: routines first, then
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

    // Stop the schedules so nothing new starts.
    this.scheduled.forEach((schedule) => schedule.stop());
    this.scheduled = [];

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
