import { DataSource } from 'typeorm';
import swaggerUi from 'swagger-ui-express';
import ApiHandler from './api-handler';
import ApiReader from './api-reader';
import PatternResolve from './pattern-resolver';
import Server, { RouterOption } from './server';
import { Logger } from '../utilities/logger';
import { Api } from '../templates/api';
import { Task } from '../templates/task';
import InterpreterTask from './interpreter-task';
import path from 'path';
import {
  OpenAPIGenerator,
  OpenAPIInfo,
} from '../services/openapi-generator';

interface ApiGroup {
  basePath: string;
  modulesAsync: Promise<Array<new () => Api> | undefined>[];
}

/**
 * This framework allows you to configure API and task patterns based on modules,
 * resolving their routes and dynamically loading the defined controllers and tasks.
 */
export default class Liteb extends Server {
  private apiGroups: ApiGroup[] = [];
  private tasksAsync: Promise<Array<new () => Task>>[] = [];
  private templatesAsync: Promise<string[]>[] = [];
  private started = false;
  private swaggerConfig: {
    path: string;
    info?: OpenAPIInfo;
  } | null = null;

  /**
   * Agrupa ApiReader por nombre de módulo.
   *
   * @param apiReaders Arreglo de instancias de ApiReader.
   * @returns Un objeto que contiene los ApiReaders agrupados por nombre de módulo.
   */
  private groupApiReaders = (apiReaders: ApiReader[]) => {
    return apiReaders.reduce(
      (acc, apiReader) => {
        const moduleName = apiReader.moduleName || 'default';
        if (!acc[moduleName]) {
          acc[moduleName] = [];
        }
        acc[moduleName].push(apiReader);
        return acc;
      },
      {} as { [moduleName: string]: typeof apiReaders },
    );
  };

  /**
   * Crea una instancia de Liteb.
   * @param dbSource Instancia de DataSource de TypeORM para acceso a base de datos.
   */
  constructor(private dbSource: DataSource) {
    super();
  }

  private resolveApiPatterns = (
    pattern: string[],
  ): ApiGroup['modulesAsync'] => {
    return pattern
      .map(async (apiPattern) => {
        const patternResolver = new PatternResolve<new () => Api>(apiPattern);
        await patternResolver.readModule();
        if (!patternResolver.hasExport()) return undefined;
        return patternResolver.getModules().flat();
      })
      .flat() as ApiGroup['modulesAsync'];
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
    this.apiGroups = [
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
    this.apiGroups.push({
      basePath: path,
      modulesAsync: this.resolveApiPatterns(pattern),
    });
  };

  /**
   * Configura el motor de plantillas y el directorio de vistas.
   *
   * @param engine Motor de plantillas (ejemplo: 'ejs' o 'pug').
   * @param root Directorio raíz donde se encuentran las plantillas.
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

    // this.app.set('views', modules);
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
   * Starts the main framework flow: connects to the database,
   * resolves APIs and tasks, creates routes, and starts the HTTP server.
   *
   * @param port Port where the HTTP server will be started.
   */
  public start = async (port: number) => {
    if (this.started) return;
    this.started = true;

    // Inicializar base de datos
    Logger.info('Loading database...');
    try {
      await this.dbSource.initialize();
    } catch (error) {
      Logger.error('Error load database connect', error);
      this.started = false;
      return;
    }

    if (this.templatesAsync.length > 0) {
      Logger.info('Reading templates...');
      const templates = await Promise.all(this.templatesAsync);
      this.app.set('views', templates.flat());
    }

    Logger.info('Reading API and creating routes...');
    // Resolver patrones de API por grupo (cada grupo tiene su propio basePath)
    const resolvedGroups: Array<{
      basePath: string;
      apiReaders: ApiReader[];
    }> = [];
    for (const group of this.apiGroups) {
      const modules = await Promise.all(group.modulesAsync);
      const exporteds = modules
        .filter((m): m is Array<new () => Api> => m !== undefined)
        .flat();
      const apiReaders = exporteds
        .map((exported) => {
          const apiReader = new ApiReader(exported);
          if (apiReader.isInvalid()) return;
          return apiReader;
        })
        .filter((apiReader): apiReader is ApiReader => apiReader !== undefined)
        .sort((a, b) => {
          if (a.priority === null && b.priority === null) return 0;
          if (a.priority === null) return 1;
          if (b.priority === null) return -1;
          return a.priority - b.priority;
        });
      resolvedGroups.push({ basePath: group.basePath, apiReaders });
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

    // Crear rutas y asociar handlers, una vez por grupo
    Logger.clear('router');
    for (const { basePath, apiReaders } of resolvedGroups) {
      Logger.router(`[API] BASE PATH: ${basePath}`);
      const apiReadersByModule = this.groupApiReaders(apiReaders);
      Object.entries(apiReadersByModule).forEach(
        ([moduleName, moduleReaders]) => {
          const options = moduleReaders.map((apiReader) => {
            const apiHandler = new ApiHandler(apiReader, this.dbSource);
            const option = new RouterOption(
              apiReader.pathname,
              apiReader.method,
            );
            if (apiReader.hasMiddleware()) {
              option.setHandler(apiHandler.middleware);
            }
            if (apiReader.hasSchema()) {
              option.setHandler(apiHandler.schema);
            }
            option.setHandler(apiHandler.main);
            Logger.router(apiReader);
            return option;
          });
          this.router(path.join(basePath, moduleName), options);
        },
      );
    }

    // Iniciar el servidor HTTP
    Logger.info('Loading server...');
    await this.listen(port);

    if (this.tasksAsync.length > 0) {
      // Leer módulos de tareas
      Logger.info('Reading and loader tasks');
      const taskModules = await Promise.all(this.tasksAsync);

      // Iniciar tareas
      taskModules.flat().forEach((taskMod) => {
        const interpreterTask = new InterpreterTask(taskMod, this.dbSource);
        if (interpreterTask.isInvalid()) return;
        interpreterTask.start();
      });
    }
    Logger.info('Done!');
  };
}
