import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../firebase';
import { PricePolicy, Product } from '../types/models';
import { storage } from '../utils/storage';
import { shopService } from './shopService';

function sanitizeProductForFirestore(product: Product): Product {
  const cleanQty = Math.max(0, Math.floor(product.quantity));
  return {
    productId: product.productId,
    shopId: product.shopId,
    name: product.name.slice(0, 150),
    description: (product.description || 'Available at our local shop on Desi Wardrobe.').slice(
      0,
      1000
    ),
    price: Math.max(1, Math.round(product.price)),
    quantity: cleanQty,
    soldCount: Math.max(0, Math.floor(product.soldCount || 0)),
    sizes: product.sizes.slice(0, 20),
    colors: product.colors.slice(0, 25),
    images: product.images.slice(0, 8),
    thumbnails: (product.thumbnails || []).slice(0, 8),
    pricePolicy: product.pricePolicy || 'FIXED_PRICE',
    status: cleanQty > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
    createdAt: product.createdAt,
  };
}

export async function persistProductToFirestore(
  product: Product,
  op: OperationType
): Promise<void> {
  const path = `products/${product.productId}`;
  try {
    const clean = sanitizeProductForFirestore(product);
    await setDoc(doc(db, 'products', product.productId), clean);
  } catch (error) {
    handleFirestoreError(error, op, path);
  }
}

export const productService = {
  getAllProducts: (): Product[] => {
    return storage.getProducts();
  },

  getProductsByShopId: (shopId: string): Product[] => {
    return storage.getProducts().filter((p) => p.shopId === shopId);
  },

  getProductById: (productId: string): Product | undefined => {
    return storage.getProducts().find((p) => p.productId === productId);
  },

  subscribeToProducts: (onUpdate: (products: Product[]) => void): (() => void) => {
    const productsQuery = query(collection(db, 'products'), where('price', '>', 0));
    return onSnapshot(
      productsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const remoteProducts: Product[] = [];
        const remoteIds = new Set<string>();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Product;
          if (data && data.productId && data.shopId) {
            remoteProducts.push({
              ...data,
              status: data.quantity > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
            });
            remoteIds.add(data.productId);
          }
        });

        storage.saveProducts(remoteProducts);
        onUpdate(remoteProducts);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'products');
      }
    );
  },

  createProduct: (params: {
    shopId: string;
    name: string;
    description: string;
    price: number;
    quantity: number;
    sizes: string[];
    colors: string[];
    images: string[];
    thumbnails?: string[];
    pricePolicy?: PricePolicy;
  }): Product => {
    if (!params.name.trim()) {
      throw new Error('Please enter a Product Name.');
    }
    if (isNaN(params.price) || params.price <= 0) {
      throw new Error('Please enter a valid price greater than ₹0.');
    }
    if (isNaN(params.quantity) || params.quantity < 0) {
      throw new Error('Quantity cannot be negative.');
    }
    if (params.images.length === 0) {
      throw new Error('Please add at least 1 product photo.');
    }
    if (params.sizes.length === 0) {
      throw new Error('Please select at least 1 size.');
    }
    if (params.colors.length === 0) {
      throw new Error('Please select at least 1 color.');
    }

    const shop = shopService.getShopById(params.shopId);
    const inheritedPolicy: PricePolicy =
      params.pricePolicy || shop?.pricePolicy || 'FIXED_PRICE';
    const cleanQty = Math.max(0, Math.floor(params.quantity));

    const newProduct: Product = {
      productId: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shopId: params.shopId,
      name: params.name.trim().slice(0, 150),
      description: (
        params.description.trim() || 'Available at our local shop on Desi Wardrobe.'
      ).slice(0, 1000),
      price: Math.round(params.price),
      quantity: cleanQty,
      soldCount: 0,
      sizes: params.sizes.slice(0, 20),
      colors: params.colors.slice(0, 25),
      images: params.images.slice(0, 8),
      thumbnails: params.thumbnails?.slice(0, 8) || [],
      pricePolicy: inheritedPolicy,
      status: cleanQty > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
      createdAt: new Date().toISOString(),
    };

    const products = storage.getProducts();
    storage.saveProducts([newProduct, ...products]);
    void persistProductToFirestore(newProduct, OperationType.CREATE);

    return newProduct;
  },

  updateProduct: (
    productId: string,
    updates: Partial<
      Pick<
        Product,
        | 'name'
        | 'description'
        | 'price'
        | 'quantity'
        | 'sizes'
        | 'colors'
        | 'images'
        | 'pricePolicy'
      >
    >
  ): Product => {
    const products = storage.getProducts();
    const index = products.findIndex((p) => p.productId === productId);
    if (index === -1) {
      throw new Error('Product not found.');
    }

    const current = products[index];
    const nextQty =
      updates.quantity !== undefined
        ? Math.max(0, Math.floor(updates.quantity))
        : current.quantity;

    const updated: Product = {
      ...current,
      ...updates,
      name:
        updates.name !== undefined ? updates.name.trim().slice(0, 150) : current.name,
      description:
        updates.description !== undefined
          ? updates.description.trim().slice(0, 1000)
          : current.description,
      price: updates.price !== undefined ? Math.round(updates.price) : current.price,
      quantity: nextQty,
      status: nextQty > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
    };

    if (!updated.name) throw new Error('Product Name cannot be empty.');
    if (updated.price <= 0) throw new Error('Price must be greater than ₹0.');
    if (updated.sizes.length === 0) throw new Error('Please keep at least one size selected.');
    if (updated.colors.length === 0) throw new Error('Please keep at least one color selected.');

    products[index] = updated;
    storage.saveProducts(products);
    void persistProductToFirestore(updated, OperationType.UPDATE);

    return updated;
  },

  adjustQuantityByDelta: (productId: string, delta: number): Product => {
    const product = productService.getProductById(productId);
    if (!product) throw new Error('Product not found.');
    const nextQty = Math.max(0, product.quantity + delta);
    return productService.updateProduct(productId, { quantity: nextQty });
  },

  setAvailabilityStatus: (productId: string, available: boolean): Product => {
    const products = storage.getProducts();
    const index = products.findIndex((p) => p.productId === productId);
    if (index === -1) throw new Error('Product not found.');

    const current = products[index];
    const nextQty = available ? Math.max(1, current.quantity) : 0;
    const updated: Product = {
      ...current,
      quantity: nextQty,
      status: nextQty > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
    };
    products[index] = updated;
    storage.saveProducts(products);
    void persistProductToFirestore(updated, OperationType.UPDATE);

    return updated;
  },

  deleteProduct: (productId: string): void => {
    const products = storage.getProducts().filter((p) => p.productId !== productId);
    storage.saveProducts(products);
    const cartItems = storage.getCartItems().filter((c) => c.productId !== productId);
    storage.saveCartItems(cartItems);

    const path = `products/${productId}`;
    deleteDoc(doc(db, 'products', productId)).catch((error) => {
      handleFirestoreError(error, OperationType.DELETE, path);
    });
  },
};
