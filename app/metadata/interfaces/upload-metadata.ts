export interface UploadedFileMetadata {
  /**
   * Parameter index
   */
  index: number;
  /**
   * Shared name of the multipart form fields to process.
   */
  filename: string;
  /**
   * Optional. Maximum number of files to process. (default: 1)
   */
  maxCount: number;
}
