import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../firebase';
import {
  PricePolicy,
  ProfileStatus,
  Shop,
  ShopCategory,
  Shopkeeper,
  ShopStatus,
} from '../types/models';
import {
  CustomerPublicShop,
  normalizeShopCategory,
  toCustomerPublicShop,
} from '../utils/category';
import { hashPinSync } from '../utils/crypto';
import { storage } from '../utils/storage';
import { isValidActiveCompletedShop, isValidCoordinate } from './locationService';
import { persistShopkeeperToFirestore } from './shopkeeperService';

function normalizeFirestoreShopDocument(raw: Record<string, unknown>, docId: string): Shop | null {
  const shopId =
    typeof raw.shopId === 'string' && raw.shopId.trim() ? raw.shopId.trim() : docId;
  const shopName =
    typeof raw.shopName === 'string' && raw.shopName.trim()
      ? raw.shopName.trim()
      : typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : '';

  const locObj =
    raw.location && typeof raw.location === 'object'
      ? (raw.location as Record<string, unknown>)
      : null;

  const rawLat =
    raw.latitude !== undefined
      ? Number(raw.latitude)
      : locObj?.latitude !== undefined
        ? Number(locObj.latitude)
        : locObj?.lat !== undefined
          ? Number(locObj.lat)
          : NaN;

  const rawLng =
    raw.longitude !== undefined
      ? Number(raw.longitude)
      : locObj?.longitude !== undefined
        ? Number(locObj.longitude)
        : locObj?.lng !== undefined
          ? Number(locObj.lng)
          : NaN;

  if (!shopId || !shopName || !isValidCoordinate(rawLat, rawLng)) {
    return null;
  }

  const rawShopStatus =
    typeof raw.shopStatus === 'string' && raw.shopStatus.trim()
      ? (raw.shopStatus.trim().toUpperCase() as ShopStatus)
      : 'ACTIVE';

  const hasExplicitProfileStatus =
    typeof raw.profileStatus === 'string' && raw.profileStatus.trim().length > 0;
  const rawProfileStatus: ProfileStatus = hasExplicitProfileStatus
    ? (String(raw.profileStatus).trim().toUpperCase() as ProfileStatus)
    : rawShopStatus === 'ACTIVE'
      ? 'COMPLETED'
      : 'INCOMPLETE';

  const locationName =
    typeof raw.locationName === 'string' && raw.locationName.trim()
      ? raw.locationName.trim()
      : typeof raw.address === 'string' && raw.address.trim()
        ? raw.address.trim()
        : `Lat ${rawLat.toFixed(4)}, Lng ${rawLng.toFixed(4)}`;

  const category = normalizeShopCategory(
    typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'BOTH'
  ) as ShopCategory;

  const pricePolicy = (
    typeof raw.pricePolicy === 'string' && raw.pricePolicy.trim()
      ? raw.pricePolicy.trim()
      : 'FIXED_PRICE'
  ) as PricePolicy;

  return {
    shopId,
    shopkeeperId:
      typeof raw.shopkeeperId === 'string' && raw.shopkeeperId.trim()
        ? raw.shopkeeperId.trim()
        : `sk-${shopId}`,
    shopName,
    shopkeeperName:
      typeof raw.shopkeeperName === 'string' && raw.shopkeeperName.trim()
        ? raw.shopkeeperName.trim()
        : typeof raw.ownerName === 'string' && raw.ownerName.trim()
          ? raw.ownerName.trim()
          : shopName,
    mobile:
      typeof raw.mobile === 'string' && raw.mobile.trim()
        ? raw.mobile.trim()
        : typeof raw.shopMobile === 'string' && raw.shopMobile.trim()
          ? raw.shopMobile.trim()
          : '',
    photo:
      typeof raw.photo === 'string' && raw.photo.trim()
        ? raw.photo.trim()
        : typeof raw.shopPhoto === 'string' && raw.shopPhoto.trim()
          ? raw.shopPhoto.trim()
          : '',
    category,
    pricePolicy,
    latitude: Number(rawLat.toFixed(6)),
    longitude: Number(rawLng.toFixed(6)),
    locationName,
    shopStatus: rawShopStatus,
    profileStatus: rawProfileStatus,
    openingTime:
      typeof raw.openingTime === 'string' && raw.openingTime.trim()
        ? raw.openingTime.trim()
        : '10:00 AM',
    closingTime:
      typeof raw.closingTime === 'string' && raw.closingTime.trim()
        ? raw.closingTime.trim()
        : '09:00 PM',
    status: raw.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    updatedAt:
      typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    createdAt:
      typeof raw.createdAt === 'string' && raw.createdAt.trim()
        ? raw.createdAt.trim()
        : new Date().toISOString(),
  };
}

function sanitizeShopForFirestore(shop: Shop): Shop {
  return {
    shopId: shop.shopId,
    shopkeeperId: shop.shopkeeperId,
    shopName: shop.shopName.slice(0, 120),
    shopkeeperName: shop.shopkeeperName.slice(0, 120),
    mobile: shop.mobile.slice(0, 15),
    photo: shop.photo,
    category: normalizeShopCategory(shop.category),
    pricePolicy: shop.pricePolicy || 'FIXED_PRICE',
    latitude: Number(Number(shop.latitude).toFixed(6)),
    longitude: Number(Number(shop.longitude).toFixed(6)),
    locationName: shop.locationName.slice(0, 300),
    shopStatus: shop.shopStatus || 'ACTIVE',
    profileStatus: shop.profileStatus || 'COMPLETED',
    openingTime: (shop.openingTime || '10:00 AM').slice(0, 30),
    closingTime: (shop.closingTime || '09:00 PM').slice(0, 30),
    status: shop.status || 'OPEN',
    updatedAt: new Date().toISOString(),
    createdAt: shop.createdAt,
  };
}

export async function persistShopToFirestore(shop: Shop, op: OperationType): Promise<void> {
  const path = `shops/${shop.shopId}`;
  try {
    const cleanShop = sanitizeShopForFirestore(shop);
    await setDoc(doc(db, 'shops', shop.shopId), cleanShop);
  } catch (error) {
    handleFirestoreError(error, op, path);
  }
}

export const shopService = {
  getAllShops: (): Shop[] => {
    return storage.getShops();
  },

  /**
   * Returns only valid ACTIVE + COMPLETED shops for customer discovery.
   */
  getActiveShops: (): Shop[] => {
    return storage.getShops().filter(isValidActiveCompletedShop);
  },

  getShopById: (shopId: string): Shop | undefined => {
    return storage.getShops().find((s) => s.shopId === shopId);
  },

  /**
   * Returns a Customer-safe Shop object with Shopkeeper personal mobile and contact details removed.
   */
  getCustomerPublicShopById: (shopId: string): CustomerPublicShop | undefined => {
    const shop = storage.getShops().find((s) => s.shopId === shopId);
    return shop ? toCustomerPublicShop(shop) : undefined;
  },

  getShopByShopkeeperId: (shopkeeperId: string): Shop | undefined => {
    return storage.getShops().find((s) => s.shopkeeperId === shopkeeperId);
  },

  /**
   * Real-time Firestore listener (onSnapshot) for shops.
   * Listens to shops with shopStatus in ['ACTIVE', 'REMOVED', 'INCOMPLETE', 'PRE_REGISTERED', 'PENDING']
   * so that:
   * - Customers immediately see newly ACTIVE + COMPLETED shops within 100 KM
   * - If a shop becomes REMOVED by Admin, it immediately disappears from Customer Home without refresh
   * - Admin can view and manage both ACTIVE and REMOVED shops
   */
  subscribeToActiveShops: (
    onUpdate: (activeShops: Shop[], hasLoadedFromFirestore: boolean) => void
  ): (() => void) => {
    const shopsQuery = query(
      collection(db, 'shops'),
      where('shopStatus', 'in', ['ACTIVE', 'REMOVED', 'INCOMPLETE', 'PRE_REGISTERED', 'PENDING'])
    );
    return onSnapshot(
      shopsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const allRemoteShops: Shop[] = [];
        const remoteIds = new Set<string>();

        snapshot.forEach((docSnap) => {
          const rawData = docSnap.data() as Record<string, unknown>;
          const normalized = normalizeFirestoreShopDocument(rawData, docSnap.id);
          if (normalized) {
            allRemoteShops.push(normalized);
            remoteIds.add(normalized.shopId);
          }
        });

        storage.saveShops(allRemoteShops);
        const activeCompletedShops = allRemoteShops.filter(isValidActiveCompletedShop);
        onUpdate(activeCompletedShops, true);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'shops');
      }
    );
  },

  registerShopkeeperAndShop: (params: {
    mobile: string;
    pin: string;
    shopkeeperName: string;
    shopName: string;
    shopMobile: string;
    photo: string;
    category: ShopCategory;
    pricePolicy?: PricePolicy;
    latitude: number;
    longitude: number;
    locationName: string;
    shopStatus?: ShopStatus;
    profileStatus?: ProfileStatus;
  }): { shopkeeper: Shopkeeper; shop: Shop } => {
    const cleanAuthMobile = params.mobile.replace(/\D/g, '');
    const cleanShopMobile = params.shopMobile.replace(/\D/g, '');

    if (!/^[6-9]\d{9}$/.test(cleanAuthMobile)) {
      throw new Error('Invalid shopkeeper mobile number.');
    }
    if (!params.shopkeeperName.trim()) {
      throw new Error('Please enter the Shopkeeper Name.');
    }
    if (!params.shopName.trim()) {
      throw new Error('Please enter the Shop Name.');
    }
    if (!/^[6-9]\d{9}$/.test(cleanShopMobile)) {
      throw new Error('Please enter a valid 10-digit Shop Mobile Number.');
    }
    if (!params.photo) {
      throw new Error('Please upload a primary Shop Photo.');
    }
    if (!isValidCoordinate(params.latitude, params.longitude)) {
      throw new Error('Please set your Shop Location.');
    }
    if (!params.locationName.trim()) {
      throw new Error('Please enter your Shop Location / Area name.');
    }

    const now = new Date().toISOString();

    const existingSk = storage.getShopkeepers().find((sk) => sk.mobile === cleanAuthMobile);
    const shopkeeperId = existingSk?.shopkeeperId || `sk-${cleanAuthMobile}`;
    const shopId =
      existingSk?.shopId || `shop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const hashedPin =
      params.pin && !params.pin.startsWith('sha256_dw_')
        ? hashPinSync(params.pin, cleanAuthMobile)
        : existingSk?.pin || hashPinSync('0000', cleanAuthMobile);

    const newShopkeeper: Shopkeeper = {
      shopkeeperId,
      name: params.shopkeeperName.trim().slice(0, 120),
      mobile: cleanAuthMobile,
      pin: hashedPin,
      shopId,
      registrationStatus: 'COMPLETED',
      verificationStatus: 'VERIFIED',
      approvalStatus: 'APPROVED',
      pinCreated: true,
      profileStatus: 'COMPLETED',
      createdAt: existingSk?.createdAt || now,
      verifiedAt: existingSk?.verifiedAt || now,
      approvedAt: existingSk?.approvedAt || now,
    };

    const newShop: Shop = {
      shopId,
      shopkeeperId,
      shopName: params.shopName.trim().slice(0, 120),
      shopkeeperName: params.shopkeeperName.trim().slice(0, 120),
      mobile: cleanShopMobile,
      photo: params.photo,
      category: params.category,
      pricePolicy: params.pricePolicy || 'FIXED_PRICE',
      latitude: Number(params.latitude.toFixed(6)),
      longitude: Number(params.longitude.toFixed(6)),
      locationName: params.locationName.trim().slice(0, 300),
      shopStatus: params.shopStatus || 'ACTIVE',
      profileStatus: params.profileStatus || 'COMPLETED',
      openingTime: '10:00 AM',
      closingTime: '09:00 PM',
      status: 'OPEN',
      updatedAt: now,
      createdAt: now,
    };

    const shopkeepers = storage.getShopkeepers().filter((sk) => sk.mobile !== cleanAuthMobile);
    const shops = storage.getShops().filter((s) => s.shopId !== shopId);

    storage.saveShopkeepers([newShopkeeper, ...shopkeepers]);
    storage.saveShops([newShop, ...shops]);
    storage.setActiveShopkeeperId(shopkeeperId);

    void persistShopkeeperToFirestore(newShopkeeper, OperationType.WRITE);
    void persistShopToFirestore(newShop, OperationType.CREATE);

    return { shopkeeper: newShopkeeper, shop: newShop };
  },

  updateShopProfile: (
    shopId: string,
    updates: {
      shopkeeperName: string;
      shopName: string;
      mobile: string;
      photo: string;
      category: ShopCategory;
      pricePolicy?: PricePolicy;
      latitude: number;
      longitude: number;
      locationName: string;
      shopStatus?: ShopStatus;
      profileStatus?: ProfileStatus;
    }
  ): Shop => {
    const cleanShopMobile = updates.mobile.replace(/\D/g, '');
    if (!updates.shopkeeperName.trim()) {
      throw new Error('Shopkeeper Name cannot be empty.');
    }
    if (!updates.shopName.trim()) {
      throw new Error('Shop Name cannot be empty.');
    }
    if (!/^[6-9]\d{9}$/.test(cleanShopMobile)) {
      throw new Error('Please enter a valid 10-digit Shop Mobile Number.');
    }
    if (!updates.photo) {
      throw new Error('Shop Photo is required.');
    }
    if (!isValidCoordinate(updates.latitude, updates.longitude)) {
      throw new Error('Valid Shop Coordinates are required.');
    }
    if (!updates.locationName.trim()) {
      throw new Error('Shop Location Name is required.');
    }

    const shops = storage.getShops();
    const index = shops.findIndex((s) => s.shopId === shopId);
    if (index === -1) {
      throw new Error('Shop record not found.');
    }

    const nextPolicy = updates.pricePolicy || shops[index].pricePolicy || 'FIXED_PRICE';
    const nextShopStatus = updates.shopStatus || shops[index].shopStatus || 'ACTIVE';
    const nextProfileStatus = updates.profileStatus || 'COMPLETED';

    const updatedShop: Shop = {
      ...shops[index],
      shopkeeperName: updates.shopkeeperName.trim().slice(0, 120),
      shopName: updates.shopName.trim().slice(0, 120),
      mobile: cleanShopMobile,
      photo: updates.photo,
      category: updates.category,
      pricePolicy: nextPolicy,
      latitude: Number(updates.latitude.toFixed(6)),
      longitude: Number(updates.longitude.toFixed(6)),
      locationName: updates.locationName.trim().slice(0, 300),
      shopStatus: nextShopStatus,
      profileStatus: nextProfileStatus,
      updatedAt: new Date().toISOString(),
    };

    shops[index] = updatedShop;
    storage.saveShops(shops);

    const shopkeepers = storage.getShopkeepers().map((sk) => {
      if (sk.shopkeeperId === updatedShop.shopkeeperId) {
        const updatedSk: Shopkeeper = {
          ...sk,
          name: updates.shopkeeperName.trim().slice(0, 120),
          profileStatus: nextProfileStatus,
        };
        void persistShopkeeperToFirestore(updatedSk, OperationType.UPDATE);
        return updatedSk;
      }
      return sk;
    });
    storage.saveShopkeepers(shopkeepers);

    const products = storage.getProducts().map((p) =>
      p.shopId === shopId ? { ...p, pricePolicy: nextPolicy } : p
    );
    storage.saveProducts(products);

    void persistShopToFirestore(updatedShop, OperationType.UPDATE);

    return updatedShop;
  },

  /**
   * SECTION 35 — ADMIN SHOP MANAGEMENT
   * Admin can ACTIVATE or REMOVE/DEACTIVATE a shop (setting shopStatus = ACTIVE or REMOVED).
   * Does NOT delete historical bookings.
   */
  updateShopStatusByAdmin: async (
    shopId: string,
    nextStatus: 'ACTIVE' | 'REMOVED'
  ): Promise<Shop> => {
    const shops = storage.getShops();
    const index = shops.findIndex((s) => s.shopId === shopId);
    if (index === -1) {
      throw new Error('Shop not found.');
    }

    const updatedShop: Shop = {
      ...shops[index],
      shopStatus: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    shops[index] = updatedShop;
    storage.saveShops(shops);
    await persistShopToFirestore(updatedShop, OperationType.UPDATE);
    return updatedShop;
  },
};
