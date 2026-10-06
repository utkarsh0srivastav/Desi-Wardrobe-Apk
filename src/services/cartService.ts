import { CartItem, Product } from '../types/models';
import { CustomerPublicShop, toCustomerPublicShop } from '../utils/category';
import { storage } from '../utils/storage';
import { productService } from './productService';
import { shopService } from './shopService';

/**
 * Cart Service — DESI WARDROBE
 *
 * CRITICAL BUSINESS RULE:
 * ADD TO CART MUST NOT RESERVE STOCK.
 * Customer Cart items only include CustomerPublicShop (never Shopkeeper personal mobile).
 */

export interface EnrichedCartItem extends CartItem {
  product: Product;
  shop: CustomerPublicShop;
  maxAvailable: number;
  isOutOfStock: boolean;
}

export const cartService = {
  getEnrichedCartItems: (): EnrichedCartItem[] => {
    const items = storage.getCartItems();
    const products = productService.getAllProducts();
    const shops = shopService.getAllShops();

    const enriched: EnrichedCartItem[] = [];
    for (const item of items) {
      const product = products.find((p) => p.productId === item.productId);
      const shop = shops.find((s) => s.shopId === item.shopId);
      if (product && shop) {
        enriched.push({
          ...item,
          product,
          shop: toCustomerPublicShop(shop),
          maxAvailable: product.quantity,
          isOutOfStock: product.quantity <= 0,
        });
      }
    }
    return enriched;
  },

  addToCart: (params: {
    customerId?: string;
    productId: string;
    shopId: string;
    size: string;
    color: string;
    quantity: number;
  }): CartItem => {
    if (!params.size) {
      throw new Error('Please select a size.');
    }
    if (!params.color) {
      throw new Error('Please select a color.');
    }
    if (!params.quantity || params.quantity <= 0) {
      throw new Error('Please select a valid quantity.');
    }

    const allItems = storage.getCartItems();
    const existingIndex = allItems.findIndex(
      (item) =>
        item.productId === params.productId &&
        item.size === params.size &&
        item.color === params.color
    );

    if (existingIndex !== -1) {
      const updatedItem: CartItem = {
        ...allItems[existingIndex],
        quantity: allItems[existingIndex].quantity + params.quantity,
        addedAt: new Date().toISOString(),
      };
      allItems[existingIndex] = updatedItem;
      storage.saveCartItems(allItems);
      return updatedItem;
    }

    const newItem: CartItem = {
      cartItemId: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      customerId: params.customerId || storage.getActiveCustomerId() || undefined,
      productId: params.productId,
      shopId: params.shopId,
      size: params.size,
      color: params.color,
      quantity: params.quantity,
      addedAt: new Date().toISOString(),
    };

    storage.saveCartItems([newItem, ...allItems]);
    return newItem;
  },

  updateItemQuantity: (cartItemId: string, nextQuantity: number): void => {
    const items = storage.getCartItems();
    if (nextQuantity <= 0) {
      storage.saveCartItems(items.filter((i) => i.cartItemId !== cartItemId));
      return;
    }
    const updated = items.map((item) =>
      item.cartItemId === cartItemId ? { ...item, quantity: nextQuantity } : item
    );
    storage.saveCartItems(updated);
  },

  removeItem: (cartItemId: string): void => {
    const filtered = storage.getCartItems().filter((item) => item.cartItemId !== cartItemId);
    storage.saveCartItems(filtered);
  },

  getEnrichedCart: (): EnrichedCartItem[] => {
    return cartService.getEnrichedCartItems();
  },

  updateCartItemQuantity: (cartItemId: string, nextQuantity: number): void => {
    cartService.updateItemQuantity(cartItemId, nextQuantity);
  },

  removeCartItem: (cartItemId: string): void => {
    cartService.removeItem(cartItemId);
  },

  clearCart: (): void => {
    storage.saveCartItems([]);
  },
};
