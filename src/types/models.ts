/**
 * Data Models for DESI WARDROBE — "Your Local Fashion, All in One Place."
 *
 * Includes all three roles in a single unified application:
 * 1. CUSTOMER
 * 2. SHOPKEEPER
 * 3. ADMIN
 */

export type ShopCategory =
  | 'MEN'
  | 'WOMEN'
  | 'BOTH'
  | "Men's Wear"
  | "Women's Wear"
  | 'Both'
  | 'Men'
  | 'Women'
  | 'Kids'
  | "Kids' Wear"
  | 'All';

export type PricePolicy =
  | 'FIXED'
  | 'FIXED_PRICE'
  | 'NEGOTIABLE'
  | 'BARGAINING_AVAILABLE';

export type ShopStatus =
  | 'ACTIVE'
  | 'PRE_REGISTERED'
  | 'PENDING'
  | 'REJECTED'
  | 'REMOVED'
  | 'INCOMPLETE';

export type ProfileStatus =
  | 'COMPLETED'
  | 'INCOMPLETE'
  | 'PRE_REGISTERED'
  | 'PENDING';

export type CustomerStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'BLOCKED'
  | 'ACTIVE';

export type ShopkeeperRegistrationStatus = 'PRE_REGISTERED' | 'COMPLETED';
export type ShopkeeperVerificationStatus = 'UNVERIFIED' | 'VERIFIED';
export type ShopkeeperApprovalStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type PaymentVerificationStatus =
  | 'PENDING_VERIFICATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'VERIFIED';

export type PaymentUploadStage =
  | 'SELECTING_FILE'
  | 'COMPRESSING'
  | 'READY_TO_UPLOAD'
  | 'UPLOADING'
  | 'SAVING_PAYMENT_RECORD'
  | 'SUBMITTED'
  | 'UPLOAD_ERROR'
  | 'SUBMISSION_ERROR';

export type BookingStatus =
  | 'PAYMENT_PENDING'
  | 'PAYMENT_REJECTED'
  | 'CONFIRMED'
  | 'BOOKED'
  | 'SOLD'
  | 'NOT_SOLD'
  | 'EXPIRED'
  | 'CANCELLED';

export type ProductStatus = 'AVAILABLE' | 'OUT_OF_STOCK';

export type ThemeMode = 'light' | 'dark';

export type AppEntryMode = 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN';

export interface Shop {
  shopId: string;
  shopkeeperId: string;
  shopName: string;
  shopkeeperName: string;
  mobile: string;
  photo: string;
  category: ShopCategory;
  pricePolicy: PricePolicy;
  latitude: number;
  longitude: number;
  locationName: string;
  shopStatus?: ShopStatus;
  profileStatus?: ProfileStatus;
  openingTime?: string;
  closingTime?: string;
  status?: 'OPEN' | 'CLOSED';
  updatedAt?: string;
  createdAt: string;
}

export interface Shopkeeper {
  shopkeeperId: string;
  name: string;
  mobile: string;
  pin: string; // Hashed PIN
  shopId: string;
  registrationStatus: ShopkeeperRegistrationStatus;
  verificationStatus: ShopkeeperVerificationStatus;
  approvalStatus: ShopkeeperApprovalStatus;
  pinCreated: boolean;
  profileStatus: ProfileStatus;
  createdAt: string;
  verifiedAt?: string;
  approvedAt?: string;
}

export interface Product {
  productId: string;
  shopId: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  soldCount?: number;
  sizes: string[];
  colors: string[];
  images: string[];
  thumbnails?: string[];
  pricePolicy: PricePolicy;
  status?: ProductStatus;
  createdAt: string;
}

export interface Customer {
  customerId: string;
  name: string;
  mobile: string;
  email?: string;
  pin: string; // Hashed PIN
  approvalStatus: CustomerStatus;
  accountStatus: CustomerStatus;
  createdAt: string;
}

export interface CartItem {
  cartItemId: string;
  customerId?: string;
  productId: string;
  shopId: string;
  size: string;
  color: string;
  quantity: number;
  addedAt: string;
}

export interface Booking {
  documentId?: string; // Firestore document ID (bookingReference)
  bookingId: string; // Temporary reference until Admin approves payment; DW-YYYYMMDD-XXXXXX after approval
  bookingReference?: string;
  paymentId?: string;
  customerId: string;
  shopId: string;
  shopkeeperId: string;
  productId: string;
  productName: string;
  productImage: string;
  shopName: string;
  shopLocationName?: string;
  customerName: string;
  customerMobile: string;
  size: string;
  color: string;
  quantity: number;
  price: number;
  paymentAmount?: number;
  paymentStatus?: PaymentVerificationStatus;
  bookingStatus?: BookingStatus;
  status: BookingStatus;
  createdAt: string;
  confirmedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  pickupDeadline: string;
}

export interface PaymentRecord {
  paymentId: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  bookingReference: string;
  bookingIds: string[];
  finalBookingIds?: string[];
  shopId: string;
  shopName: string;
  productId: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  expectedAmount: number;
  upiId: string;
  screenshotStoragePath: string;
  screenshotURL: string;
  screenshotFileName?: string;
  originalSizeKB?: number;
  compressedSizeKB?: number;
  status: PaymentVerificationStatus;
  submittedAt: string;
  createdAt?: string;
  verifiedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  deletedAt?: string;
  screenshotDeleted?: boolean;
  screenshotDeletedAt?: string;
}

export interface AdminAccount {
  adminUid: string;
  authorizedEmail: string;
  pinConfigured: boolean;
  pinHash?: string;
  createdAt: string;
  updatedAt?: string;
}

export type AdminDeviceStatus = 'TRUSTED' | 'PENDING_APPROVAL' | 'REVOKED';

export interface AdminDevice {
  deviceId: string;
  adminUid: string;
  deviceLabel: string;
  credentialHash: string;
  status: AdminDeviceStatus;
  createdAt: string;
  lastUsedAt: string;
}

export interface PendingCheckoutItem {
  productId: string;
  shopId: string;
  shopkeeperId: string;
  shopName: string;
  shopLocationName: string;
  productName: string;
  productImage: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  fromCartItemId?: string;
}

export interface PendingCheckoutDraft {
  bookingReference: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  items: PendingCheckoutItem[];
  totalQuantity: number;
  expectedBookingAmount: number;
  upiId: string;
  upiUri: string;
  retryForBookingId?: string;
}

export interface CustomerCoordinates {
  latitude: number;
  longitude: number;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  language: 'English' | 'Hindi';
}

export const STANDARD_SIZES = [
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '28',
  '30',
  '32',
  '34',
  '36',
  '38',
  '40',
  '42',
  '44',
];

export const STANDARD_COLORS = [
  'Black',
  'White',
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'Maroon',
  'Brown',
  'Pink',
  'Grey',
  'Navy',
  'Beige',
];
