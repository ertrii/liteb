import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import path from 'path';
import slash from 'slash';
import ApiReader from '../core/api-reader';

export interface OpenAPIInfo {
  title?: string;
  version?: string;
  description?: string;
}

interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  description?: string;
}

interface OpenAPIRequestBody {
  required: boolean;
  content: {
    'application/json': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schema: any;
    };
  };
}

interface OpenAPIResponse {
  description: string;
  content?: {
    'application/json': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      schema: any;
    };
  };
}

interface OpenAPIOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
}

export interface OpenAPIDocument {
  openapi: '3.0.3';
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schemas: Record<string, any>;
  };
  tags?: { name: string }[];
}

const REF_PREFIX = '#/components/schemas/';

/**
 * Express path params (`:foo`) -> OpenAPI path params (`{foo}`).
 */
function expressToOpenApiPath(p: string): string {
  return p.replace(/:([A-Za-z_][\w]*)/g, '{$1}');
}

/**
 * Compose the full path from basePath + module name + endpoint pathname,
 * normalising slashes.
 */
function fullPath(basePath: string, moduleName: string, pathname: string): string {
  const joined = slash(path.join('/', basePath, moduleName, pathname || ''));
  return expressToOpenApiPath(joined);
}

/**
 * Convert a class-validator-jsonschema generated schema into OpenAPI parameters.
 * For path params, force required=true (OpenAPI requires it).
 */
function paramsFromSchema(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  location: 'path' | 'query',
): OpenAPIParameter[] {
  if (!schema?.properties) return [];
  const required: string[] = schema.required || [];
  return Object.entries(schema.properties).map(
    ([name, propSchema]) => ({
      name,
      in: location,
      required: location === 'path' ? true : required.includes(name),
      schema: propSchema,
    }),
  );
}

/**
 * Generate an OpenAPI 3.0.3 spec from a list of registered ApiReaders.
 */
export class OpenAPIGenerator {
  generate(args: {
    apiReaders: ApiReader[];
    basePath: string;
    info?: OpenAPIInfo;
  }): OpenAPIDocument {
    const { apiReaders, basePath } = args;

    // Convert all class-validator decorated DTOs into JSON schemas at once.
    // class-validator-jsonschema reads the global metadata storage, so any DTO
    // imported by the time this runs is included automatically.
    const schemas = validationMetadatasToSchemas({
      refPointerPrefix: REF_PREFIX,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as Record<string, any>;

    const paths: OpenAPIDocument['paths'] = {};
    const tagSet = new Set<string>();

    for (const reader of apiReaders) {
      if (reader.requiereRender()) continue; // skip view-rendering endpoints

      const url = fullPath(basePath, reader.moduleName, reader.pathname);
      paths[url] = paths[url] || {};

      const tags =
        reader.apiTags.length > 0 ? reader.apiTags : [reader.moduleName];
      tags.forEach((t) => tagSet.add(t));

      const parameters: OpenAPIParameter[] = [];
      if (reader.ParamsSchema) {
        parameters.push(
          ...paramsFromSchema(schemas[reader.ParamsSchema.name], 'path'),
        );
      }
      if (reader.QuerySchema) {
        parameters.push(
          ...paramsFromSchema(schemas[reader.QuerySchema.name], 'query'),
        );
      }
      // Infer path params from the URL if @Params didn't declare them.
      // OpenAPI requires every {placeholder} in a path to have a parameter.
      const declaredPathNames = new Set(
        parameters.filter((p) => p.in === 'path').map((p) => p.name),
      );
      const inUrl = url.matchAll(/\{([^}]+)\}/g);
      for (const m of inUrl) {
        if (!declaredPathNames.has(m[1])) {
          parameters.push({
            name: m[1],
            in: 'path',
            required: true,
            schema: { type: 'string' },
          });
        }
      }

      let requestBody: OpenAPIRequestBody | undefined;
      if (reader.BodySchema) {
        requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: REF_PREFIX + reader.BodySchema.name },
            },
          },
        };
      }

      const responses: Record<string, OpenAPIResponse> = {};
      if (reader.apiResponses.length > 0) {
        for (const r of reader.apiResponses) {
          const entry: OpenAPIResponse = {
            description: r.description ?? `Status ${r.status}`,
          };
          if (r.Schema) {
            entry.content = {
              'application/json': {
                schema: { $ref: REF_PREFIX + r.Schema.name },
              },
            };
          }
          responses[String(r.status)] = entry;
        }
      } else {
        responses['200'] = { description: 'OK' };
      }

      const op: OpenAPIOperation = {
        tags,
        responses,
      };
      if (reader.apiSummary) op.summary = reader.apiSummary;
      if (reader.apiDescription) op.description = reader.apiDescription;
      if (parameters.length > 0) op.parameters = parameters;
      if (requestBody) op.requestBody = requestBody;

      paths[url][reader.method] = op;
    }

    return {
      openapi: '3.0.3',
      info: {
        title: args.info?.title ?? 'API',
        version: args.info?.version ?? '1.0.0',
        description: args.info?.description,
      },
      paths,
      components: { schemas },
      tags: Array.from(tagSet)
        .sort()
        .map((name) => ({ name })),
    };
  }
}
