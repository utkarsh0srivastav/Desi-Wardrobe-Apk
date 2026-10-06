import { OperationType } from '../firebase';
import { Product } from '../types/models';
import { storage } from '../utils/storage';
import { persistProductToFirestore } from './productService';

export const inventoryService = {
  reserveProductStock: (productId: string, requestedQty: number): Product => {
    if (requestedQty <= 0) {
      throw new Error('Quantity must be at least 1.');
    }

    const products = storage.getProducts();
    const index = products.findIndex((p) => p.productId === productId);
    if (index === -1) {
      throw new Error('Product not found.');
    }

    const product = products[index];
    if (product.quantity <= 0) {
      throw new Error('Out of Stock');
    }
    if (requestedQty > product.quantity) {
      throw new Error(`Only ${product.quantity} unit(s) available.`);
    }

    const updated: Product = {
      ...product,
      quantity: product.quantity - requestedQty,
    };

    products[index] = updated;
    storage.saveProducts(products);
    void persistProductToFirestore(updated, OperationType.UPDATE);
    return updated;
  },

  confirmSold: (productId: string, soldQty: number, wasPreviouslyReleased: boolean): void => {
    const products = storage.getProducts();
    const index = products.findIndex((p) => p.productId === productId);
    if (index === -1) return;

    const product = products[index];
    let nextQty = product.quantity;

    if (wasPreviouslyReleased) {
      if (product.quantity < soldQty) {
        throw new Error('Insufficient stock to mark this released order as SOLD.');
      }
      nextQty = product.quantity - soldQty;
    }

    const updated: Product = {
      ...product,
      quantity: nextQty,
      soldCount: (product.soldCount || 0) + soldQty,
    };
    products[index] = updated;
    storage.saveProducts(products);
    void persistProductToFirestore(updated, OperationType.UPDATE);
  },

  releaseStockOnNotSold: (productId: string, releaseQty: number, wasPreviouslySold: boolean): void => {
    const products = storage.getProducts();
    const index = products.findIndex((p) => p.productId === productId);
    if (index === -1) return;

    const product = products[index];
    const updated: Product = {
      ...product,
      quantity: product.quantity + releaseQty,
      soldCount: wasPreviouslySold
        ? Math.max(0, (product.soldCount || 0) - releaseQty)
        : product.soldCount || 0,
    };
    products[index] = updated;
    storage.saveProducts(products);
    void persistProductToFirestore(updated, OperationType.UPDATE);
  },

  updateQuantity: (productId: string, newQuantity: number): Product => {
    const clamped = Math.max(0, Math.floor(newQuantity));
    const products = storage.getProducts();
    const index = products.findIndex((p) => p.productId === productId);
    if (index === -1) {
      throw new Error('Product not found.');
    }

    const updated: Product = {
      ...products[index],
      quantity: clamped,
    };
    products[index] = updated;
    storage.saveProducts(products);
    void persistProductToFirestore(updated, OperationType.UPDATE);
    return updated;
  },
};
