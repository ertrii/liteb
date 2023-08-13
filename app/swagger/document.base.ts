import { OpenAPIObject } from './interfaces/open-api-spec';

export const buildDocumentBase = (): OpenAPIObject => ({
  openapi: '3.0.1',
  info: {
    title: '',
    description: '',
    version: '1.0.0',
    contact: {},
  },
  servers: [],
  tags: [],
  paths: {},
  components: {},
});
