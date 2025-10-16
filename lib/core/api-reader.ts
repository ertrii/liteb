import {
  DELETE,
  GET,
  HTTPMetadata,
  PATCH,
  POST,
  PUT,
} from '../decorators/http.decorator';
import { MODULE, ModuleMetadata } from '../decorators/module.decorator';
import {
  BODY,
  PARAMS,
  QUERY,
  RequestMetadata,
} from '../decorators/request.decorator';
import { MiddlewareFn, USE, UseMetadata } from '../decorators/use.decorator';
import { PRIORITY, PriorityMetadata } from '../decorators/priority.decorator';
import { Api } from '../templates/api';
import { Middleware } from '../templates/middleware';

export default class ApiReader {
  public version: number = 0;
  public moduleName: string;
  public pathname: string;
  public method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  public priority: number = 0;
  public ParamsSchema: new () => Record<string, any> = undefined;
  public BodySchema: new () => Record<string, any> = undefined;
  public QuerySchema: new () => Record<string, any> = undefined;
  public MiddlewareClass: MiddlewareFn | (new () => Middleware) = undefined;

  private getModule = () => {
    const moduleDefine = Reflect.getMetadata(
      MODULE,
      this.ApiClass,
    ) as ModuleMetadata;
    if (moduleDefine) {
      this.moduleName = moduleDefine.basePath;
    }
  };

  private getHttp = () => {
    const MethodKeys: [typeof this.method, symbol][] = [
      ['get', GET],
      ['post', POST],
      ['put', PUT],
      ['delete', DELETE],
      ['patch', PATCH],
    ];
    for (const [method, KEY] of MethodKeys) {
      const metadata = Reflect.getMetadata(KEY, this.ApiClass) as HTTPMetadata;
      if (metadata) {
        this.pathname = metadata.path;
        this.method = method;
        break;
      }
    }
  };

  private getPriority = () => {
    const priorityDefine = Reflect.getMetadata(
      PRIORITY,
      this.ApiClass,
    ) as PriorityMetadata;
    if (priorityDefine) {
      this.priority = priorityDefine.number;
    }
  };

  private getUse = () => {
    const useDefine = Reflect.getMetadata(USE, this.ApiClass) as UseMetadata;
    if (useDefine) {
      this.MiddlewareClass = useDefine.middleware;
    }
  };

  private getParams = () => {
    const paramsDefine = Reflect.getMetadata(
      PARAMS,
      this.ApiClass,
    ) as RequestMetadata;
    if (paramsDefine) {
      this.ParamsSchema = paramsDefine.Schema;
    }
  };

  private getBody = () => {
    const bodyDefine = Reflect.getMetadata(
      BODY,
      this.ApiClass,
    ) as RequestMetadata;
    if (bodyDefine) {
      this.BodySchema = bodyDefine.Schema;
    }
  };

  private getQuery = () => {
    const queryDefine = Reflect.getMetadata(
      QUERY,
      this.ApiClass,
    ) as RequestMetadata;
    if (queryDefine) {
      this.QuerySchema = queryDefine.Schema;
    }
  };

  constructor(private ApiClass: new () => Api) {
    this.getModule();
    this.getHttp();
    this.getPriority();
    this.getUse();
    this.getParams();
    this.getBody();
    this.getQuery();
  }

  public isInvalid = (): boolean => {
    if (!this.moduleName || !this.method) {
      return true;
    }
    return false;
  };

  public getApiClass = () => {
    return this.ApiClass;
  };

  public hasMiddleware = () => {
    return !!this.MiddlewareClass;
  };

  public hasSchema = () => {
    return !!this.ParamsSchema || !!this.BodySchema || !!this.QuerySchema;
  };
}
