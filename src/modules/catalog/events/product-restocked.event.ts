import { event } from '../../../../lib';

/**
 * Announced after stock goes up. Catalog does not know or care who reacts —
 * that is the difference with a contract, where it would be asking someone in
 * particular to do something and waiting for the answer.
 */
export interface ProductRestocked {
  productId: number;
  quantity: number;
  stock: number;
  userId: number;
}

export const ProductRestocked = event<ProductRestocked>(
  'catalog.product.restocked',
);
