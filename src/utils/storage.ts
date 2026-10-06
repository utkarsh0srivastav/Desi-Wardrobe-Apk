import {
  Shop,
  Shopkeeper,
  Product,
  Customer,
  CartItem,
  Booking,
  PaymentRecord,
  AdminAccount,
  AdminDevice,
  ThemeMode,
  CustomerCoordinates,
  AppSettings,
} from '../types/models';

/**
 * Local Storage & Session Cache Layer for DESI WARDROBE
 *
 * Synced with Firebase Firestore in real time.
 * Starts 100% clean with NO fake shops, NO fake products, and NO fake accounts.
 */

const STORAGE_KEYS = {
  CLEANUP_EPOCH: 'dw_v2_clean_epoch_20261006',
  SHOPS: 'dw_v1_shops',
  SHOPKEEPERS: 'dw_v1_shopkeepers',
  PRODUCTS: 'dw_v1_products',
  CUSTOMERS: 'dw_v1_customers',
  CART: 'dw_v1_cart',
  BOOKINGS: 'dw_v1_bookings',
  PAYMENTS: 'dw_v1_payments',
  ADMINS: 'dw_v1_admins',
  ADMIN_DEVICES: 'dw_v1_admin_devices',
  DEVICE_CREDENTIAL: 'dw_v1_device_credential',
  THEME: 'dw_v1_theme',
  ACTIVE_SHOPKEEPER_ID: 'dw_v1_active_shopkeeper_id',
  ACTIVE_CUSTOMER_ID: 'dw_v1_active_customer_id',
  ACTIVE_ADMIN_SESSION: 'dw_v1_active_admin_session',
  CUSTOMER_COORDS: 'dw_v1_customer_coords',
  SETTINGS: 'dw_v1_settings',
} as const;

export interface ActiveAdminSession {
  adminUid: string;
  deviceId: string;
  pinVerified: boolean;
  authenticatedAt: string;
}

export interface LocalDeviceCredential {
  deviceId: string;
  deviceToken: string;
  deviceLabel: string;
  createdAt: string;
}

/**
 * Purges any legacy/test local cache from earlier development sessions
 * while preserving Admin credentials, trusted device tokens, theme, and settings.
 */
function ensureCleanTestDataMigration(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const migrated = localStorage.getItem(STORAGE_KEYS.CLEANUP_EPOCH);
    if (migrated !== 'done') {
      localStorage.removeItem(STORAGE_KEYS.SHOPS);
      localStorage.removeItem(STORAGE_KEYS.SHOPKEEPERS);
      localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
      localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
      localStorage.removeItem(STORAGE_KEYS.CART);
      localStorage.removeItem(STORAGE_KEYS.BOOKINGS);
      localStorage.removeItem(STORAGE_KEYS.PAYMENTS);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHOPKEEPER_ID);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CUSTOMER_ID);
      localStorage.setItem(STORAGE_KEYS.CLEANUP_EPOCH, 'done');
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
}

ensureCleanTestDataMigration();

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('dw-storage-updated'));
  } catch (err) {
    console.error(`Failed to write ${key} to localStorage:`, err);
  }
}

export const storage = {
  // Shops
  getShops: (): Shop[] => safeRead<Shop[]>(STORAGE_KEYS.SHOPS, []),
  saveShops: (shops: Shop[]): void => safeWrite(STORAGE_KEYS.SHOPS, shops),

  // Shopkeepers
  getShopkeepers: (): Shopkeeper[] => safeRead<Shopkeeper[]>(STORAGE_KEYS.SHOPKEEPERS, []),
  saveShopkeepers: (shopkeepers: Shopkeeper[]): void =>
    safeWrite(STORAGE_KEYS.SHOPKEEPERS, shopkeepers),

  // Products
  getProducts: (): Product[] => safeRead<Product[]>(STORAGE_KEYS.PRODUCTS, []),
  saveProducts: (products: Product[]): void => safeWrite(STORAGE_KEYS.PRODUCTS, products),

  // Customers
  getCustomers: (): Customer[] => safeRead<Customer[]>(STORAGE_KEYS.CUSTOMERS, []),
  saveCustomers: (customers: Customer[]): void => safeWrite(STORAGE_KEYS.CUSTOMERS, customers),

  // Cart Items (Personal shopping list — never reserves stock)
  getCartItems: (): CartItem[] => safeRead<CartItem[]>(STORAGE_KEYS.CART, []),
  saveCartItems: (items: CartItem[]): void => safeWrite(STORAGE_KEYS.CART, items),

  // Bookings
  getBookings: (): Booking[] => safeRead<Booking[]>(STORAGE_KEYS.BOOKINGS, []),
  saveBookings: (bookings: Booking[]): void => safeWrite(STORAGE_KEYS.BOOKINGS, bookings),

  // Payments
  getPayments: (): PaymentRecord[] => safeRead<PaymentRecord[]>(STORAGE_KEYS.PAYMENTS, []),
  savePayments: (payments: PaymentRecord[]): void => safeWrite(STORAGE_KEYS.PAYMENTS, payments),

  // Admins
  getAdmins: (): AdminAccount[] => safeRead<AdminAccount[]>(STORAGE_KEYS.ADMINS, []),
  saveAdmins: (admins: AdminAccount[]): void => safeWrite(STORAGE_KEYS.ADMINS, admins),

  // Admin Trusted Devices
  getAdminDevices: (): AdminDevice[] => safeRead<AdminDevice[]>(STORAGE_KEYS.ADMIN_DEVICES, []),
  saveAdminDevices: (devices: AdminDevice[]): void =>
    safeWrite(STORAGE_KEYS.ADMIN_DEVICES, devices),

  // Local Cryptographic Device Credential
  getDeviceCredential: (): LocalDeviceCredential | null =>
    safeRead<LocalDeviceCredential | null>(STORAGE_KEYS.DEVICE_CREDENTIAL, null),
  saveDeviceCredential: (cred: LocalDeviceCredential | null): void =>
    safeWrite(STORAGE_KEYS.DEVICE_CREDENTIAL, cred),

  // Theme
  getTheme: (): ThemeMode => {
    const saved = safeRead<ThemeMode>(STORAGE_KEYS.THEME, 'light');
    return saved === 'dark' ? 'dark' : 'light';
  },
  saveTheme: (theme: ThemeMode): void => safeWrite(STORAGE_KEYS.THEME, theme),

  // Active Shopkeeper Session
  getActiveShopkeeperId: (): string | null =>
    safeRead<string | null>(STORAGE_KEYS.ACTIVE_SHOPKEEPER_ID, null),
  setActiveShopkeeperId: (id: string | null): void =>
    safeWrite(STORAGE_KEYS.ACTIVE_SHOPKEEPER_ID, id),

  // Active Customer Session
  getActiveCustomerId: (): string | null =>
    safeRead<string | null>(STORAGE_KEYS.ACTIVE_CUSTOMER_ID, null),
  setActiveCustomerId: (id: string | null): void =>
    safeWrite(STORAGE_KEYS.ACTIVE_CUSTOMER_ID, id),

  // Active Admin Session
  getActiveAdminSession: (): ActiveAdminSession | null =>
    safeRead<ActiveAdminSession | null>(STORAGE_KEYS.ACTIVE_ADMIN_SESSION, null),
  setActiveAdminSession: (session: ActiveAdminSession | null): void =>
    safeWrite(STORAGE_KEYS.ACTIVE_ADMIN_SESSION, session),

  // Customer Geolocation Coordinates
  getCustomerCoordinates: (): CustomerCoordinates | null =>
    safeRead<CustomerCoordinates | null>(STORAGE_KEYS.CUSTOMER_COORDS, null),
  saveCustomerCoordinates: (coords: CustomerCoordinates | null): void =>
    safeWrite(STORAGE_KEYS.CUSTOMER_COORDS, coords),

  // App Settings
  getSettings: (): AppSettings =>
    safeRead<AppSettings>(STORAGE_KEYS.SETTINGS, {
      notificationsEnabled: true,
      language: 'English',
    }),
  saveSettings: (settings: AppSettings): void => safeWrite(STORAGE_KEYS.SETTINGS, settings),

  // Clear all platform marketplace data from local cache (preserving Admin config & theme)
  clearAllPlatformMarketplaceData: (): void => {
    safeWrite(STORAGE_KEYS.SHOPS, []);
    safeWrite(STORAGE_KEYS.SHOPKEEPERS, []);
    safeWrite(STORAGE_KEYS.PRODUCTS, []);
    safeWrite(STORAGE_KEYS.CUSTOMERS, []);
    safeWrite(STORAGE_KEYS.CART, []);
    safeWrite(STORAGE_KEYS.BOOKINGS, []);
    safeWrite(STORAGE_KEYS.PAYMENTS, []);
    safeWrite(STORAGE_KEYS.ACTIVE_SHOPKEEPER_ID, null);
    safeWrite(STORAGE_KEYS.ACTIVE_CUSTOMER_ID, null);
  },

  subscribe: (listener: () => void): (() => void) => {
    const handler = () => listener();
    window.addEventListener('dw-storage-updated', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('dw-storage-updated', handler);
      window.removeEventListener('storage', handler);
    };
  },
};
