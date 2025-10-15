import { DataSource } from 'typeorm';
import ApiHandler from './api-handler';
import ApiReader from './api-reader';
import PatternResolve from './pattern-resolver';
import Server, { RouterOption } from './server';
import logger from '../services/logger';
import { Api } from '../templates/api';
import { Task } from '../templates/task';
import InterpreterTask from './interpreter-task';

export default class Liteb extends Server {
  private modulesAsync: Promise<Array<new () => Api>>[] = [];
  private tasksAsync: Promise<Array<new () => Task>>[] = [];
  private started = false;

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

  constructor(private dbSource: DataSource) {
    super();
  }

  public setApis = (pattern: string[]) => {
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

  public setTasks = (pattern: string[]) => {
    const tasksAsync = pattern
      .map(async (apiPattern) => {
        const patternResolver = new PatternResolve<new () => Task>(apiPattern);
        await patternResolver.read();
        if (!patternResolver.hasExport()) return;
        return patternResolver.getModules().flat();
      })
      .flat();
    this.tasksAsync = tasksAsync;
  };

  public start = async (port: number) => {
    if (this.started) return;
    this.started = true;
    // DataSource
    logger.info('Loading database...');
    try {
      await this.dbSource.initialize();
      logger.info('DB Connected');
    } catch (error) {
      logger.error('Error load database connect', error);
      this.started = false;
      return;
    }

    // Read Patterns and Resolve
    logger.info('Resolving pattern...');
    let modules = await Promise.all(this.modulesAsync);
    const exporteds = modules.flat();

    // Read export api class and valid
    logger.info('Reading API...');
    const apiReaders = exporteds
      .map((exported) => {
        const apiReader = new ApiReader(exported);
        if (apiReader.isInvalid()) return;
        return apiReader;
      })
      .filter((apiReader) => apiReader)
      .sort((a, b) => a.priority - b.priority);

    // Agrupar apiReader por moduleName
    const apiReadersByModule = this.groupApiReaders(apiReaders);

    // Handlers
    logger.info('Creating routes...');
    Object.entries(apiReadersByModule).forEach(([moduleName, apiReaders]) => {
      const options = apiReaders.map((apiReader) => {
        const apiHandler = new ApiHandler(apiReader, this.dbSource);
        const option = new RouterOption(apiReader.pathname, apiReader.method);
        option.setHandler(apiHandler.middleware);
        option.setHandler(apiHandler.schema);
        option.setHandler(apiHandler.main);
        return option;
      });
      this.router(moduleName, options);
    });

    // Initial listen
    logger.info('Loading server...');
    await this.listen(port);

    // Reading tasks
    logger.info('Reading and loader tasks');
    const taskModules = await Promise.all(this.tasksAsync);

    // Tasks
    taskModules.flat().forEach((taskMod) => {
      const interpreterTask = new InterpreterTask(taskMod, this.dbSource);
      if (interpreterTask.isInvalid()) return;
      interpreterTask.start();
    });
    logger.info('Done!');
  };
}
