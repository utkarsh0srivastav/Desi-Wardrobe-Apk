import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { firebaseStorage } from '../firebase';

/**
 * Image Service — Automatic Client-Side Image Compression & Firebase Storage Upload
 *
 * - Automatically compresses payment screenshots immediately upon selection
 * - Targets ~200 KB–450 KB while preserving sharp readability of UPI UTR/reference numbers,
 *   amounts, dates, and timestamps
 * - Uses bounded timeouts for Firebase Storage so uploads never hang indefinitely
 */

export interface CompressedImageResult {
  optimizedDataUrl: string;
  thumbnailDataUrl: string;
  storageUrl?: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  width: number;
  height: number;
}

export interface CompressedScreenshotData {
  dataUrl: string;
  fileName: string;
  originalSizeBytes: number;
  originalSizeKB: number;
  compressedSizeBytes: number;
  compressedSizeKB: number;
  width: number;
  height: number;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Storage upload timed out'));
    }, timeoutMs);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function renderScaledCanvas(
  img: HTMLImageElement,
  maxDimension: number,
  targetMaxKB: number,
  initialQuality: number
): { dataUrl: string; sizeKB: number; sizeBytes: number; width: number; height: number } {
  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context unavailable for image compression.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = initialQuality;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  let sizeBytes = Math.round((dataUrl.length * 3) / 4);
  let sizeKB = Math.max(1, Math.round(sizeBytes / 1024));

  while (sizeKB > targetMaxKB && quality > 0.62) {
    quality -= 0.06;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    sizeBytes = Math.round((dataUrl.length * 3) / 4);
    sizeKB = Math.max(1, Math.round(sizeBytes / 1024));
  }

  return { dataUrl, sizeKB, sizeBytes, width, height };
}

async function tryUploadToFirebaseStorage(
  dataUrl: string,
  folder: 'shops' | 'products'
): Promise<string> {
  try {
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`;
    const storageRef = ref(firebaseStorage, fileName);
    await withTimeout(uploadString(storageRef, dataUrl, 'data_url'), 3000);
    const downloadUrl = await withTimeout(getDownloadURL(storageRef), 2500);
    return downloadUrl;
  } catch {
    return dataUrl;
  }
}

export const imageService = {
  /**
   * Pure client-side payment screenshot compression.
   * Runs immediately when the customer selects a screenshot file:
   * - If the original image is already small (<= 350 KB) and readable, preserves high quality.
   * - Otherwise targets ~200 KB–420 KB while keeping payment amount, UTR/reference number,
   *   date, time, and status completely sharp and readable.
   */
  compressPaymentScreenshotOnly: (file: File): Promise<CompressedScreenshotData> => {
    return new Promise((resolve, reject) => {
      const originalSizeBytes = file.size;
      const originalSizeKB = Math.max(1, Number((file.size / 1024).toFixed(1)));
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Could not read the selected payment screenshot.'));
      reader.onload = (event) => {
        const rawDataUrl = event.target?.result as string;
        const img = new Image();
        img.onerror = () =>
          reject(new Error('Invalid or corrupted image file. Please select a valid screenshot.'));
        img.onload = () => {
          try {
            const isAlreadySmall =
              originalSizeKB <= 340 &&
              img.width <= 1400 &&
              img.height <= 1400 &&
              rawDataUrl.length <= 500000;

            const maxDim = isAlreadySmall ? Math.max(img.width, img.height) : 1350;
            const targetMaxKB = isAlreadySmall ? 380 : 360;
            const startQuality = isAlreadySmall ? 0.92 : 0.86;

            const compressed = renderScaledCanvas(img, maxDim, targetMaxKB, startQuality);

            resolve({
              dataUrl: compressed.dataUrl,
              fileName: file.name || 'payment_screenshot.jpg',
              originalSizeBytes,
              originalSizeKB,
              compressedSizeBytes: compressed.sizeBytes,
              compressedSizeKB: compressed.sizeKB,
              width: compressed.width,
              height: compressed.height,
            });
          } catch (err) {
            reject(err);
          }
        };
        img.src = rawDataUrl;
      };

      reader.readAsDataURL(file);
    });
  },

  compressImageFile: (
    file: File,
    storageFolder: 'shops' | 'products' = 'products'
  ): Promise<CompressedImageResult> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('Please select a valid image file (JPG, PNG, or WEBP).'));
        return;
      }

      const originalSizeKB = Math.round(file.size / 1024);
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Could not read the selected photo.'));
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid or corrupted image file.'));
        img.onload = async () => {
          try {
            const optimized = renderScaledCanvas(img, 1080, 220, 0.82);
            const thumbnail = renderScaledCanvas(img, 420, 60, 0.75);

            const uploadedUrl = await tryUploadToFirebaseStorage(
              optimized.dataUrl,
              storageFolder
            );

            resolve({
              optimizedDataUrl: uploadedUrl,
              thumbnailDataUrl: thumbnail.dataUrl,
              storageUrl: uploadedUrl,
              originalSizeKB,
              compressedSizeKB: optimized.sizeKB,
              width: optimized.width,
              height: optimized.height,
            });
          } catch (err) {
            reject(err);
          }
        };
        img.src = event.target?.result as string;
      };

      reader.readAsDataURL(file);
    });
  },
};
