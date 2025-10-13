import { Glob } from 'glob';
import { pathToFileURL } from 'url';

type ModuleFile<T = any> = T;

export default class PatternResolve<T = any> {
  private sizes: number = 0;
  private readonly ignore = ['**/node_modules/**'];
  private modules: ModuleFile<T[]>[] = [];

  constructor(private pattern: string) {}

  public async read() {
    const glob = new Glob(this.pattern, { ignore: this.ignore });
    for await (const file of glob) {
      pathToFileURL(file);
      const mod = await require(pathToFileURL(file).href);
      const exported: T[] = Object.values(mod);
      if (exported.length > 0) {
        this.modules.push(exported);
        this.sizes++;
      }
    }
  }

  public hasExport = () => {
    return this.sizes > 0;
  };

  public getSizes = () => this.sizes;

  public getModules = () => this.modules as ModuleFile<T[]>[];
}
