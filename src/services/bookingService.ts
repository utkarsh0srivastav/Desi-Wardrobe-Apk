import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { appConfig } from '../config/appConfig';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../firebase';
import { Booking, BookingStatus } from '../types/models';
import { storage } from '../utils/storage';
import { inventoryService } from './inventoryService';
import { productService } from './productService';
import { shopService } from './shopService';

export function generateFinalDesiWardrobeBookingId(existingIds: Set<string>): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let id = '';
  do {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    id = `DW-${yyyy}${mm}${dd}-${suffix}`;
  } while (existingIds.has(id));

  return id;
}

export function sanitizeBookingForFirestore(booking: Booking): Booking {
  const effectiveStatus: BookingStatus = booking.bookingStatus || booking.status || 'CONFIRMED';
  const clean: Booking = {
    bookingId: booking.bookingId,
    customerId: booking.customerId.slice(0, 128),
    shopId: booking.shopId,
    shopkeeperId: booking.shopkeeperId,
    productId: booking.productId,
    productName: booking.productName.slice(0, 150),
    productImage: (booking.productImage || '').slice(0, 800000),
    shopName: booking.shopName.slice(0, 120),
    shopLocationName: (booking.shopLocationName || '').slice(0, 300),
    customerName: booking.customerName.slice(0, 120),
    customerMobile: booking.customerMobile.slice(0, 15),
    size: booking.size.slice(0, 20),
    color: booking.color.slice(0, 40),
    quantity: Math.max(1, Math.floor(booking.quantity)),
    price: Math.max(1, Math.round(booking.price)),
    paymentAmount:
      typeof booking.paymentAmount === 'number'
        ? Math.max(0, Math.round(booking.paymentAmount))
        : booking.quantity * appConfig.getMinBookingAmountPerUnit(),
    paymentStatus: booking.paymentStatus || 'VERIFIED',
    bookingStatus: effectiveStatus,
    status: effectiveStatus,
    createdAt: booking.createdAt,
    pickupDeadline: booking.pickupDeadline,
  };
  if (booking.bookingReference) {
    clean.bookingReference = booking.bookingReference.slice(0, 128);
  }
  if (booking.paymentId) {
    clean.paymentId = booking.paymentId.slice(0, 128);
  }
  if (booking.confirmedAt) {
    clean.confirmedAt = booking.confirmedAt;
  }
  return clean;
}

export async function persistBookingToFirestore(
  booking: Booking,
  op: OperationType
): Promise<void> {
  const path = `bookings/${booking.bookingId}`;
  try {
    const clean = sanitizeBookingForFirestore(booking);
    await setDoc(doc(db, 'bookings', booking.bookingId), clean);
  } catch (error) {
    handleFirestoreError(error, op, path);
  }
}

function checkAndApplyAutoExpiry(booking: Booking): Booking {
  const currentStatus = booking.bookingStatus || booking.status;
  if (
    (currentStatus === 'CONFIRMED' || currentStatus === 'BOOKED') &&
    booking.pickupDeadline &&
    new Date(booking.pickupDeadline).getTime() < Date.now()
  ) {
    return {
      ...booking,
      bookingStatus: 'EXPIRED',
      status: 'EXPIRED',
    };
  }
  return booking;
}

export const bookingService = {
  getAllBookings: (): Booking[] => {
    return storage.getBookings().map(checkAndApplyAutoExpiry);
  },

  getBookingsByShopId: (shopId: string): Booking[] => {
    return storage
      .getBookings()
      .filter((b) => b.shopId === shopId)
      .map(checkAndApplyAutoExpiry);
  },

  /**
   * Returns ONLY bookings belonging to the currently authenticated customer.
   * Never returns bookings without an authenticated customerId and never matches by mobile number alone.
   */
  getBookingsByCustomer: (customerId?: string | null): Booking[] => {
    if (!customerId || !customerId.trim()) {
      return [];
    }
    const cleanCustomerId = customerId.trim();
    return storage
      .getBookings()
      .filter((b) => b.customerId === cleanCustomerId)
      .map(checkAndApplyAutoExpiry);
  },

  /**
   * Subscribes ONLY to bookings belonging to the authenticated customerId via a scoped Firestore query.
   */
  subscribeToCustomerBookings: (
    customerId: string | null | undefined,
    onUpdate: (bookings: Booking[]) => void
  ): (() => void) => {
    if (!customerId || !customerId.trim()) {
      onUpdate([]);
      return () => {};
    }
    const cleanCustomerId = customerId.trim();
    const customerBookingsQuery = query(
      collection(db, 'bookings'),
      where('customerId', '==', cleanCustomerId)
    );
    return onSnapshot(
      customerBookingsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const ownBookings: Booking[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Booking;
          if (data && data.bookingId && data.customerId === cleanCustomerId) {
            const checked = checkAndApplyAutoExpiry(data);
            if (checked.status === 'EXPIRED' && data.status !== 'EXPIRED') {
              void persistBookingToFirestore(checked, OperationType.UPDATE);
            }
            ownBookings.push(checked);
          }
        });
        ownBookings.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        onUpdate(ownBookings);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'bookings');
      }
    );
  },

  /**
   * Subscribes ONLY to bookings belonging to a specific Shopkeeper's shopId via a scoped Firestore query.
   */
  subscribeToShopBookings: (
    shopId: string | null | undefined,
    onUpdate: (bookings: Booking[]) => void
  ): (() => void) => {
    if (!shopId || !shopId.trim()) {
      onUpdate([]);
      return () => {};
    }
    const cleanShopId = shopId.trim();
    const shopBookingsQuery = query(
      collection(db, 'bookings'),
      where('shopId', '==', cleanShopId)
    );
    return onSnapshot(
      shopBookingsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const shopBookings: Booking[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Booking;
          if (data && data.bookingId && data.shopId === cleanShopId) {
            const checked = checkAndApplyAutoExpiry(data);
            if (checked.status === 'EXPIRED' && data.status !== 'EXPIRED') {
              void persistBookingToFirestore(checked, OperationType.UPDATE);
            }
            shopBookings.push(checked);
          }
        });
        shopBookings.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        storage.saveBookings(shopBookings);
        onUpdate(shopBookings);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'bookings');
      }
    );
  },

  subscribeToBookings: (onUpdate: (bookings: Booking[]) => void): (() => void) => {
    const bookingsQuery = query(collection(db, 'bookings'), where('quantity', '>=', 1));
    return onSnapshot(
      bookingsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const remoteBookings: Booking[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Booking;
          if (data && data.bookingId) {
            const checked = checkAndApplyAutoExpiry(data);
            if (checked.status === 'EXPIRED' && data.status !== 'EXPIRED') {
              void persistBookingToFirestore(checked, OperationType.UPDATE);
            }
            remoteBookings.push(checked);
          }
        });

        remoteBookings.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        storage.saveBookings(remoteBookings);
        onUpdate(remoteBookings);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'bookings');
      }
    );
  },

  createBooking: (params: {
    customerId?: string;
    productId: string;
    size: string;
    color: string;
    quantity: number;
    customerName: string;
    customerMobile: string;
  }): Booking => {
    const cleanName = params.customerName.trim();
    const cleanMobile = params.customerMobile.replace(/\D/g, '');

    if (!cleanName) {
      throw new Error('Please enter your Name.');
    }
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Mobile Number.');
    }
    if (!params.size) {
      throw new Error('Please select a size.');
    }
    if (!params.color) {
      throw new Error('Please select a color.');
    }
    if (!params.quantity || params.quantity <= 0) {
      throw new Error('Please select a valid quantity.');
    }

    const product = productService.getProductById(params.productId);
    if (!product) {
      throw new Error('This product is no longer available.');
    }
    if (product.quantity <= 0) {
      throw new Error('Out of Stock');
    }
    if (params.quantity > product.quantity) {
      throw new Error(`Only ${product.quantity} unit(s) available in stock.`);
    }

    const shop = shopService.getShopById(product.shopId);
    if (!shop) {
      throw new Error('Shop not found.');
    }

    inventoryService.reserveProductStock(product.productId, params.quantity);

    const bookingReference = `REF-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date();
    const pickupHours = appConfig.getPickupHours();
    const deadline = new Date(now.getTime() + pickupHours * 60 * 60 * 1000);
    const paymentAmount = params.quantity * appConfig.getMinBookingAmountPerUnit();

    const newBooking: Booking = {
      bookingId: bookingReference,
      bookingReference,
      customerId: params.customerId || `cust-guest-${cleanMobile}`,
      shopId: shop.shopId,
      shopkeeperId: shop.shopkeeperId,
      productId: product.productId,
      productName: product.name,
      productImage: product.thumbnails?.[0] || product.images[0] || '',
      shopName: shop.shopName,
      shopLocationName: shop.locationName,
      customerName: cleanName,
      customerMobile: cleanMobile,
      size: params.size,
      color: params.color,
      quantity: params.quantity,
      price: product.price * params.quantity,
      paymentAmount,
      paymentStatus: 'PENDING_VERIFICATION',
      bookingStatus: 'PAYMENT_PENDING',
      status: 'PAYMENT_PENDING',
      createdAt: now.toISOString(),
      pickupDeadline: deadline.toISOString(),
    };

    const existingBookings = storage.getBookings();
    storage.saveBookings([newBooking, ...existingBookings]);
    void persistBookingToFirestore(newBooking, OperationType.CREATE);

    return newBooking;
  },

  markOrderSold: (bookingId: string): Booking => {
    const bookings = storage.getBookings();
    const index = bookings.findIndex((b) => b.bookingId === bookingId);
    if (index === -1) {
      throw new Error('Order not found.');
    }

    const current = bookings[index];
    const currentStatus = current.bookingStatus || current.status;
    if (currentStatus === 'SOLD') return current;
    if (currentStatus === 'NOT_SOLD') {
      throw new Error('This order has already been marked NOT SOLD.');
    }
    if (currentStatus === 'PAYMENT_PENDING') {
      throw new Error('Cannot mark order SOLD before Admin verifies payment.');
    }
    if (currentStatus === 'CANCELLED' || currentStatus === 'PAYMENT_REJECTED') {
      throw new Error('Cannot mark a cancelled order as SOLD.');
    }

    const wasPreviouslyReleased = currentStatus === 'EXPIRED';

    inventoryService.confirmSold(current.productId, current.quantity, wasPreviouslyReleased);

    const updated: Booking = {
      ...current,
      bookingStatus: 'SOLD',
      status: 'SOLD',
    };
    bookings[index] = updated;
    storage.saveBookings(bookings);
    void persistBookingToFirestore(updated, OperationType.UPDATE);
    return updated;
  },

  markOrderNotSold: (bookingId: string): Booking => {
    const bookings = storage.getBookings();
    const index = bookings.findIndex((b) => b.bookingId === bookingId);
    if (index === -1) {
      throw new Error('Order not found.');
    }

    const current = bookings[index];
    const currentStatus = current.bookingStatus || current.status;
    if (currentStatus === 'NOT_SOLD') return current;
    if (currentStatus === 'SOLD') {
      throw new Error('This order has already been marked SOLD.');
    }
    if (currentStatus === 'PAYMENT_PENDING') {
      throw new Error('Cannot mark order NOT SOLD before Admin verifies payment.');
    }
    if (currentStatus === 'CANCELLED' || currentStatus === 'PAYMENT_REJECTED') {
      throw new Error('This order is already cancelled.');
    }

    const wasPreviouslySold = false;
    inventoryService.releaseStockOnNotSold(
      current.productId,
      current.quantity,
      wasPreviouslySold
    );

    const updated: Booking = {
      ...current,
      bookingStatus: 'NOT_SOLD',
      status: 'NOT_SOLD',
    };
    bookings[index] = updated;
    storage.saveBookings(bookings);
    void persistBookingToFirestore(updated, OperationType.UPDATE);
    return updated;
  },
};
