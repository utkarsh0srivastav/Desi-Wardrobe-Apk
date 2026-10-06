import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../firebase';
import { Shopkeeper } from '../types/models';
import { hashPinSync, verifyPinSync } from '../utils/crypto';
import { storage } from '../utils/storage';

/**
 * Shopkeeper Service — DESI WARDROBE
 *
 * Implements the full Shopkeeper lifecycle backed by Firebase Firestore:
 * 1. Admin Pre-Registration (mobile ONLY, registrationStatus = PRE_REGISTERED)
 * 2. Shopkeeper Mobile Verification (verificationStatus = VERIFIED, approvalStatus = PENDING)
 * 3. Admin Approval / Rejection (approvalStatus = APPROVED | REJECTED)
 * 4. Shopkeeper Creates Own PIN (pinCreated = true, hashed PIN)
 * 5. Shopkeeper Completes Shop Profile (profileStatus = COMPLETED, shopStatus = ACTIVE)
 */

export function sanitizeShopkeeperForFirestore(sk: Shopkeeper): Shopkeeper {
  const clean: Shopkeeper = {
    shopkeeperId: sk.shopkeeperId,
    name: (sk.name || '').slice(0, 120),
    mobile: sk.mobile.slice(0, 15),
    pin: (sk.pin || '').slice(0, 128),
    shopId: (sk.shopId || '').slice(0, 128),
    registrationStatus: sk.registrationStatus || 'PRE_REGISTERED',
    verificationStatus: sk.verificationStatus || 'UNVERIFIED',
    approvalStatus: sk.approvalStatus || 'NONE',
    pinCreated: Boolean(sk.pinCreated),
    profileStatus: sk.profileStatus || 'INCOMPLETE',
    createdAt: sk.createdAt,
  };
  if (sk.verifiedAt) {
    clean.verifiedAt = sk.verifiedAt;
  }
  if (sk.approvedAt) {
    clean.approvedAt = sk.approvedAt;
  }
  return clean;
}

export async function persistShopkeeperToFirestore(
  sk: Shopkeeper,
  op: OperationType
): Promise<void> {
  const path = `shopkeepers/${sk.shopkeeperId}`;
  try {
    const clean = sanitizeShopkeeperForFirestore(sk);
    await setDoc(doc(db, 'shopkeepers', sk.shopkeeperId), clean);
  } catch (error) {
    handleFirestoreError(error, op, path);
  }
}

export const shopkeeperService = {
  getAllShopkeepers: (): Shopkeeper[] => {
    return storage.getShopkeepers();
  },

  getShopkeeperById: (shopkeeperId: string): Shopkeeper | undefined => {
    return storage.getShopkeepers().find((sk) => sk.shopkeeperId === shopkeeperId);
  },

  getShopkeeperByMobile: (mobile: string): Shopkeeper | undefined => {
    const cleanMobile = mobile.replace(/\D/g, '');
    return storage.getShopkeepers().find((sk) => sk.mobile === cleanMobile);
  },

  subscribeToShopkeepers: (onUpdate: (shopkeepers: Shopkeeper[]) => void): (() => void) => {
    const skQuery = query(
      collection(db, 'shopkeepers'),
      where('registrationStatus', 'in', ['PRE_REGISTERED', 'COMPLETED'])
    );
    return onSnapshot(
      skQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const remoteList: Shopkeeper[] = [];
        const remoteIds = new Set<string>();

        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as Partial<Shopkeeper>;
          if (raw && raw.mobile) {
            const skId = raw.shopkeeperId || docSnap.id;
            const hasLegacyShop = Boolean(raw.shopId && raw.pin);
            const normalized: Shopkeeper = {
              shopkeeperId: skId,
              name: raw.name || '',
              mobile: raw.mobile,
              pin: raw.pin || '',
              shopId: raw.shopId || '',
              registrationStatus:
                raw.registrationStatus || (hasLegacyShop ? 'COMPLETED' : 'PRE_REGISTERED'),
              verificationStatus:
                raw.verificationStatus || (hasLegacyShop ? 'VERIFIED' : 'UNVERIFIED'),
              approvalStatus: raw.approvalStatus || (hasLegacyShop ? 'APPROVED' : 'NONE'),
              pinCreated:
                typeof raw.pinCreated === 'boolean' ? raw.pinCreated : Boolean(raw.pin),
              profileStatus:
                raw.profileStatus || (hasLegacyShop ? 'COMPLETED' : 'INCOMPLETE'),
              createdAt: raw.createdAt || new Date().toISOString(),
              verifiedAt: raw.verifiedAt,
              approvedAt: raw.approvedAt,
            };
            remoteList.push(normalized);
            remoteIds.add(normalized.shopkeeperId);
          }
        });

        storage.saveShopkeepers(remoteList);
        const activeSkId = storage.getActiveShopkeeperId();
        if (activeSkId && !remoteIds.has(activeSkId) && !snapshot.metadata.fromCache) {
          storage.setActiveShopkeeperId(null);
        }
        onUpdate(remoteList);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'shopkeepers');
      }
    );
  },

  /**
   * SECTION 18 — SHOPKEEPER PRE-REGISTRATION BY ADMIN
   * Admin enters ONLY Mobile Number and clicks REGISTER.
   * Creates only a minimal Firestore pre-registration record:
   * mobile, registrationStatus = PRE_REGISTERED, createdAt
   */
  preRegisterShopkeeperMobileByAdmin: async (rawMobile: string): Promise<Shopkeeper> => {
    const cleanMobile = rawMobile.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    const existing = shopkeeperService.getShopkeeperByMobile(cleanMobile);
    if (existing) {
      throw new Error('This mobile number is already registered.');
    }

    const now = new Date().toISOString();
    const shopkeeperId = `sk-${cleanMobile}`;

    const preRegistered: Shopkeeper = {
      shopkeeperId,
      name: '',
      mobile: cleanMobile,
      pin: '',
      shopId: '',
      registrationStatus: 'PRE_REGISTERED',
      verificationStatus: 'UNVERIFIED',
      approvalStatus: 'NONE',
      pinCreated: false,
      profileStatus: 'INCOMPLETE',
      createdAt: now,
    };

    const currentList = storage.getShopkeepers();
    storage.saveShopkeepers([preRegistered, ...currentList]);
    await persistShopkeeperToFirestore(preRegistered, OperationType.CREATE);
    return preRegistered;
  },

  /**
   * SECTION 19 — SHOPKEEPER VERIFICATION
   * When a pre-registered shopkeeper clicks VERIFY & LOGIN:
   * - If not registered by Admin: throws "This mobile number has not been registered by Desi Wardrobe Admin yet."
   * - If pre-registered and unverified: sets verificationStatus = VERIFIED, approvalStatus = PENDING
   */
  verifyPreRegisteredMobile: async (rawMobile: string): Promise<Shopkeeper> => {
    const cleanMobile = rawMobile.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit mobile number.');
    }

    const list = storage.getShopkeepers();
    const idx = list.findIndex((sk) => sk.mobile === cleanMobile);
    if (idx === -1) {
      throw new Error('This mobile number has not been registered by Desi Wardrobe Admin yet.');
    }

    const current = list[idx];
    if (current.verificationStatus !== 'VERIFIED' || current.approvalStatus === 'NONE') {
      const now = new Date().toISOString();
      const updated: Shopkeeper = {
        ...current,
        verificationStatus: 'VERIFIED',
        approvalStatus: current.approvalStatus === 'APPROVED' ? 'APPROVED' : 'PENDING',
        verifiedAt: now,
      };
      list[idx] = updated;
      storage.saveShopkeepers(list);
      await persistShopkeeperToFirestore(updated, OperationType.UPDATE);
      return updated;
    }

    return current;
  },

  /**
   * SECTION 20 — ADMIN APPROVAL / REJECTION OF SHOPKEEPER VERIFICATION REQUEST
   */
  updateShopkeeperApprovalByAdmin: async (
    shopkeeperId: string,
    decision: 'APPROVED' | 'REJECTED'
  ): Promise<Shopkeeper> => {
    const list = storage.getShopkeepers();
    const idx = list.findIndex((sk) => sk.shopkeeperId === shopkeeperId);
    if (idx === -1) {
      throw new Error('Shopkeeper record not found.');
    }

    const now = new Date().toISOString();
    const updated: Shopkeeper = {
      ...list[idx],
      approvalStatus: decision,
      approvedAt: decision === 'APPROVED' ? now : list[idx].approvedAt,
    };

    list[idx] = updated;
    storage.saveShopkeepers(list);
    await persistShopkeeperToFirestore(updated, OperationType.UPDATE);
    return updated;
  },

  /**
   * SECTION 22 — SHOPKEEPER CREATES OWN PIN AFTER ADMIN APPROVAL
   */
  createShopkeeperPin: async (
    rawMobile: string,
    pin: string,
    confirmPin: string
  ): Promise<Shopkeeper> => {
    const cleanMobile = rawMobile.replace(/\D/g, '');
    const cleanPin = pin.trim();
    const cleanConfirm = confirmPin.trim();

    if (!/^\d{4}$/.test(cleanPin)) {
      throw new Error('PIN must be a 4-digit number.');
    }
    if (cleanPin !== cleanConfirm) {
      throw new Error('New PIN and Confirm PIN do not match.');
    }

    const list = storage.getShopkeepers();
    const idx = list.findIndex((sk) => sk.mobile === cleanMobile);
    if (idx === -1) {
      throw new Error('This mobile number has not been registered by Desi Wardrobe Admin yet.');
    }

    const current = list[idx];
    if (current.approvalStatus !== 'APPROVED') {
      throw new Error('Your mobile number is awaiting Admin approval.');
    }

    const hashedPin = hashPinSync(cleanPin, cleanMobile);
    const updated: Shopkeeper = {
      ...current,
      pin: hashedPin,
      pinCreated: true,
    };

    list[idx] = updated;
    storage.saveShopkeepers(list);
    await persistShopkeeperToFirestore(updated, OperationType.UPDATE);
    return updated;
  },

  verifyShopkeeperPin: (sk: Shopkeeper, enteredPin: string): boolean => {
    return verifyPinSync(enteredPin, sk.pin, sk.mobile);
  },
};
