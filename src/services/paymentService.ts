import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
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
  getBookingFirestoreDocId,
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
const inFlightApprovals = new Set<string>();

function assertAuthorizedAdminForPaymentAction(): void {
  const activeAdmin = storage.getActiveAdminSession();
  if (!activeAdmin || !activeAdmin.pinVerified) {
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
    clean.originalSizeKB = Math.max(0, payment.originalSizeKB);
  }
  if (typeof payment.compressedSizeKB === 'number' && Number.isFinite(payment.compressedSizeKB)) {
    clean.compressedSizeKB = Math.max(0, payment.compressedSizeKB);
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
  if (payment.approvedAt) {
    clean.approvedAt = payment.approvedAt;
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
  const rawRecord = payment as unknown as Record<string, unknown>;
  const cleanRecord = clean as unknown as Record<string, unknown>;
  for (const serverKey of [
    'submittedAtServer',
    'verifiedAtServer',
    'approvedAtServer',
    'rejectedAtServer',
  ]) {
    if (rawRecord[serverKey] !== undefined) {
      cleanRecord[serverKey] = rawRecord[serverKey];
    }
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
    const payload: Record<string, unknown> = { ...clean };
    if (op === OperationType.CREATE) {
      payload.submittedAtServer = serverTimestamp();
    }
    await setDoc(doc(db, 'payments', payment.paymentId), payload, { merge: true });
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

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as PaymentRecord;
          if (data && data.paymentId) {
            remotePayments.push(data);
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
          const docId = getBookingFirestoreDocId(existingB);
          const updatedB: Booking = {
            ...existingB,
            documentId: docId,
            paymentId,
            paymentStatus: 'PENDING_VERIFICATION',
            bookingStatus: 'PAYMENT_PENDING',
            status: 'PAYMENT_PENDING',
          };
          const bIdx = existingBookings.findIndex(
            (x) => getBookingFirestoreDocId(x) === docId || x.bookingId === existingB.bookingId
          );
          if (bIdx !== -1) {
            existingBookings[bIdx] = updatedB;
          }
          createdOrUpdatedBookings.push(updatedB);
          bookingIds.push(docId);
          await persistBookingToFirestore(updatedB, OperationType.UPDATE);
        }
      } else {
        const perUnitBookingFee = appConfig.getMinBookingAmountPerUnit();
        for (let i = 0; i < draft.items.length; i++) {
          const item = draft.items[i];
          inventoryService.reserveProductStock(item.productId, item.quantity);

          const bookingDocId =
            draft.items.length === 1
              ? draft.bookingReference
              : `${draft.bookingReference}-${i + 1}`;

          const newBooking: Booking = {
            documentId: bookingDocId,
            bookingId: bookingDocId,
            bookingReference: bookingDocId,
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
          bookingIds.push(bookingDocId);
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
   * Admin Action: APPROVE PAYMENT (Atomic, Idempotent Firestore Transaction)
   *
   * 1. Reads payment document directly inside a Firestore transaction.
   * 2. If already APPROVED, returns existing confirmed booking(s) & Booking ID without generating a duplicate ID.
   * 3. Verifies payment.status == "PENDING_VERIFICATION" (rejects if REJECTED).
   * 4. Reads the exact associated booking document(s) in Firestore (`bookings/{bookingReference}`).
   * 5. Generates `DW-YYYYMMDD-XXXXXX` Booking ID ONLY if not already present on the booking.
   * 6. Updates the SAME booking document in place (`bookingStatus = "CONFIRMED"`, `paymentStatus = "APPROVED"`,
   *    `bookingId = generatedBookingId`, `confirmedAt`, `pickupDeadline = confirmedAt + 48 hours`).
   * 7. Updates payment document (`status = "APPROVED"`, `verifiedAt`, `finalBookingIds`).
   * 8. Updates local cache ONLY after the Firestore transaction commits.
   */
  approvePaymentByAdmin: async (paymentId: string): Promise<{
    payment: PaymentRecord;
    confirmedBookings: Booking[];
  }> => {
    assertAuthorizedAdminForPaymentAction();

    if (inFlightApprovals.has(paymentId)) {
      throw new Error('Payment approval is already in progress. Please wait.');
    }
    inFlightApprovals.add(paymentId);

    try {
      const localBookings = storage.getBookings();
      const existingIds = new Set<string>(localBookings.map((b) => b.bookingId));

      // Discover any associated booking document IDs from Firestore in case bookingIds array only had bookingReference
      const localPaymentHint = storage.getPayments().find((p) => p.paymentId === paymentId);
      const candidateBookingDocIds = new Set<string>();
      if (localPaymentHint) {
        for (const id of localPaymentHint.bookingIds || []) {
          if (id) candidateBookingDocIds.add(id);
        }
        if (localPaymentHint.bookingReference) {
          candidateBookingDocIds.add(localPaymentHint.bookingReference);
        }
      }
      for (const b of localBookings) {
        if (
          b.paymentId === paymentId ||
          (localPaymentHint && b.bookingReference === localPaymentHint.bookingReference)
        ) {
          candidateBookingDocIds.add(getBookingFirestoreDocId(b));
        }
      }

      if (candidateBookingDocIds.size === 0) {
        try {
          const q = query(
            collection(db, 'bookings'),
            where('paymentId', '==', paymentId),
            where('quantity', '>=', 1)
          );
          const snap = await getDocs(q);
          snap.forEach((d) => candidateBookingDocIds.add(d.id));
        } catch {
          // Proceed with transaction read of payment document
        }
      }

      const paymentRef = doc(db, 'payments', paymentId);
      let committedPayment!: PaymentRecord;
      let committedBookings: Booking[] = [];

      await runTransaction(db, async (transaction) => {
        const paymentSnap = await transaction.get(paymentRef);
        if (!paymentSnap.exists()) {
          throw new Error('Payment record not found in database.');
        }

        const remotePayment = paymentSnap.data() as PaymentRecord;
        if (isPaymentRejectedStatus(remotePayment.status)) {
          throw new Error(
            'This payment has already been REJECTED. Once rejected, a payment is final and cannot be approved.'
          );
        }

        const docIdsToRead = new Set<string>(candidateBookingDocIds);
        for (const id of remotePayment.bookingIds || []) {
          if (id) docIdsToRead.add(id);
        }
        if (remotePayment.bookingReference) {
          docIdsToRead.add(remotePayment.bookingReference);
        }

        const bookingSnaps = await Promise.all(
          Array.from(docIdsToRead).map((docId) => transaction.get(doc(db, 'bookings', docId)))
        );

        // Idempotency: If payment is already APPROVED and bookings are already CONFIRMED with DW-* ID, return existing state
        if (
          isPaymentApprovedStatus(remotePayment.status) &&
          remotePayment.finalBookingIds &&
          remotePayment.finalBookingIds.length > 0
        ) {
          const existingConfirmed: Booking[] = [];
          for (const bSnap of bookingSnaps) {
            if (bSnap.exists()) {
              const bData = bSnap.data() as Booking;
              existingConfirmed.push({
                ...bData,
                documentId: bSnap.id,
              });
            }
          }
          if (existingConfirmed.length > 0) {
            committedPayment = remotePayment;
            committedBookings = existingConfirmed;
            return;
          }
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const pickupHours = appConfig.getPickupHours(); // 48 hours
        const confirmedDeadline = new Date(
          now.getTime() + pickupHours * 60 * 60 * 1000
        ).toISOString();

        const txConfirmedBookings: Booking[] = [];
        const txFinalBookingIds: string[] = [];

        for (let idx = 0; idx < bookingSnaps.length; idx++) {
          const bSnap = bookingSnaps[idx];
          if (!bSnap.exists()) continue;

          const bData = bSnap.data() as Booking;
          const docId = bSnap.id;

          if (
            bData.paymentStatus === 'REJECTED' ||
            bData.bookingStatus === 'CANCELLED' ||
            bData.status === 'CANCELLED'
          ) {
            throw new Error('Cannot approve a booking that has already been cancelled.');
          }

          // Preserve existing DW-YYYYMMDD-XXXXXX Booking ID if already generated; otherwise generate once
          const existingDwId =
            /^DW-\d{8}-[A-Z0-9]{6}$/.test(bData.bookingId)
              ? bData.bookingId
              : remotePayment.finalBookingIds?.[idx] &&
                  /^DW-\d{8}-[A-Z0-9]{6}$/.test(remotePayment.finalBookingIds[idx])
                ? remotePayment.finalBookingIds[idx]
                : null;

          const finalBookingId =
            existingDwId || generateFinalDesiWardrobeBookingId(existingIds);
          existingIds.add(finalBookingId);
          txFinalBookingIds.push(finalBookingId);

          const confirmedAtIso = bData.confirmedAt || bData.approvedAt || nowIso;
          const deadlineIso = bData.confirmedAt
            ? bData.pickupDeadline
            : confirmedDeadline;

          const updatedBooking: Booking = {
            ...bData,
            documentId: docId,
            bookingId: finalBookingId,
            bookingReference: bData.bookingReference || docId,
            paymentId: remotePayment.paymentId,
            paymentStatus: 'APPROVED',
            bookingStatus: 'CONFIRMED',
            status: 'CONFIRMED',
            confirmedAt: confirmedAtIso,
            approvedAt: confirmedAtIso,
            pickupDeadline: deadlineIso,
          };

          txConfirmedBookings.push(updatedBooking);

          // Update the EXACT SAME booking document in place so Customer & Shopkeeper listeners update immediately
          const cleanBooking = sanitizeBookingForFirestore(updatedBooking);
          transaction.set(
            doc(db, 'bookings', docId),
            {
              ...cleanBooking,
              confirmedAtServer: serverTimestamp(),
              approvedAtServer: serverTimestamp(),
            },
            { merge: true }
          );
        }

        if (txConfirmedBookings.length === 0) {
          throw new Error('Associated booking record not found for this payment.');
        }

        const verifiedAtIso = remotePayment.verifiedAt || remotePayment.approvedAt || nowIso;
        const updatedPayment: PaymentRecord = {
          ...remotePayment,
          status: 'APPROVED',
          verifiedAt: verifiedAtIso,
          approvedAt: verifiedAtIso,
          finalBookingIds: txFinalBookingIds,
        };

        const cleanPayment = sanitizePaymentForFirestore(updatedPayment);
        transaction.set(
          paymentRef,
          {
            ...cleanPayment,
            verifiedAtServer: serverTimestamp(),
            approvedAtServer: serverTimestamp(),
          },
          { merge: true }
        );

        committedPayment = updatedPayment;
        committedBookings = txConfirmedBookings;
      });

      // Update local storage cache ONLY after Firestore transaction has succeeded
      const updatedLocalBookings = [...storage.getBookings()];
      for (const cb of committedBookings) {
        const docId = getBookingFirestoreDocId(cb);
        const idx = updatedLocalBookings.findIndex(
          (b) =>
            getBookingFirestoreDocId(b) === docId ||
            b.bookingReference === cb.bookingReference ||
            b.bookingId === cb.bookingId
        );
        if (idx !== -1) {
          updatedLocalBookings[idx] = cb;
        } else {
          updatedLocalBookings.unshift(cb);
        }
      }
      storage.saveBookings(updatedLocalBookings);

      const updatedLocalPayments = [...storage.getPayments()];
      const pIdx = updatedLocalPayments.findIndex((p) => p.paymentId === paymentId);
      if (pIdx !== -1) {
        updatedLocalPayments[pIdx] = committedPayment;
      } else {
        updatedLocalPayments.unshift(committedPayment);
      }
      storage.savePayments(updatedLocalPayments);

      // Non-blocking customer confirmation email via /api/send-email (Brevo)
      // Triggered strictly AFTER payment is approved, booking is confirmed, and Booking ID is finalized.
      void (async () => {
        try {
          const firstBooking = committedBookings[0];
          const customerId = committedPayment.customerId || firstBooking?.customerId || '';
          const customerMobile =
            committedPayment.customerMobile || firstBooking?.customerMobile || '';

          let customerEmail = '';
          const localCustomer = storage
            .getCustomers()
            .find(
              (c) =>
                (customerId && c.customerId === customerId) ||
                (customerMobile && c.mobile === customerMobile)
            );
          if (localCustomer?.email && localCustomer.email.trim()) {
            customerEmail = localCustomer.email.trim();
          } else if (customerId) {
            try {
              const custSnap = await getDoc(doc(db, 'customers', customerId));
              if (custSnap.exists()) {
                const custData = custSnap.data() as Record<string, unknown>;
                if (typeof custData.email === 'string' && custData.email.trim()) {
                  customerEmail = custData.email.trim();
                }
              }
            } catch {
              // Ignore customer lookup errors so payment approval is never affected
            }
          }

          if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
            return;
          }

          const allShops = storage.getShops();
          for (const confirmedBooking of committedBookings) {
            const matchedShop = allShops.find((s) => s.shopId === confirmedBooking.shopId);
            await fetch('/api/send-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: customerEmail,
                customerEmail,
                email: customerEmail,
                customerName:
                  confirmedBooking.customerName || committedPayment.customerName,
                customerMobile:
                  confirmedBooking.customerMobile || committedPayment.customerMobile,
                bookingId: confirmedBooking.bookingId,
                bookingReference:
                  confirmedBooking.bookingReference || committedPayment.bookingReference,
                productName: confirmedBooking.productName,
                size: confirmedBooking.size,
                color: confirmedBooking.color,
                quantity: confirmedBooking.quantity,
                price: confirmedBooking.price,
                amountPaid:
                  confirmedBooking.paymentAmount || committedPayment.expectedAmount,
                paymentAmount:
                  confirmedBooking.paymentAmount || committedPayment.expectedAmount,
                shopName: confirmedBooking.shopName || committedPayment.shopName,
                shopMobile: matchedShop?.mobile || '',
                shopAddress:
                  confirmedBooking.shopLocationName || matchedShop?.locationName || '',
                shopLocationName:
                  confirmedBooking.shopLocationName || matchedShop?.locationName || '',
                pickupDeadline: confirmedBooking.pickupDeadline,
                approvedAt:
                  confirmedBooking.approvedAt ||
                  confirmedBooking.confirmedAt ||
                  committedPayment.approvedAt,
              }),
            });
          }
        } catch (emailErr) {
          console.warn(
            '[Desi Wardrobe] Non-blocking booking confirmation email skipped or failed:',
            emailErr
          );
        }
      })();

      return {
        payment: committedPayment,
        confirmedBookings: committedBookings,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('already been REJECTED') ||
          error.message.includes('already been APPROVED') ||
          error.message.includes('already in progress') ||
          error.message.includes('not found'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `payments/${paymentId}`);
    } finally {
      inFlightApprovals.delete(paymentId);
    }
  },

  /**
   * Admin Action: REJECT PAYMENT (Atomic Firestore Transaction)
   * - Allowed ONLY when payment is PENDING_VERIFICATION
   * - APPROVED payments can NEVER be rejected
   * - Sets payment.status = "REJECTED" and booking.paymentStatus = "REJECTED"
   * - Sets booking.bookingStatus = "CANCELLED" and booking.status = "CANCELLED"
   * - Releases reserved stock and updates the exact same booking document in place
   */
  rejectPaymentByAdmin: async (paymentId: string): Promise<PaymentRecord> => {
    assertAuthorizedAdminForPaymentAction();

    const localBookings = storage.getBookings();
    const localPaymentHint = storage.getPayments().find((p) => p.paymentId === paymentId);
    const candidateBookingDocIds = new Set<string>();
    if (localPaymentHint) {
      for (const id of localPaymentHint.bookingIds || []) {
        if (id) candidateBookingDocIds.add(id);
      }
      if (localPaymentHint.bookingReference) {
        candidateBookingDocIds.add(localPaymentHint.bookingReference);
      }
    }
    for (const b of localBookings) {
      if (
        b.paymentId === paymentId ||
        (localPaymentHint && b.bookingReference === localPaymentHint.bookingReference)
      ) {
        candidateBookingDocIds.add(getBookingFirestoreDocId(b));
      }
    }

    const paymentRef = doc(db, 'payments', paymentId);
    let committedPayment!: PaymentRecord;
    let committedBookings: Booking[] = [];

    try {
      await runTransaction(db, async (transaction) => {
        const paymentSnap = await transaction.get(paymentRef);
        if (!paymentSnap.exists()) {
          throw new Error('Payment record not found in database.');
        }

        const remotePayment = paymentSnap.data() as PaymentRecord;
        if (isPaymentApprovedStatus(remotePayment.status)) {
          throw new Error(
            'This payment has already been APPROVED. Once approved, a payment is final and cannot be rejected.'
          );
        }
        if (isPaymentRejectedStatus(remotePayment.status)) {
          throw new Error('This payment has already been REJECTED.');
        }

        const docIdsToRead = new Set<string>(candidateBookingDocIds);
        for (const id of remotePayment.bookingIds || []) {
          if (id) docIdsToRead.add(id);
        }
        if (remotePayment.bookingReference) {
          docIdsToRead.add(remotePayment.bookingReference);
        }

        const bookingSnaps = await Promise.all(
          Array.from(docIdsToRead).map((docId) => transaction.get(doc(db, 'bookings', docId)))
        );

        const nowIso = new Date().toISOString();
        const txCancelledBookings: Booking[] = [];

        for (const bSnap of bookingSnaps) {
          if (!bSnap.exists()) continue;
          const bData = bSnap.data() as Booking;
          const docId = bSnap.id;

          const cancelledBooking: Booking = {
            ...bData,
            documentId: docId,
            paymentStatus: 'REJECTED',
            bookingStatus: 'CANCELLED',
            status: 'CANCELLED',
            rejectedAt: nowIso,
          };
          txCancelledBookings.push(cancelledBooking);

          const cleanBooking = sanitizeBookingForFirestore(cancelledBooking);
          transaction.set(
            doc(db, 'bookings', docId),
            {
              ...cleanBooking,
              rejectedAtServer: serverTimestamp(),
            },
            { merge: true }
          );
        }

        const updatedPayment: PaymentRecord = {
          ...remotePayment,
          status: 'REJECTED',
          rejectedAt: nowIso,
        };

        const cleanPayment = sanitizePaymentForFirestore(updatedPayment);
        transaction.set(
          paymentRef,
          {
            ...cleanPayment,
            rejectedAtServer: serverTimestamp(),
          },
          { merge: true }
        );

        committedPayment = updatedPayment;
        committedBookings = txCancelledBookings;
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('already been APPROVED') ||
          error.message.includes('already been REJECTED') ||
          error.message.includes('not found'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `payments/${paymentId}`);
    }

    // Release reserved stock after transaction commits
    for (const cb of committedBookings) {
      inventoryService.releaseStockOnNotSold(cb.productId, cb.quantity, false);
    }

    const updatedLocalBookings = [...storage.getBookings()];
    for (const cb of committedBookings) {
      const docId = getBookingFirestoreDocId(cb);
      const idx = updatedLocalBookings.findIndex(
        (b) =>
          getBookingFirestoreDocId(b) === docId ||
          b.bookingReference === cb.bookingReference ||
          b.bookingId === cb.bookingId
      );
      if (idx !== -1) {
        updatedLocalBookings[idx] = cb;
      }
    }
    storage.saveBookings(updatedLocalBookings);

    const updatedLocalPayments = [...storage.getPayments()];
    const pIdx = updatedLocalPayments.findIndex((p) => p.paymentId === paymentId);
    if (pIdx !== -1) {
      updatedLocalPayments[pIdx] = committedPayment;
    }
    storage.savePayments(updatedLocalPayments);

    return committedPayment;
  },

  /**
   * Admin Action: DELETE PAYMENT PROOF
   *
   * 1. PENDING_VERIFICATION + DELETE:
   *    - Sets paymentStatus = REJECTED, bookingStatus = CANCELLED, rejectedAt = serverTimestamp()
   *    - Deletes screenshot file from Firebase Storage
   * 2. APPROVED + DELETE SCREENSHOT:
   *    - Deletes screenshot file from Firebase Storage ONLY
   *    - Keeps payment.status = APPROVED, booking.paymentStatus = APPROVED, booking.bookingStatus = CONFIRMED, and Booking ID unchanged
   * 3. REJECTED + DELETE SCREENSHOT:
   *    - Deletes screenshot file from Firebase Storage ONLY
   *    - Keeps payment.status = REJECTED, booking.paymentStatus = REJECTED, booking.bookingStatus = CANCELLED
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

    if (localPayment.screenshotStoragePath) {
      await storageService.deletePaymentScreenshot(localPayment.screenshotStoragePath);
    }

    const localBookings = storage.getBookings();
    const candidateBookingDocIds = new Set<string>();
    for (const id of localPayment.bookingIds || []) {
      if (id) candidateBookingDocIds.add(id);
    }
    if (localPayment.bookingReference) {
      candidateBookingDocIds.add(localPayment.bookingReference);
    }
    for (const b of localBookings) {
      if (
        b.paymentId === paymentId ||
        b.bookingReference === localPayment.bookingReference
      ) {
        candidateBookingDocIds.add(getBookingFirestoreDocId(b));
      }
    }

    const paymentRef = doc(db, 'payments', paymentId);
    let committedPayment!: PaymentRecord;
    const cancelledBookingsInTx: Booking[] = [];

    try {
      await runTransaction(db, async (transaction) => {
        const paymentSnap = await transaction.get(paymentRef);
        const remoteData = paymentSnap.exists()
          ? (paymentSnap.data() as PaymentRecord)
          : localPayment;

        if (isPaymentApprovedStatus(remoteData.status)) {
          committedPayment = {
            ...remoteData,
            status: 'APPROVED',
            screenshotURL: '',
            screenshotDeleted: true,
            screenshotDeletedAt: nowIso,
            deletedAt: nowIso,
          };
          transaction.set(paymentRef, sanitizePaymentForFirestore(committedPayment), {
            merge: true,
          });
          return;
        }

        if (isPaymentRejectedStatus(remoteData.status)) {
          committedPayment = {
            ...remoteData,
            status: 'REJECTED',
            screenshotURL: '',
            screenshotDeleted: true,
            screenshotDeletedAt: nowIso,
            deletedAt: nowIso,
          };
          transaction.set(paymentRef, sanitizePaymentForFirestore(committedPayment), {
            merge: true,
          });
          return;
        }

        // PENDING_VERIFICATION + DELETE -> Reject payment and cancel associated booking(s)
        const bookingSnaps = await Promise.all(
          Array.from(candidateBookingDocIds).map((docId) =>
            transaction.get(doc(db, 'bookings', docId))
          )
        );

        for (const bSnap of bookingSnaps) {
          if (!bSnap.exists()) continue;
          const bData = bSnap.data() as Booking;
          const docId = bSnap.id;
          const cancelledBooking: Booking = {
            ...bData,
            documentId: docId,
            paymentStatus: 'REJECTED',
            bookingStatus: 'CANCELLED',
            status: 'CANCELLED',
            rejectedAt: nowIso,
          };
          cancelledBookingsInTx.push(cancelledBooking);
          transaction.set(
            doc(db, 'bookings', docId),
            {
              ...sanitizeBookingForFirestore(cancelledBooking),
              rejectedAtServer: serverTimestamp(),
            },
            { merge: true }
          );
        }

        committedPayment = {
          ...remoteData,
          status: 'REJECTED',
          rejectedAt: nowIso,
          screenshotURL: '',
          screenshotDeleted: true,
          screenshotDeletedAt: nowIso,
          deletedAt: nowIso,
        };
        transaction.set(
          paymentRef,
          {
            ...sanitizePaymentForFirestore(committedPayment),
            rejectedAtServer: serverTimestamp(),
          },
          { merge: true }
        );
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `payments/${paymentId}`);
    }

    if (cancelledBookingsInTx.length > 0) {
      for (const cb of cancelledBookingsInTx) {
        inventoryService.releaseStockOnNotSold(cb.productId, cb.quantity, false);
      }
      const updatedLocalBookings = [...storage.getBookings()];
      for (const cb of cancelledBookingsInTx) {
        const docId = getBookingFirestoreDocId(cb);
        const idx = updatedLocalBookings.findIndex(
          (b) =>
            getBookingFirestoreDocId(b) === docId ||
            b.bookingReference === cb.bookingReference ||
            b.bookingId === cb.bookingId
        );
        if (idx !== -1) {
          updatedLocalBookings[idx] = cb;
        }
      }
      storage.saveBookings(updatedLocalBookings);
    }

    payments[pIdx] = committedPayment;
    storage.savePayments(payments);

    return committedPayment;
  },
};
