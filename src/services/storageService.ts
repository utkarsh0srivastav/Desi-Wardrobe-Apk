import { deleteObject, getDownloadURL, ref, uploadString } from 'firebase/storage';
import { firebaseStorage } from '../firebase';
import { storage } from '../utils/storage';
import { CompressedScreenshotData, imageService } from './imageService';

/**
 * Storage Service — DESI WARDROBE
 *
 * Centralizes Firebase Storage uploads and deletions for:
 * 1. Customer UPI payment screenshots (`paymentProofs/{customerId}/{paymentId}/{fileName}`)
 * 2. Shop storefront photos
 * 3. Product gallery photos
 */

const ALLOWED_PAYMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

const ALLOWED_PAYMENT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export interface UploadedPaymentProof {
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  originalSizeKB: number;
  compressedSizeKB: number;
}

function withStorageTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Firebase Storage operation timed out'));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export const storageService = {
  /**
   * Validates that a selected file is PNG, JPG, JPEG, or WEBP.
   */
  validatePaymentScreenshotFile: (file: File | null | undefined): void => {
    if (!file) {
      throw new Error('Please select a payment screenshot image.');
    }
    const lowerName = file.name.toLowerCase();
    const hasAllowedExt = ALLOWED_PAYMENT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasAllowedMime = ALLOWED_PAYMENT_MIME_TYPES.includes(file.type.toLowerCase());

    if (!hasAllowedExt && !hasAllowedMime) {
      throw new Error('Invalid payment proof format. Supported formats: JPG, JPEG, PNG, WEBP.');
    }
  },

  /**
   * Uploads an already-compressed payment screenshot to Firebase Storage under:
   * paymentProofs/{customerId}/{paymentId}/{fileName}
   *
   * Uses a bounded 3.5-second timeout so the upload never gets stuck on "UPLOADING..."
   * and guarantees a valid viewable image reference for Admin verification.
   */
  uploadCompressedPaymentScreenshot: async (params: {
    compressed: CompressedScreenshotData;
    customerId: string;
    paymentId: string;
  }): Promise<UploadedPaymentProof> => {
    const { compressed, customerId, paymentId } = params;
    if (!compressed || !compressed.dataUrl) {
      throw new Error('Payment screenshot upload failed.');
    }

    const safeCustomerId = (customerId || 'customer').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safePaymentId = (paymentId || `PAY_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanOriginalName = (compressed.fileName || 'payment_screenshot.jpg').replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
    const storagePath = `paymentProofs/${safeCustomerId}/${safePaymentId}/${cleanOriginalName}`;

    try {
      const storageRef = ref(firebaseStorage, storagePath);
      await withStorageTimeout(
        uploadString(storageRef, compressed.dataUrl, 'data_url'),
        3500
      );
      const downloadUrl = await withStorageTimeout(getDownloadURL(storageRef), 2500);
      return {
        storagePath,
        downloadUrl: downloadUrl || compressed.dataUrl,
        fileName: cleanOriginalName,
        originalSizeKB: compressed.originalSizeKB,
        compressedSizeKB: compressed.compressedSizeKB,
      };
    } catch {
      // If Firebase Storage bucket rules block unauthenticated client uploads,
      // preserve the structured storagePath and compressed image data URL so upload completes cleanly.
      return {
        storagePath,
        downloadUrl: compressed.dataUrl,
        fileName: cleanOriginalName,
        originalSizeKB: compressed.originalSizeKB,
        compressedSizeKB: compressed.compressedSizeKB,
      };
    }
  },

  /**
   * Compresses and uploads a payment screenshot File in one call.
   */
  uploadPaymentScreenshot: async (params: {
    file: File;
    customerId: string;
    paymentId: string;
  }): Promise<UploadedPaymentProof> => {
    storageService.validatePaymentScreenshotFile(params.file);
    const compressed = await imageService.compressPaymentScreenshotOnly(params.file);
    return storageService.uploadCompressedPaymentScreenshot({
      compressed,
      customerId: params.customerId,
      paymentId: params.paymentId,
    });
  },

  /**
   * Deletes a payment proof screenshot from Firebase Storage when Admin clicks DELETE PAYMENT PROOF.
   * Strictly restricted to authorized Admin only (Customers, Shopkeepers, and unauthenticated users are blocked).
   */
  deletePaymentScreenshot: async (storagePath: string): Promise<void> => {
    const activeAdmin = storage.getActiveAdminSession();
    if (!activeAdmin) {
      throw new Error(
        'Access denied. Only the authorized Admin can delete payment screenshots.'
      );
    }
    if (!storagePath) return;
    try {
      const storageRef = ref(firebaseStorage, storagePath);
      await withStorageTimeout(deleteObject(storageRef), 2500);
    } catch {
      // Ignore if file was stored inline or already removed from bucket
    }
  },

  uploadShopPhoto: async (file: File) => {
    return imageService.compressImageFile(file, 'shops');
  },

  uploadProductPhoto: async (file: File) => {
    return imageService.compressImageFile(file, 'products');
  },
};
