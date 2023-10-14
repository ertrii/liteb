import { NextFunction, Request, Response } from 'express';
import bodyExpect from './body-expect';
import queryExpect from './query-expect';
import {
  ControllerMetadata,
  MethodMetaData,
} from '../metadata/interfaces/controller-metadata';
import runGuard from './run-guard';
import multer from 'multer';
const upload = multer();

export default function middleware(
  controller: ControllerMetadata,
  metadata: MethodMetaData,
) {
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

  list.push(async function (req: Request, res: Response, next: NextFunction) {
    const forbiddenOrInternalException = await runGuard(
      [req, res, next],
      controller.guard || metadata.guard,
    );
    if (forbiddenOrInternalException) {
      res
        .status(forbiddenOrInternalException.status)
        .json(forbiddenOrInternalException);
      return;
    }

    /**
     * Validando query schema
     */
    const devException = await queryExpect(req.query, metadata.query);
    if (devException) {
      res.status(devException.status).json(devException);
      return;
    }

    /**
     * Validando body schema
     */
    const schemaException = await bodyExpect(req.body, metadata.body);
    if (schemaException) {
      res.status(schemaException.status).json(schemaException);
      return;
    }

    next();
  });

  return list;
}
