export interface SchemaApiPropertyMetadata {
  required?: boolean;
  enum?: any[] | Record<string, any>;
  enumName?: string;
  description?: string;
  example?: string;
}

export interface ApiResponseOptions {
  status?: number;
  type: any;
  description?: string;
  isArray?: boolean;
}
