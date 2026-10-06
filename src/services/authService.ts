import { Shopkeeper } from '../types/models';
import { storage } from '../utils/storage';
import { shopkeeperService } from './shopkeeperService';

/**
 * Authentication Service — DESI WARDROBE
 *
 * Handles Shopkeeper authentication states:
 * - Pre-registration check ("This mobile number has not been registered by Desi Wardrobe Admin yet.")
 * - Verification & Admin Approval request (verificationStatus = VERIFIED, approvalStatus = PENDING)
 * - Approved first-time PIN setup (CREATE NEW PIN)
 * - Shop profile setup (profileStatus = COMPLETED)
 * - Returning Shopkeeper PIN login
 */

export type ShopkeeperNextStep =
  | 'AWAITING_ADMIN_APPROVAL'
  | 'REJECTED_BY_ADMIN'
  | 'CREATE_NEW_PIN'
  | 'RETURNING_PIN'
  | 'SHOP_SETUP';

export interface MobileVerifyResponse {
  mobile: string;
  nextStep: ShopkeeperNextStep;
  shopkeeper: Shopkeeper;
}

export const authService = {
  /**
   * Verifies a shopkeeper's 10-digit mobile number against Admin pre-registrations in Firestore.
   */
  verifyMobile: async (rawMobile: string): Promise<MobileVerifyResponse> => {
    const cleanMobile = rawMobile.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    const sk = await shopkeeperService.verifyPreRegisteredMobile(cleanMobile);

    if (sk.approvalStatus === 'REJECTED') {
      return {
        mobile: cleanMobile,
        nextStep: 'REJECTED_BY_ADMIN',
        shopkeeper: sk,
      };
    }

    if (sk.approvalStatus !== 'APPROVED') {
      return {
        mobile: cleanMobile,
        nextStep: 'AWAITING_ADMIN_APPROVAL',
        shopkeeper: sk,
      };
    }

    if (!sk.pinCreated || !sk.pin) {
      return {
        mobile: cleanMobile,
        nextStep: 'CREATE_NEW_PIN',
        shopkeeper: sk,
      };
    }

    return {
      mobile: cleanMobile,
      nextStep: 'RETURNING_PIN',
      shopkeeper: sk,
    };
  },

  /**
   * Returning shopkeeper login using Mobile Number + 4-digit PIN (verified against hashed PIN).
   */
  loginWithPin: (rawMobile: string, pin: string): Shopkeeper => {
    const cleanMobile = rawMobile.replace(/\D/g, '');
    const existing = shopkeeperService.getShopkeeperByMobile(cleanMobile);

    if (!existing) {
      throw new Error('This mobile number has not been registered by Desi Wardrobe Admin yet.');
    }
    if (existing.approvalStatus !== 'APPROVED') {
      throw new Error('Your account is awaiting Admin approval.');
    }
    if (!shopkeeperService.verifyShopkeeperPin(existing, pin)) {
      throw new Error('Incorrect PIN. Please enter your 4-digit PIN.');
    }

    storage.setActiveShopkeeperId(existing.shopkeeperId);
    return existing;
  },

  /**
   * Validates PIN creation during first-time registration.
   */
  validateNewPin: (pin: string, confirmPin: string): void => {
    if (!/^\d{4}$/.test(pin.trim())) {
      throw new Error('PIN must be a 4-digit number.');
    }
    if (pin.trim() !== confirmPin.trim()) {
      throw new Error('PIN and Confirm PIN do not match.');
    }
  },

  getCurrentShopkeeper: (): Shopkeeper | null => {
    const activeId = storage.getActiveShopkeeperId();
    if (!activeId) return null;
    const shopkeepers = storage.getShopkeepers();
    return shopkeepers.find((sk) => sk.shopkeeperId === activeId) || null;
  },

  logout: (): void => {
    storage.setActiveShopkeeperId(null);
  },
};
