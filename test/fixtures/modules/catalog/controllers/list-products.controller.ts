import { Endpoint, HttpGet, Module } from '../../../../../lib';
import { Product } from '../product.entity';

@HttpGet('productos')
@Module('catalogo')
export default class ListProducts extends Endpoint {
  async main() {
    // Lo que importa: el repositorio de una entidad que aporta el módulo.
    const productos = await this.db.getRepository(Product).find();
    return { productos };
  }
}
