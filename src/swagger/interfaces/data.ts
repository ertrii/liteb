import { SchemaApiPropertyMetadata } from './api';

export interface PropertyMetaData extends SchemaApiPropertyMetadata {
  name: string;
  className: string;
  type: string;
}
