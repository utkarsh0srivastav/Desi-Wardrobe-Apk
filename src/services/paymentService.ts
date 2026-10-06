import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { appConfig } from '../config/appConfig';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../firebase';
import {
  Booking,
  PaymentRecord,
  PaymentUploadStage,
  PendingCheckoutDraft,
  PendingCheckoutItem,
} from '../types/models';
import { storage } from '../utils/storage';
import {
  generateFinalDesiWardrobeBookingId,
  persistBookingToFirestore,
  sanitizeBookingForFirestore,
} from './bookingService';
import { CompressedScreenshotData, imageService } from './imageService';
import { inventoryService } from './inventoryService';
import { storageService, UploadedPaymentProof } from './storageService';

/**
 * Payment Service & Dynamic UPI Payment Engine — DESI WARDROBE (V1)
 *
 * State Machine (Immutable Final Decisions):
 * - PENDING_VERIFICATION -> APPROVED (bookingStatus = CONFIRMED, generates final DW-YYYYMMDD-XXXXXX Booking ID)
 * - PENDING_VERIFICATION -> REJECTED (bookingStatus = CANCELLED)
 * - PENDING_VERIFICATION + DELETE PAYMENT PROOF -> REJECTED + CANCELLED + Deletes screenshot from Storage
 * - APPROVED + DELETE PAYMENT PROOF -> Deletes screenshot from Storage ONLY; payment stays APPROVED, booking stays CONFIRMED, Booking ID stays intact
 * - REJECTED + DELETE PAYMENT PROOF -> Deletes screenshot from Storage ONLY; payment stays REJECTED, booking stays CANCELLED
 * - Once APPROVED: can NEVER become REJECTED or PENDING_VERIFICATION
 * - Once REJECTED: can NEVER become APPROVED or PENDING_VERIFICATION
 */

const inFlightSubmissions = new Set<string>();

function assertAuthorizedAdminForPaymentAction(): void {
  const activeAdmin = storage.getActiveAdminSession();
  if (!activeAdmin) {
    throw new Error(
      'Access denied. Only the authorized Admin can approve, reject, or delete payment proofs.'
    );
  }
}

export function isPaymentApprovedStatus(status?: string | null): boolean {
  return status === 'APPROVED' || status === 'VERIFIED';
}

export function isPaymentRejectedStatus(status?: string | null): boolean {
  return status === 'REJECTED';
}

export function sanitizePaymentForFirestore(payment: PaymentRecord): PaymentRecord {
  const clean: PaymentRecord = {
    paymentId: payment.paymentId,
    customerId: payment.customerId.slice(0, 128),
    customerName: payment.customerName.slice(0, 120),
    customerMobile: payment.customerMobile.slice(0, 15),
    bookingReference: payment.bookingReference.slice(0, 128),
    bookingIds: payment.bookingIds.slice(0, 20),
    shopId: payment.shopId.slice(0, 128),
    shopName: payment.shopName.slice(0, 120),
    productId: payment.productId.slice(0, 128),
    productName: payment.productName.slice(0, 200),
    size: payment.size.slice(0, 60),
    color: payment.color.slice(0, 80),
    quantity: Math.max(1, Math.floor(payment.quantity)),
    expectedAmount: Math.max(1, Math.round(payment.expectedAmount)),
    upiId: payment.upiId.slice(0, 100),
    screenshotStoragePath: (payment.screenshotStoragePath || '').slice(0, 500),
    screenshotURL: (payment.screenshotURL || '').slice(0, 800000),
    status: payment.status,
    submittedAt: payment.submittedAt,
  };
  if (payment.screenshotFileName) {
    clean.screenshotFileName = payment.screenshotFileName.slice(0, 200);
  }
  if (typeof payment.originalSizeKB === 'number' && Number.isFinite(payment.originalSizeKB)) {
    clean.originalSizeKB = Math.max(0, Math.round(payment.originalSizeKB));
  }
  if (typeof payment.compressedSizeKB === 'number' && Number.isFinite(payment.compressedSizeKB)) {
    clean.compressedSizeKB = Math.max(0, Math.round(payment.compressedSizeKB));
  }
  if (payment.createdAt) {
    clean.createdAt = payment.createdAt;
  }
  if (payment.finalBookingIds && payment.finalBookingIds.length > 0) {
    clean.finalBookingIds = payment.finalBookingIds.slice(0, 20);
  }
  if (payment.verifiedAt) {
    clean.verifiedAt = payment.verifiedAt;
  }
  if (payment.rejectedAt) {
    clean.rejectedAt = payment.rejectedAt;
  }
  if (payment.deletedAt) {
    clean.deletedAt = payment.deletedAt;
  }
  if (typeof payment.screenshotDeleted === 'boolean') {
    clean.screenshotDeleted = payment.screenshotDeleted;
  }
  if (payment.screenshotDeletedAt) {
    clean.screenshotDeletedAt = payment.screenshotDeletedAt;
  }
  return clean;
}

export async function persistPaymentToFirestore(
  payment: PaymentRecord,
  op: OperationType
): Promise<void> {
  const path = `payments/${payment.paymentId}`;
  try {
    const clean = sanitizePaymentForFirestore(payment);
    await setDoc(doc(db, 'payments', payment.paymentId), clean);
  } catch (error) {
    handleFirestoreError(error, op, path);
  }
}

export const paymentService = {
  /**
   * Reusable dynamic booking payment calculation function.
   * Total Booking Amount = MIN_BOOKING_AMOUNT_PER_UNIT (₹75) × Total Quantity
   */
  calculateBookingAmount: (totalQuantity: number): number => {
    const validQty = Math.max(1, Math.floor(totalQuantity));
    const perUnit = appConfig.getMinBookingAmountPerUnit();
    return validQty * perUnit;
  },

  /**
   * Generates the internal dynamic UPI payment URI:
   * upi://pay?pa=utkarsh1614@ybl&pn=Desi%20Wardrobe&am=225&cu=INR
   */
  generateDynamicUpiUri: (bookingAmount: number, customUpiId?: string): string => {
    const upiId = (customUpiId || appConfig.getAdminUpiId()).trim();
    const cleanAmount = Math.max(1, Math.round(bookingAmount));
    return `upi://pay?pa=${upiId}&pn=Desi%20Wardrobe&am=${cleanAmount}&cu=INR`;
  },

  /**
   * Creates a PendingCheckoutDraft for single-item or multi-item cart booking.
   */
  createCheckoutDraft: (params: {
    customerId: string;
    customerName: string;
    customerMobile: string;
    items: PendingCheckoutItem[];
    retryForBookingId?: string;
  }): PendingCheckoutDraft => {
    const cleanName = params.customerName.trim();
    const cleanMobile = params.customerMobile.replace(/\D/g, '');

    if (!cleanName) {
      throw new Error('Please enter Customer Name.');
    }
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Mobile Number.');
    }
    if (!params.items || params.items.length === 0) {
      throw new Error('No product items selected for booking.');
    }

    const totalQuantity = params.items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
    const expectedBookingAmount = paymentService.calculateBookingAmount(totalQuantity);
    const upiId = appConfig.getAdminUpiId();
    const upiUri = paymentService.generateDynamicUpiUri(expectedBookingAmount, upiId);
    const bookingReference =
      params.retryForBookingId ||
      `REF-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    return {
      bookingReference,
      customerId: params.customerId || `cust-${cleanMobile}`,
      customerName: cleanName,
      customerMobile: cleanMobile,
      items: params.items,
      totalQuantity,
      expectedBookingAmount,
      upiId,
      upiUri,
      retryForBookingId: params.retryForBookingId,
    };
  },

  getAllPayments: (): PaymentRecord[] => {
    return storage.getPayments();
  },

  getPaymentById: (paymentId: string): PaymentRecord | undefined => {
    return storage.getPayments().find((p) => p.paymentId === paymentId);
  },

  getPaymentsByBookingReference: (bookingReference: string): PaymentRecord[] => {
    return storage.getPayments().filter((p) => p.bookingReference === bookingReference);
  },

  subscribeToPayments: (onUpdate: (payments: PaymentRecord[]) => void): (() => void) => {
    const paymentsQuery = query(collection(db, 'payments'), where('expectedAmount', '>=', 1));
    return onSnapshot(
      paymentsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const remotePayments: PaymentRecord[] = [];
        const remoteIds = new Set<string>();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as PaymentRecord;
          if (data && data.paymentId) {
            remotePayments.push(data);
            remoteIds.add(data.paymentId);
          }
        });

        remotePayments.sort(
          (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
        );
        storage.savePayments(remotePayments);
        onUpdate(remotePayments);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'payments');
      }
    );
  },

  /**
   * Submits a customer's compressed UPI payment screenshot proof.
   * - Uploads compressed screenshot to Firebase Storage (`paymentProofs/{customerId}/{paymentId}/{fileName}`)
   * - Creates Firestore PaymentRecord with status = "PENDING_VERIFICATION"
   * - Creates Booking(s) with paymentStatus = "PENDING_VERIFICATION" and bookingStatus = "PAYMENT_PENDING"
   * - Never generates final DW-YYYYMMDD-XXXXXX Booking ID before Admin approval
   */
  submitPaymentProof: async (params: {
    draft: PendingCheckoutDraft;
    compressedScreenshot?: CompressedScreenshotData;
    screenshotFile?: File;
    paymentId?: string;
    cachedUploadedProof?: UploadedPaymentProof | null;
    onStageChange?: (stage: PaymentUploadStage) => void;
    onUploadedProofReady?: (uploaded: UploadedPaymentProof, paymentId: string) => void;
  }): Promise<{ payment: PaymentRecord; bookings: Booking[] }> => {
    const {
      draft,
      compressedScreenshot,
      screenshotFile,
      cachedUploadedProof,
      onStageChange,
      onUploadedProofReady,
    } = params;

    const submissionLockKey = `${draft.customerId}_${draft.bookingReference}`;
    if (inFlightSubmissions.has(submissionLockKey)) {
      throw new Error('Submission is already in progress. Please wait.');
    }

    inFlightSubmissions.add(submissionLockKey);

    try {
      const paymentId =
        params.paymentId ||
        `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      let uploaded: UploadedPaymentProof;

      if (cachedUploadedProof && cachedUploadedProof.downloadUrl) {
        uploaded = cachedUploadedProof;
      } else {
        let compressed = compressedScreenshot;
        if (!compressed) {
          if (!screenshotFile) {
            throw new Error('Please select a payment screenshot image.');
          }
          storageService.validatePaymentScreenshotFile(screenshotFile);
          onStageChange?.('COMPRESSING');
          compressed = await imageService.compressPaymentScreenshotOnly(screenshotFile);
        }

        onStageChange?.('UPLOADING');
        try {
          uploaded = await storageService.uploadCompressedPaymentScreenshot({
            compressed,
            customerId: draft.customerId,
            paymentId,
          });
          onUploadedProofReady?.(uploaded, paymentId);
        } catch {
          onStageChange?.('UPLOAD_ERROR');
          throw new Error('Payment screenshot upload failed.');
        }
      }

      onStageChange?.('SAVING_PAYMENT_RECORD');

      const now = new Date();
      const pickupHours = appConfig.getPickupHours();
      const initialDeadline = new Date(
        now.getTime() + pickupHours * 60 * 60 * 1000
      ).toISOString();
      const nowIso = now.toISOString();

      const existingBookings = storage.getBookings();
      const createdOrUpdatedBookings: Booking[] = [];
      const bookingIds: string[] = [];

      // Only reuse an existing booking if it is still in PAYMENT_PENDING / PENDING_VERIFICATION
      // Never mutate an already APPROVED or REJECTED booking!
      const existingPendingForRef = existingBookings.filter(
        (b) =>
          b.bookingReference === draft.bookingReference &&
          b.paymentStatus === 'PENDING_VERIFICATION' &&
          (b.bookingStatus === 'PAYMENT_PENDING' || b.status === 'PAYMENT_PENDING')
      );

      if (existingPendingForRef.length > 0) {
        for (const existingB of existingPendingForRef) {
          const updatedB: Booking = {
            ...existingB,
            paymentId,
            paymentStatus: 'PENDING_VERIFICATION',
            bookingStatus: 'PAYMENT_PENDING',
            status: 'PAYMENT_PENDING',
          };
          const bIdx = existingBookings.findIndex((x) => x.bookingId === existingB.bookingId);
          if (bIdx !== -1) {
            existingBookings[bIdx] = updatedB;
          }
          createdOrUpdatedBookings.push(updatedB);
          bookingIds.push(updatedB.bookingId);
          await persistBookingToFirestore(updatedB, OperationType.UPDATE);
        }
      } else {
        const perUnitBookingFee = appConfig.getMinBookingAmountPerUnit();
        for (let i = 0; i < draft.items.length; i++) {
          const item = draft.items[i];
          inventoryService.reserveProductStock(item.productId, item.quantity);

          const tempBookingId =
            draft.items.length === 1
              ? draft.bookingReference
              : `${draft.bookingReference}-${i + 1}`;

          const newBooking: Booking = {
            bookingId: tempBookingId,
            bookingReference: draft.bookingReference,
            paymentId,
            customerId: draft.customerId,
            shopId: item.shopId,
            shopkeeperId: item.shopkeeperId,
            productId: item.productId,
            productName: item.productName,
            productImage: item.productImage,
            shopName: item.shopName,
            shopLocationName: item.shopLocationName,
            customerName: draft.customerName,
            customerMobile: draft.customerMobile,
            size: item.size,
            color: item.color,
            quantity: item.quantity,
            price: item.unitPrice * item.quantity,
            paymentAmount: item.quantity * perUnitBookingFee,
            paymentStatus: 'PENDING_VERIFICATION',
            bookingStatus: 'PAYMENT_PENDING',
            status: 'PAYMENT_PENDING',
            createdAt: nowIso,
            pickupDeadline: initialDeadline,
          };

          createdOrUpdatedBookings.push(newBooking);
          bookingIds.push(newBooking.bookingId);
          existingBookings.unshift(newBooking);
          await persistBookingToFirestore(newBooking, OperationType.CREATE);
        }
      }

      storage.saveBookings(existingBookings);

      const firstItem = draft.items[0];
      const productSummary =
        draft.items.length === 1
          ? firstItem.productName
          : `${firstItem.productName} (+${draft.items.length - 1} more)`;
      const sizeSummary = Array.from(new Set(draft.items.map((i) => i.size))).join(', ');
      const colorSummary = Array.from(new Set(draft.items.map((i) => i.color))).join(', ');

      const newPayment: PaymentRecord = {
        paymentId,
        customerId: draft.customerId,
        customerName: draft.customerName,
        customerMobile: draft.customerMobile,
        bookingReference: draft.bookingReference,
        bookingIds,
        shopId: firstItem.shopId,
        shopName: firstItem.shopName,
        productId: firstItem.productId,
        productName: productSummary,
        size: sizeSummary,
        color: colorSummary,
        quantity: draft.totalQuantity,
        expectedAmount: draft.expectedBookingAmount,
        upiId: draft.upiId,
        screenshotStoragePath: uploaded.storagePath,
        screenshotURL: uploaded.downloadUrl,
        screenshotFileName: uploaded.fileName,
        originalSizeKB: uploaded.originalSizeKB,
        compressedSizeKB: uploaded.compressedSizeKB,
        status: 'PENDING_VERIFICATION',
        submittedAt: nowIso,
        createdAt: nowIso,
        screenshotDeleted: false,
      };

      const existingPayments = storage
        .getPayments()
        .filter((p) => p.paymentId !== paymentId);
      storage.savePayments([newPayment, ...existingPayments]);

      try {
        await persistPaymentToFirestore(newPayment, OperationType.CREATE);
      } catch (err) {
        onStageChange?.('SUBMISSION_ERROR');
        throw err;
      }

      onStageChange?.('SUBMITTED');

      return {
        payment: newPayment,
        bookings: createdOrUpdatedBookings,
      };
    } finally {
      inFlightSubmissions.delete(submissionLockKey);
    }
  },

  /**
   * Admin Action: APPROVE PAYMENT (Section 2, 11, 16, 17, 22)
   * - Allowed ONLY when payment is PENDING_VERIFICATION
   * - REJECTED payments can NEVER be approved
   * - Sets payment.status = "APPROVED" and booking.paymentStatus = "APPROVED"
   * - Sets booking.bookingStatus = "CONFIRMED"
   * - Generates the final Booking ID (DW-YYYYMMDD-XXXXXX) if not already generated
   * - Uses Firestore transaction for atomic state transition
   */
  approvePaymentByAdmin: async (paymentId: string): Promise<{
    payment: PaymentRecord;
    confirmedBookings: Booking[];
  }> => {
    assertAuthorizedAdminForPaymentAction();

    const payments = storage.getPayments();
    const pIdx = payments.findIndex((p) => p.paymentId === paymentId);
    if (pIdx === -1) {
      throw new Error('Payment record not found.');
    }

    const localPayment = payments[pIdx];
    if (isPaymentRejectedStatus(localPayment.status)) {
      throw new Error(
        'This payment has already been REJECTED. Once rejected, a payment is final and cannot be approved.'
      );
    }
    if (isPaymentApprovedStatus(localPayment.status)) {
      throw new Error('This payment has already been APPROVED.');
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const pickupHours = appConfig.getPickupHours();
    const confirmedDeadline = new Date(
      now.getTime() + pickupHours * 60 * 60 * 1000
    ).toISOString();

    const bookings = storage.getBookings();
    const existingIds = new Set(bookings.map((b) => b.bookingId));
    const finalBookingIds: string[] = [];
    const confirmedBookings: Booking[] = [];
    const oldTempIdsToDelete: string[] = [];

    for (let i = 0; i < bookings.length; i++) {
      const b = bookings[i];
      const matchesPayment =
        b.paymentId === localPayment.paymentId ||
        localPayment.bookingIds.includes(b.bookingId) ||
        (b.bookingReference && b.bookingReference === localPayment.bookingReference);

      if (matchesPayment) {
        const oldBookingId = b.bookingId;
        const isAlreadyFinalDwId = /^DW-\d{8}-[A-Z0-9]{6}$/.test(oldBookingId);
        const finalBookingId = isAlreadyFinalDwId
          ? oldBookingId
          : generateFinalDesiWardrobeBookingId(existingIds);
        existingIds.add(finalBookingId);
        finalBookingIds.push(finalBookingId);

        const confirmedBooking: Booking = {
          ...b,
          bookingId: finalBookingId,
          bookingReference: b.bookingReference || oldBookingId,
          paymentId: localPayment.paymentId,
          paymentStatus: 'APPROVED',
          bookingStatus: 'CONFIRMED',
          status: 'CONFIRMED',
          confirmedAt: nowIso,
          pickupDeadline: confirmedDeadline,
        };

        bookings[i] = confirmedBooking;
        confirmedBookings.push(confirmedBooking);
        if (oldBookingId !== finalBookingId) {
          oldTempIdsToDelete.push(oldBookingId);
        }
      }
    }

    const updatedPayment: PaymentRecord = {
      ...localPayment,
      status: 'APPROVED',
      verifiedAt: nowIso,
      finalBookingIds,
    };

    // Execute atomic Firestore transaction verifying current remote state is PENDING_VERIFICATION
    const paymentRef = doc(db, 'payments', paymentId);
    try {
      await runTransaction(db, async (transaction) => {
        const paymentSnap = await transaction.get(paymentRef);
        if (paymentSnap.exists()) {
          const remoteData = paymentSnap.data() as PaymentRecord;
          if (isPaymentRejectedStatus(remoteData.status)) {
            throw new Error(
              'This payment has already been REJECTED. Once rejected, a payment is final and cannot be approved.'
            );
          }
          if (isPaymentApprovedStatus(remoteData.status)) {
            throw new Error('This payment has already been APPROVED.');
          }
        }

        transaction.set(paymentRef, sanitizePaymentForFirestore(updatedPayment));
        for (const cb of confirmedBookings) {
          const cbRef = doc(db, 'bookings', cb.bookingId);
          transaction.set(cbRef, sanitizeBookingForFirestore(cb));
        }
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('already been REJECTED') ||
          error.message.includes('already been APPROVED'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `payments/${paymentId}`);
    }

    for (const oldId of oldTempIdsToDelete) {
      try {
        await deleteDoc(doc(db, 'bookings', oldId));
      } catch {
        // Ignore if old temporary doc was already replaced
      }
    }

    storage.saveBookings(bookings);
    payments[pIdx] = updatedPayment;
    storage.savePayments(payments);

    return {
      payment: updatedPayment,
      confirmedBookings,
    };
  },

  /**
   * Admin Action: REJECT PAYMENT (Section 3, 11, 16, 22)
   * - Allowed ONLY when payment is PENDING_VERIFICATION
   * - APPROVED payments can NEVER be rejected
   * - Sets payment.status = "REJECTED" and booking.paymentStatus = "REJECTED"
   * - Sets booking.bookingStatus = "CANCELLED" and booking.status = "CANCELLED"
   * - Releases reserved stock and uses Firestore transaction for atomic state transition
   */
  rejectPaymentByAdmin: async (paymentId: string): Promise<PaymentRecord> => {
    assertAuthorizedAdminForPaymentAction();

    const payments = storage.getPayments();
    const pIdx = payments.findIndex((p) => p.paymentId === paymentId);
    if (pIdx === -1) {
      throw new Error('Payment record not found.');
    }

    const localPayment = payments[pIdx];
    if (isPaymentApprovedStatus(localPayment.status)) {
      throw new Error(
        'This payment has already been APPROVED. Once approved, a payment is final and cannot be rejected.'
      );
    }
    if (isPaymentRejectedStatus(localPayment.status)) {
      throw new Error('This payment has already been REJECTED.');
    }

    const nowIso = new Date().toISOString();
    const bookings = storage.getBookings();
    const cancelledBookings: Booking[] = [];

    for (let i = 0; i < bookings.length; i++) {
      const b = bookings[i];
      const matchesPayment =
        b.paymentId === localPayment.paymentId ||
        localPayment.bookingIds.includes(b.bookingId) ||
        (b.bookingReference && b.bookingReference === localPayment.bookingReference);

      if (matchesPayment) {
        if (b.status !== 'CANCELLED' && b.bookingStatus !== 'CANCELLED') {
          inventoryService.releaseStockOnNotSold(b.productId, b.quantity, false);
        }
        const cancelledBooking: Booking = {
          ...b,
          paymentStatus: 'REJECTED',
          bookingStatus: 'CANCELLED',
          status: 'CANCELLED',
        };
        bookings[i] = cancelledBooking;
        cancelledBookings.push(cancelledBooking);
      }
    }

    const updatedPayment: PaymentRecord = {
      ...localPayment,
      status: 'REJECTED',
      rejectedAt: nowIso,
    };

    const paymentRef = doc(db, 'payments', paymentId);
    try {
      await runTransaction(db, async (transaction) => {
        const paymentSnap = await transaction.get(paymentRef);
        if (paymentSnap.exists()) {
          const remoteData = paymentSnap.data() as PaymentRecord;
          if (isPaymentApprovedStatus(remoteData.status)) {
            throw new Error(
              'This payment has already been APPROVED. Once approved, a payment is final and cannot be rejected.'
            );
          }
          if (isPaymentRejectedStatus(remoteData.status)) {
            throw new Error('This payment has already been REJECTED.');
          }
        }

        transaction.set(paymentRef, sanitizePaymentForFirestore(updatedPayment));
        for (const cb of cancelledBookings) {
          const cbRef = doc(db, 'bookings', cb.bookingId);
          transaction.set(cbRef, sanitizeBookingForFirestore(cb));
        }
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('already been APPROVED') ||
          error.message.includes('already been REJECTED'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `payments/${paymentId}`);
    }

    storage.saveBookings(bookings);
    payments[pIdx] = updatedPayment;
    storage.savePayments(payments);

    return updatedPayment;
  },

  /**
   * Admin Action: DELETE PAYMENT PROOF (Sections 4, 5, 6, 7, 8, 13, 14, 15, 18, 19, 20, 22)
   *
   * Behavior depends strictly on current payment status:
   * 1. PENDING_VERIFICATION + DELETE:
   *    - Automatically sets paymentStatus = REJECTED, bookingStatus = CANCELLED, rejectedAt = timestamp
   *    - Deletes screenshot file from Firebase Storage
   *    - Customer sees PAYMENT REJECTED / BOOKING CANCELLED
   * 2. APPROVED + DELETE SCREENSHOT:
   *    - Deletes screenshot file from Firebase Storage ONLY
   *    - Keeps payment.status = APPROVED, booking.paymentStatus = APPROVED, booking.bookingStatus = CONFIRMED, and Booking ID unchanged!
   *    - Customer continues to see PAYMENT VERIFIED / BOOKING SUCCESSFUL + Booking ID
   * 3. REJECTED + DELETE SCREENSHOT:
   *    - Deletes screenshot file from Firebase Storage ONLY
   *    - Keeps payment.status = REJECTED, booking.paymentStatus = REJECTED, booking.bookingStatus = CANCELLED
   *    - Customer continues to see PAYMENT REJECTED / BOOKING CANCELLED
   */
  deletePaymentProofByAdmin: async (paymentId: string): Promise<PaymentRecord> => {
    assertAuthorizedAdminForPaymentAction();

    const payments = storage.getPayments();
    const pIdx = payments.findIndex((p) => p.paymentId === paymentId);
    if (pIdx === -1) {
      throw new Error('Payment record not found.');
    }

    const localPayment = payments[pIdx];
    const nowIso = new Date().toISOString();

    // 1. Delete the actual uploaded screenshot file from Firebase Storage (Admin-only)
    if (localPayment.screenshotStoragePath) {
      await storageService.deletePaymentScreenshot(localPayment.screenshotStoragePath);
    }

    const bookings = storage.getBookings();
    const bookingsToUpdateInTx: Booking[] = [];
    let updatedPayment: PaymentRecord;

    if (localPayment.status === 'PENDING_VERIFICATION') {
      // Section 4 & 15: PENDING_VERIFICATION + DELETE -> Automatically REJECTED + BOOKING CANCELLED
      for (let i = 0; i < bookings.length; i++) {
        const b = bookings[i];
        const matchesPayment =
          b.paymentId === localPayment.paymentId ||
          localPayment.bookingIds.includes(b.bookingId) ||
          (b.bookingReference && b.bookingReference === localPayment.bookingReference);

        if (matchesPayment) {
          if (b.status !== 'CANCELLED' && b.bookingStatus !== 'CANCELLED') {
            inventoryService.releaseStockOnNotSold(b.productId, b.quantity, false);
          }
          const cancelledBooking: Booking = {
            ...b,
            paymentStatus: 'REJECTED',
            bookingStatus: 'CANCELLED',
            status: 'CANCELLED',
          };
          bookings[i] = cancelledBooking;
          bookingsToUpdateInTx.push(cancelledBooking);
        }
      }

      updatedPayment = {
        ...localPayment,
        status: 'REJECTED',
        rejectedAt: nowIso,
        screenshotURL: '',
        screenshotDeleted: true,
        screenshotDeletedAt: nowIso,
        deletedAt: nowIso,
      };
    } else if (isPaymentApprovedStatus(localPayment.status)) {
      // Section 5 & 13: APPROVED + DELETE SCREENSHOT -> File delete ONLY!
      // DO NOT change paymentStatus (stays APPROVED), DO NOT change bookingStatus (stays CONFIRMED), DO NOT remove Booking ID!
      updatedPayment = {
        ...localPayment,
        status: 'APPROVED',
        screenshotURL: '',
        screenshotDeleted: true,
        screenshotDeletedAt: nowIso,
        deletedAt: nowIso,
      };
    } else {
      // Section 6 & 14: REJECTED + DELETE SCREENSHOT -> File delete ONLY!
      // Keep paymentStatus = REJECTED and bookingStatus = CANCELLED
      updatedPayment = {
        ...localPayment,
        status: 'REJECTED',
        screenshotURL: '',
        screenshotDeleted: true,
        screenshotDeletedAt: nowIso,
        deletedAt: nowIso,
      };
    }

    const paymentRef = doc(db, 'payments', paymentId);
    try {
      await runTransaction(db, async (transaction) => {
        const paymentSnap = await transaction.get(paymentRef);
        if (paymentSnap.exists()) {
          const remoteData = paymentSnap.data() as PaymentRecord;
          if (isPaymentApprovedStatus(remoteData.status)) {
            // Preserve remote APPROVED state & finalBookingIds unconditionally
            updatedPayment = {
              ...remoteData,
              status: 'APPROVED',
              screenshotURL: '',
              screenshotDeleted: true,
              screenshotDeletedAt: nowIso,
              deletedAt: nowIso,
            };
          } else if (isPaymentRejectedStatus(remoteData.status)) {
            // Preserve remote REJECTED state unconditionally
            updatedPayment = {
              ...remoteData,
              status: 'REJECTED',
              screenshotURL: '',
              screenshotDeleted: true,
              screenshotDeletedAt: nowIso,
              deletedAt: nowIso,
            };
          }
        }

        transaction.set(paymentRef, sanitizePaymentForFirestore(updatedPayment));
        if (updatedPayment.status === 'REJECTED' && bookingsToUpdateInTx.length > 0) {
          for (const cb of bookingsToUpdateInTx) {
            const cbRef = doc(db, 'bookings', cb.bookingId);
            transaction.set(cbRef, sanitizeBookingForFirestore(cb));
          }
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `payments/${paymentId}`);
    }

    if (bookingsToUpdateInTx.length > 0) {
      storage.saveBookings(bookings);
    }
    payments[pIdx] = updatedPayment;
    storage.savePayments(payments);

    return updatedPayment;
  },
};
