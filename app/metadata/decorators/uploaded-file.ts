import { UploadedFileMetadata } from '../interfaces/upload-metadata';
import { UPLOADED_FILE_METADATA } from '../keys';

/**
 * Middleware for handling multipart/form-data, which is primarily used for uploading files
 * @param filename Shared name of the multipart form fields to process.
 * @param maxCount Optional. Maximum number of files to process. (default: 1)
 */
export function UploadedFile(filename: string, maxCount = 1) {
  return function (target: any, methodKey: string, index: number) {
    const metadata: UploadedFileMetadata = {
      index,
      filename,
      maxCount,
    };
    Reflect.defineMetadata(UPLOADED_FILE_METADATA, metadata, target, methodKey);
  };
}
