import {
  DELETE,
  GET,
  HTTPMetadata,
  PATCH,
  POST,
  PUT,
  QUERY_METHOD,
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
import { Endpoint } from '../templates/endpoint';
import { TEMPLATE, TemplateMetadata } from '../decorators/render.decorator';
import {
  API_DESCRIPTION,
  API_RESPONSES,
  API_SUMMARY,
  API_TAG,
  ApiDescriptionMetadata,
  ApiResponseEntry,
  ApiResponsesMetadata,
  ApiSummaryMetadata,
  ApiTagMetadata,
} from '../decorators/openapi.decorator';

export default class EndpointReader {
  public moduleName: string;
  public pathname: string;
  public method: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'query';
  public view: string | null = null;
  public priority: number | null = null;
  public ParamsSchema: new () => Record<string, any> = undefined;
  public BodySchema: new () => Record<string, any> = undefined;
  public QuerySchema: new () => Record<string, any> = undefined;
  public MiddlewareClass: MiddlewareFn = undefined;
  public apiTags: string[] = [];
  public apiSummary: string | null = null;
  public apiDescription: string | null = null;
  public apiResponses: ApiResponseEntry[] = [];

  private getModule = () => {
    const moduleDefine = Reflect.getMetadata(
      MODULE,
      this.EndpointClass,
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
      ['query', QUERY_METHOD],
    ];
    for (const [method, KEY] of MethodKeys) {
      const metadata = Reflect.getMetadata(KEY, this.EndpointClass) as HTTPMetadata;
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
      this.EndpointClass,
    ) as PriorityMetadata;
    if (priorityDefine) {
      this.priority = priorityDefine.number;
    }
  };

  private getUse = () => {
    const useDefine = Reflect.getMetadata(USE, this.EndpointClass) as UseMetadata;
    if (useDefine) {
      this.MiddlewareClass = useDefine.middleware;
    }
  };

  private getParams = () => {
    const paramsDefine = Reflect.getMetadata(
      PARAMS,
      this.EndpointClass,
    ) as RequestMetadata;
    if (paramsDefine) {
      this.ParamsSchema = paramsDefine.Schema;
    }
  };

  private getBody = () => {
    const bodyDefine = Reflect.getMetadata(
      BODY,
      this.EndpointClass,
    ) as RequestMetadata;
    if (bodyDefine) {
      this.BodySchema = bodyDefine.Schema;
    }
  };

  private getQuery = () => {
    const queryDefine = Reflect.getMetadata(
      QUERY,
      this.EndpointClass,
    ) as RequestMetadata;
    if (queryDefine) {
      this.QuerySchema = queryDefine.Schema;
    }
  };

  private getTemplate = () => {
    const viewDefine = Reflect.getMetadata(
      TEMPLATE,
      this.EndpointClass,
    ) as TemplateMetadata;
    if (viewDefine) {
      this.view = viewDefine.path;
    }
  };

  private getOpenApi = () => {
    const tagDefine = Reflect.getMetadata(
      API_TAG,
      this.EndpointClass,
    ) as ApiTagMetadata;
    if (tagDefine) {
      this.apiTags = tagDefine.tags;
    }
    const summaryDefine = Reflect.getMetadata(
      API_SUMMARY,
      this.EndpointClass,
    ) as ApiSummaryMetadata;
    if (summaryDefine) {
      this.apiSummary = summaryDefine.summary;
    }
    const descDefine = Reflect.getMetadata(
      API_DESCRIPTION,
      this.EndpointClass,
    ) as ApiDescriptionMetadata;
    if (descDefine) {
      this.apiDescription = descDefine.description;
    }
    const responsesDefine = Reflect.getMetadata(
      API_RESPONSES,
      this.EndpointClass,
    ) as ApiResponsesMetadata;
    if (responsesDefine) {
      this.apiResponses = responsesDefine.responses;
    }
  };

  constructor(private EndpointClass: new () => Endpoint) {
    this.getModule();
    this.getHttp();
    this.getPriority();
    this.getUse();
    this.getParams();
    this.getBody();
    this.getQuery();
    this.getTemplate();
    this.getOpenApi();
  }

  public isInvalid = (): boolean => {
    if (!this.moduleName || !this.method) {
      return true;
    }
    return false;
  };

  public getEndpointClass = () => {
    return this.EndpointClass;
  };

  public hasMiddleware = () => {
    return !!this.MiddlewareClass;
  };

  public hasSchema = () => {
    return !!this.ParamsSchema || !!this.BodySchema || !!this.QuerySchema;
  };

  public getTemplatePath = () => {
    if (this.view) {
      return this.view;
    }
    return '';
  };

  public requiereRender = () => {
    return !!this.view;
  };
}
