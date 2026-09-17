import {
  csv,
  DataJson,
  Endpoint,
  HttpGet,
  Group,
  Priority,
} from '../../../../lib';
import { Product } from '../entities/product.entity';

/**
 * The same list as `list-products`, as a spreadsheet.
 *
 * `columns` is not decoration: without it the export carries every column the
 * entity happens to have — internal ids, timestamps — and whoever receives the
 * file has to be told which ones to ignore. Naming them also keeps the headers
 * in the language the reader speaks.
 */
@Group('products')
@HttpGet('export')
@Priority(1)
export default class ExportProductsEndpoint extends Endpoint {
  private readonly products = this.db.getRepository(Product);

  public async main(): Promise<DataJson> {
    this.auth.assert('catalog.products.view');
    const products = await this.products.find({ order: { name: 'ASC' } });

    return csv(products, {
      filename: 'Catálogo de productos.csv',
      columns: [
        { key: 'name', header: 'Producto' },
        { key: 'price', header: 'Precio' },
        { key: 'stock', header: 'Stock' },
      ],
    });
  }
}
