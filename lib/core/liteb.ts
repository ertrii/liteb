import { DataSource } from 'typeorm';
import ApiHandler from './api-handler';
import ApiReader from './api-reader';
import PatternResolve from './pattern-resolver';
import Server, { RouterOption } from './server';
import { Logger } from '../utilities/logger';
import { Api } from '../templates/api';
import { Task } from '../templates/task';
import InterpreterTask from './interpreter-task';
import path from 'path';

/**
 * This framework allows you to configure API and task patterns based on modules,
 * resolving their routes and dynamically loading the defined controllers and tasks.
 */
export default class Liteb extends Server {
  private modulesAsync: Promise<Array<new () => Api>>[] = [];
  private tasksAsync: Promise<Array<new () => Task>>[] = [];
  private started = false;
  private basePathnameApi = '/';

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

  /**
   * Defines the API patterns that will be read and analyzed.
   * @param path Ruta base bajo la cual se registrarán los endpoints de la aplicación.
   * @param pattern Array of route patterns to API modules.
   */
  public setApis = (path: string, pattern: string[]) => {
    this.basePathnameApi = path;
    const modulesAsync = pattern
      .map(async (apiPattern) => {
        const patternResolver = new PatternResolve<new () => Api>(apiPattern);
        await patternResolver.read();
        if (!patternResolver.hasExport()) return;
        return patternResolver.getModules().flat();
      })
      .flat();
    this.modulesAsync = modulesAsync;
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
        await patternResolver.read();
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
      Logger.info('DB Connected');
    } catch (error) {
      Logger.error('Error load database connect', error);
      this.started = false;
      return;
    }

    // Resolver patrones de API
    Logger.info('Resolving pattern...');
    let modules = await Promise.all(this.modulesAsync);
    const exporteds = modules.flat();

    // Leer y validar las clases exportadas de APIs
    Logger.info('Reading API...');
    const apiReaders = exporteds
      .map((exported) => {
        const apiReader = new ApiReader(exported);
        if (apiReader.isInvalid()) return;
        return apiReader;
      })
      .filter((apiReader) => apiReader)
      .sort((a, b) => {
        if (a.priority === null && b.priority === null) return 0;
        if (a.priority === null) return 1;
        if (b.priority === null) return -1;
        return a.priority - b.priority;
      });

    // Agrupar ApiReaders por módulo
    const apiReadersByModule = this.groupApiReaders(apiReaders);

    // Crear rutas y asociar handlers
    Logger.info('Creating routes...');
    Logger.clear('router');
    Logger.router(`BASE PATH: ${this.basePathnameApi}`);
    Object.entries(apiReadersByModule).forEach(([moduleName, apiReaders]) => {
      const options = apiReaders.map((apiReader) => {
        const apiHandler = new ApiHandler(apiReader, this.dbSource);
        const option = new RouterOption(apiReader.pathname, apiReader.method);
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
      this.router(path.join(this.basePathnameApi, moduleName), options);
    });

    // Iniciar el servidor HTTP
    Logger.info('Loading server...');
    await this.listen(port);

    // Leer módulos de tareas
    Logger.info('Reading and loader tasks');
    const taskModules = await Promise.all(this.tasksAsync);

    // Iniciar tareas
    taskModules.flat().forEach((taskMod) => {
      const interpreterTask = new InterpreterTask(taskMod, this.dbSource);
      if (interpreterTask.isInvalid()) return;
      interpreterTask.start();
    });
    Logger.info('Done!');
  };
}
