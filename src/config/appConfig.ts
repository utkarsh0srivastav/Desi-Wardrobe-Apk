/**
 * Centralized Platform Configuration — DESI WARDROBE
 *
 * Single source of truth for Admin Email, Admin UPI ID, Minimum Booking Amount per Unit,
 * Maximum Shop Discovery Radius (KM), and Pickup Deadline Hours.
 */

export interface PlatformConfig {
  ADMIN_EMAIL: string;
  ADMIN_UPI_ID: string;
  MIN_BOOKING_AMOUNT_PER_UNIT: number;
  SHOP_RADIUS_KM: number;
  PICKUP_HOURS: number;
  updatedAt?: string;
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  ADMIN_EMAIL: import.meta.env.VITE_ADMIN_EMAIL || 'utkarsh0srivastav@gmail.com',
  ADMIN_UPI_ID: 'utkarsh1614@ybl',
  MIN_BOOKING_AMOUNT_PER_UNIT: 75,
  SHOP_RADIUS_KM: 100,
  PICKUP_HOURS: 48,
};

const CONFIG_STORAGE_KEY = 'dw_v1_platform_config';

let currentConfig: PlatformConfig = (() => {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlatformConfig>;
      return {
        ADMIN_EMAIL: parsed.ADMIN_EMAIL || DEFAULT_PLATFORM_CONFIG.ADMIN_EMAIL,
        ADMIN_UPI_ID: parsed.ADMIN_UPI_ID || DEFAULT_PLATFORM_CONFIG.ADMIN_UPI_ID,
        MIN_BOOKING_AMOUNT_PER_UNIT:
          typeof parsed.MIN_BOOKING_AMOUNT_PER_UNIT === 'number' &&
          parsed.MIN_BOOKING_AMOUNT_PER_UNIT > 0
            ? parsed.MIN_BOOKING_AMOUNT_PER_UNIT
            : DEFAULT_PLATFORM_CONFIG.MIN_BOOKING_AMOUNT_PER_UNIT,
        SHOP_RADIUS_KM:
          typeof parsed.SHOP_RADIUS_KM === 'number' && parsed.SHOP_RADIUS_KM > 0
            ? parsed.SHOP_RADIUS_KM
            : DEFAULT_PLATFORM_CONFIG.SHOP_RADIUS_KM,
        PICKUP_HOURS:
          typeof parsed.PICKUP_HOURS === 'number' && parsed.PICKUP_HOURS > 0
            ? parsed.PICKUP_HOURS
            : DEFAULT_PLATFORM_CONFIG.PICKUP_HOURS,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch {
    // Use default config
  }
  return { ...DEFAULT_PLATFORM_CONFIG };
})();

export const appConfig = {
  get: (): PlatformConfig => currentConfig,

  getAdminEmail: (): string => currentConfig.ADMIN_EMAIL.trim().toLowerCase(),

  getAdminUpiId: (): string => currentConfig.ADMIN_UPI_ID.trim(),

  getMinBookingAmountPerUnit: (): number => currentConfig.MIN_BOOKING_AMOUNT_PER_UNIT,

  getShopRadiusKm: (): number => currentConfig.SHOP_RADIUS_KM,

  getPickupHours: (): number => currentConfig.PICKUP_HOURS,

  setLocalConfig: (next: Partial<PlatformConfig>): PlatformConfig => {
    currentConfig = {
      ...currentConfig,
      ...next,
      ADMIN_EMAIL: (next.ADMIN_EMAIL ?? currentConfig.ADMIN_EMAIL).trim(),
      ADMIN_UPI_ID: (next.ADMIN_UPI_ID ?? currentConfig.ADMIN_UPI_ID).trim(),
      MIN_BOOKING_AMOUNT_PER_UNIT:
        typeof next.MIN_BOOKING_AMOUNT_PER_UNIT === 'number' && next.MIN_BOOKING_AMOUNT_PER_UNIT > 0
          ? next.MIN_BOOKING_AMOUNT_PER_UNIT
          : currentConfig.MIN_BOOKING_AMOUNT_PER_UNIT,
      SHOP_RADIUS_KM:
        typeof next.SHOP_RADIUS_KM === 'number' && next.SHOP_RADIUS_KM > 0
          ? next.SHOP_RADIUS_KM
          : currentConfig.SHOP_RADIUS_KM,
      PICKUP_HOURS:
        typeof next.PICKUP_HOURS === 'number' && next.PICKUP_HOURS > 0
          ? next.PICKUP_HOURS
          : currentConfig.PICKUP_HOURS,
    };
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(currentConfig));
      window.dispatchEvent(new CustomEvent('dw-storage-updated'));
    } catch {
      // Ignore storage write errors
    }
    return currentConfig;
  },
};
