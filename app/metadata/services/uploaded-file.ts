import { UploadedFileMetadata } from '../interfaces/upload-metadata';
import { UPLOADED_FILE_METADATA } from '../keys';

export function getMetadataUploadFile(
  controller: Record<string, any>,
  methodName: string,
): UploadedFileMetadata | undefined {
  return Reflect.getMetadata(UPLOADED_FILE_METADATA, controller, methodName);
}
