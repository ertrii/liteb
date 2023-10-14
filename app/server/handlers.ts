import isException from '../utilities/is-exception';
import { Request, Response } from 'express';
import { InternalException } from '..';
import { MetadataControllerMethod } from '../metadata/interfaces/controller-metadata';
import multer from 'multer';
const upload = multer();

export default function handlers(method: MetadataControllerMethod) {
  const metadata = method.metadata;
  const list: Array<(...params: any) => void> = [];

  if (metadata.uploaded !== undefined) {
    const max = metadata.uploaded.maxCount;
    const filename = metadata.uploaded.filename;
    if (max > 1) {
      list.push(upload.array(filename, max));
    } else {
      list.push(upload.single(filename));
    }
  }

  list.push(async function (req: Request, res: Response) {
    /**
     * Atributos que recibirá el método del controlador
     */
    const attrs: any[] = [];

    if (metadata.param !== undefined) {
      attrs[metadata.param.index] = req.params[metadata.param.name];
    }

    if (metadata.body !== undefined) {
      attrs[metadata.body.index] = req.body;
    }

    if (metadata.uploaded !== undefined) {
      const max = metadata.uploaded.maxCount;
      attrs[metadata.uploaded.index] = max > 1 ? req.files : req.file;
    }

    if (metadata.query !== undefined) {
      attrs[metadata.query.index] = req.query;
    }

    if (metadata.res !== undefined) {
      attrs[metadata.res.index] = res;
    }

    if (metadata.req !== undefined) {
      attrs[metadata.req.index] = req;
    }

    if (metadata.header !== undefined) {
      attrs[metadata.header.index] = req.headers;
    }

    try {
      /**
       * Datos que retorna el método del controlador
       */
      const data = await method.func(...attrs);
      /**
       * Respondiendo al cliente en formato JSON
       */
      res.json(data);
    } catch (error) {
      if (isException(error)) {
        res.status(error.status).json(error);
      } else {
        const internalException = new InternalException(error);
        res.status(internalException.status).json(internalException);
      }
    }
  });

  return list;
}
