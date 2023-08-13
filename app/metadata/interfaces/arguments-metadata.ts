/**
 * @decorator Body(Schema: Class)
 */
export interface BodyMetadata {
  /**
   * Ubicación del body parameter
   */
  index: number;
  /**
   * Tipo de dato
   */
  type: string;
  /**
   * Schema para validación
   */
  Schema?: new () => Record<string, any>;
}

/**
 * @decorator Query(Schema: Class)
 */
export type QueryMetadata = BodyMetadata;

/**
 * @decorator Header()
 */
export interface HeaderMetadata {
  /**
   * Ubicación del body parameter
   */
  index: number;
  /**
   * Tipo de dato
   */
  type: string;
}

/**
 * @decorator Params()
 */
export interface ParamMetadata {
  /**
   * Nombre del path url
   */
  name: string;
  /**
   * Ubicación del body parameter
   */
  index: number;
  /**
   * Tipo de dato
   */
  type: string;
}

/**
 * @decorator Res()
 */
export interface ResMetadata {
  /**
   * Ubicación del body parameter
   */
  index: number;
}

/**
 * @decorator Req()
 */
export type ReqMetadata = ResMetadata;
