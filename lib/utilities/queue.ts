import { DataSource, QueryRunner } from 'typeorm';
import { Service } from '../templates/service';
import { InternalError } from './errors';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { extname } from 'path';

export class Queue {
  private started = false;
  private queryRunner: QueryRunner;
  /**
   * Colas
   */
  private queues: Service<any>[] = [];

  private start = async () => {
    await this.queryRunner.connect();
    return this.queryRunner.startTransaction(this.isolationLevel);
  };

  constructor(
    db: DataSource,
    private isolationLevel?: IsolationLevel,
  ) {
    this.queryRunner = db.createQueryRunner();
  }

  /**
   * Añade a la cola el servicio para el posterior registro a la base de datos.
   * @param service
   */
  public add = (service: Service<any>) => {
    this.queues.push(service);
  };

  /**
   * Aplica las consultas
   */
  public save = async () => {
    if (!this.started) {
      await this.start();
      this.started = true;
    }
    const saving = this.queues.map((data) => {
      return data.commit(this.queryRunner);
    });
    await Promise.all(saving);
    this.queues = [];
  };

  /**
   * Aplica las consultas y finaliza
   */
  public commit = async () => {
    try {
      await this.save();
      await this.queryRunner.commitTransaction();
    } catch (error) {
      await this.queryRunner.rollbackTransaction();
      throw new InternalError(error as Error);
    } finally {
      await this.queryRunner.release();
    }
  };

  public getManager = () => {
    return this.queryRunner.manager;
  };

  public getRunner = () => {
    return this.queryRunner;
  };
}
