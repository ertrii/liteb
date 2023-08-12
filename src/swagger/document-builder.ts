import { buildDocumentBase } from './document.base';
import { OpenAPIObject } from './interfaces/open-api-spec';

export default class DocumentBuilder {
  document: OpenAPIObject = buildDocumentBase();

  setTitle(title: string) {
    this.document.info.title = title;
    return this;
  }

  setDescription(description: string) {
    this.document.info.description = description;
    return this;
  }

  setVersion(version: string) {
    this.document.info.version = version;
    return this;
  }

  addServer(url: string, description?: string) {
    this.document.servers.push({
      url,
      description,
    });
    return this;
  }

  addTag(name: string, description?: string) {
    this.document.tags.push({ name, description });
    return this;
  }

  build() {
    return this;
  }
}
