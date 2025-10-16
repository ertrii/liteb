import { DataSource, QueryRunner, ReplicationMode } from 'typeorm';
import { Service } from '../templates/service';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

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
    mode?: ReplicationMode,
  ) {
    this.queryRunner = db.createQueryRunner(mode);
  }

  /**
   * Añade a la cola el servicio para el posterior registro a la base de datos.
   * @param service
   */
  public add = (service: Service<any>) => {
    this.queues.push(service);
  };

  /**
   * Ejecuta todas las operaciones pendientes en la cola, realizando las consultas asociadas a cada servicio.
   * Si la transacción aún no ha comenzado, la inicia automáticamente antes de aplicar los cambios.
   * Limpia la cola tras procesar las operaciones.
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
   * Aplica todas las consultas acumuladas en la cola, confirma la transacción en la base de datos
   * y, opcionalmente, libera la conexión utilizada por el query runner. Utilice este método
   * para garantizar que todas las operaciones se ejecutan de forma atómica y los recursos se liberan correctamente.
   * @param release Indica si se debe liberar la conexión después de ejecutar el commit (por defecto: true).
   */
  public commit = async (release = true) => {
    await this.save();
    await this.queryRunner.commitTransaction();
    if (release) {
      await this.release();
    }
  };

  /**
   * Releases used database connection. You cannot use query runner methods after connection is released.
   */
  public release = async () => {
    await this.queryRunner.release();
  };

  public getManager = () => {
    return this.queryRunner.manager;
  };

  public getRunner = () => {
    return this.queryRunner;
  };
}
