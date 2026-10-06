import React, { useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  ArrowLeft,
  CheckCircle2,
  Smartphone,
  Upload,
  AlertCircle,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import {
  Booking,
  PaymentRecord,
  PaymentUploadStage,
  PendingCheckoutDraft,
} from '../../types/models';
import { CompressedScreenshotData, imageService } from '../../services/imageService';
import { paymentService } from '../../services/paymentService';
import { storageService, UploadedPaymentProof } from '../../services/storageService';
import { ResilientImage } from '../../components/ResilientImage';

interface PaymentPageProps {
  draft: PendingCheckoutDraft;
  onBack: () => void;
  onPaymentProofSubmitted: (result: {
    payment: PaymentRecord;
    bookings: Booking[];
  }) => void;
}

function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * DESI WARDROBE — Manual UPI Payment & Screenshot Upload Screen
 *
 * Strictly adheres to V1 Manual UPI Payment Security & UI Rules:
 * - Dynamic booking amount = totalQuantity × ₹75
 * - Dynamic UPI QR code encodes internal destination (`upi://pay?pa=utkarsh1614@ybl&pn=Desi%20Wardrobe&am=XXX&cu=INR`)
 * - NEVER displays the Admin UPI ID (`utkarsh1614@ybl`) or raw UPI URI anywhere on screen
 * - Shows ONLY: PAYMENT, Booking Amount (₹XXX), Dynamic QR Code, "Scan to Pay", and "PAY USING UPI APP"
 * - File picker screenshot selection (JPG, JPEG, PNG, WEBP) with immediate automatic compression,
 *   live preview, Original Size + Compressed Size display, and staged Firebase Storage + Firestore upload
 * - Shows "PAYMENT PROOF SUBMITTED" popup with "VIEW VERIFICATION STATUS" button upon completion
 */
export const PaymentPage: React.FC<PaymentPageProps> = ({
  draft,
  onBack,
  onPaymentProofSubmitted,
}) => {
  const [stage, setStage] = useState<PaymentUploadStage | 'IDLE'>('IDLE');
  const [compressedScreenshot, setCompressedScreenshot] =
    useState<CompressedScreenshotData | null>(null);
  const [cachedUploadedProof, setCachedUploadedProof] =
    useState<UploadedPaymentProof | null>(null);
  const [stablePaymentId, setStablePaymentId] = useState<string>(
    () => `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
  );
  const [submittedResult, setSubmittedResult] = useState<{
    payment: PaymentRecord;
    bookings: Booking[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePayUsingUpiApp = () => {
    // Launches the device's compatible UPI app (Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, etc.)
    // Opening or returning from the UPI app never marks payment as verified.
    window.location.href = draft.upiUri;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0] || null;
    if (!file) return;

    try {
      setStage('SELECTING_FILE');
      storageService.validatePaymentScreenshotFile(file);

      // Reset cached upload reference because customer selected a new screenshot file
      setCachedUploadedProof(null);
      setStablePaymentId(
        `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      );

      setStage('COMPRESSING');
      const compressed = await imageService.compressPaymentScreenshotOnly(file);
      setCompressedScreenshot(compressed);
      setStage('READY_TO_UPLOAD');
    } catch (err) {
      setCompressedScreenshot(null);
      setStage('IDLE');
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Please select a valid screenshot image (JPG, JPEG, PNG, WEBP).'
      );
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const executeSubmission = async () => {
    if (!compressedScreenshot) {
      setErrorMsg('Please select your payment screenshot first.');
      return;
    }
    if (
      stage === 'COMPRESSING' ||
      stage === 'UPLOADING' ||
      stage === 'SAVING_PAYMENT_RECORD' ||
      stage === 'SUBMITTED'
    ) {
      return;
    }

    setErrorMsg(null);

    try {
      const result = await paymentService.submitPaymentProof({
        draft,
        compressedScreenshot,
        paymentId: stablePaymentId,
        cachedUploadedProof,
        onStageChange: (nextStage) => setStage(nextStage),
        onUploadedProofReady: (uploaded, payId) => {
          setCachedUploadedProof(uploaded);
          setStablePaymentId(payId);
        },
      });
      setStage('SUBMITTED');
      setSubmittedResult(result);
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Payment screenshot upload failed.';
      setErrorMsg(
        msg.includes('upload failed') ? 'Payment screenshot upload failed.' : msg
      );
      setStage((prev) => (prev === 'SAVING_PAYMENT_RECORD' ? 'SUBMISSION_ERROR' : 'UPLOAD_ERROR'));
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSubmission();
  };

  const isBusy =
    stage === 'COMPRESSING' ||
    stage === 'UPLOADING' ||
    stage === 'SAVING_PAYMENT_RECORD';

  const hasError = stage === 'UPLOAD_ERROR' || stage === 'SUBMISSION_ERROR';

  return (
    <div className="max-w-xl mx-auto px-4 pt-5 pb-24 space-y-5">
      <button
        type="button"
        onClick={onBack}
        disabled={isBusy}
        className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50 flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 space-y-6 shadow-xs">
        {/* PAYMENT HEADER & BOOKING AMOUNT */}
        <div className="text-center space-y-2 border-b border-[var(--border-subtle)] pb-5">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--accent-primary)]">
            PAYMENT
          </span>
          <div className="text-xs font-semibold text-[var(--text-secondary)]">
            Booking Amount
          </div>
          <div className="font-mono-tabular text-4xl sm:text-5xl font-bold text-[var(--text-primary)]">
            ₹{draft.expectedBookingAmount.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {draft.totalQuantity} {draft.totalQuantity === 1 ? 'unit' : 'units'} × ₹75 per unit
          </div>
        </div>

        {/* Selected Product Summary */}
        <div className="p-3.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2.5">
          {draft.items.map((item, idx) => (
            <div
              key={`${item.productId}-${idx}`}
              className="flex items-center justify-between gap-3 text-xs border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-12 rounded-lg overflow-hidden bg-[var(--bg-secondary)] shrink-0">
                  <ResilientImage
                    src={item.productImage}
                    alt={item.productName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[var(--text-primary)] truncate">
                    {item.productName}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] truncate">
                    {item.shopName} · Size {item.size} · {item.color}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 font-mono-tabular font-bold text-[var(--text-primary)]">
                Qty: {item.quantity}
              </div>
            </div>
          ))}
        </div>

        {/* DYNAMIC UPI QR CODE & PAY USING UPI APP (NO VISIBLE UPI ID ANYWHERE) */}
        <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-6 text-center space-y-4">
          <div className="inline-flex p-4 rounded-2xl bg-white border border-[var(--border-subtle)] shadow-xs">
            <QRCodeCanvas
              value={draft.upiUri}
              size={188}
              bgColor="#ffffff"
              fgColor="#1C1512"
              level="M"
            />
          </div>

          <div className="text-sm font-bold text-[var(--text-primary)]">
            Scan to Pay
          </div>

          <button
            type="button"
            onClick={handlePayUsingUpiApp}
            className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2.5 shadow-sm transition-colors"
          >
            <Smartphone className="w-4 h-4" />
            <span>PAY USING UPI APP</span>
          </button>
        </div>

        {/* RETURN TO DESI WARDROBE: UPLOAD PAYMENT SCREENSHOT */}
        <form
          onSubmit={handleSubmitForm}
          className="space-y-4 pt-3 border-t border-[var(--border-subtle)]"
        >
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[var(--text-secondary)]">
              Have you completed your payment?
            </div>
            <label className="block text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
              UPLOAD PAYMENT SCREENSHOT
            </label>
            <p className="text-xs text-[var(--text-muted)]">
              Supported formats: JPG, JPEG, PNG, WEBP
            </p>
          </div>

          {/* File Picker ONLY (no capture attribute) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            disabled={isBusy || stage === 'SUBMITTED'}
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-dashed border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-bold flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50 transition-opacity"
          >
            <ImageIcon className="w-4 h-4" />
            <span>
              {stage === 'COMPRESSING'
                ? 'COMPRESSING...'
                : compressedScreenshot
                  ? 'CHANGE PAYMENT SCREENSHOT'
                  : 'SELECT SCREENSHOT'}
            </span>
          </button>

          {/* Compressing State */}
          {stage === 'COMPRESSING' && (
            <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center gap-2.5 text-xs font-bold text-[var(--accent-primary)]">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>COMPRESSING...</span>
            </div>
          )}

          {/* Customer Screenshot Preview + Original Size & Compressed Size */}
          {compressedScreenshot && stage !== 'COMPRESSING' && (
            <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Payment Screenshot Preview
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-32 h-44 rounded-xl overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-subtle)] shrink-0 flex items-center justify-center">
                  <img
                    src={compressedScreenshot.dataUrl}
                    alt="Payment Screenshot Preview"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex-1 w-full space-y-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Original Size:</span>
                    <strong className="font-mono-tabular text-[var(--text-primary)]">
                      {formatByteSize(compressedScreenshot.originalSizeBytes)}
                    </strong>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Compressed Size:</span>
                    <strong className="font-mono-tabular text-[var(--status-success)]">
                      {compressedScreenshot.compressedSizeKB} KB
                    </strong>
                  </div>

                  <div className="text-[11px] text-[var(--status-success)] font-semibold flex items-center gap-1.5 pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Compressed &amp; ready to submit</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Upload / Saving Progress Banner */}
          {(stage === 'UPLOADING' || stage === 'SAVING_PAYMENT_RECORD') && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center gap-2.5 text-xs font-bold text-[var(--status-warning)]">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>
                {stage === 'UPLOADING' ? 'UPLOADING...' : 'SAVING PAYMENT RECORD...'}
              </span>
            </div>
          )}

          {/* Error & Retry State */}
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-3">
              <div className="text-xs font-bold text-[var(--status-danger)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>

              {hasError && compressedScreenshot && (
                <button
                  type="button"
                  onClick={() => void executeSubmission()}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>RETRY UPLOAD</span>
                </button>
              )}
            </div>
          )}

          {/* Submit Payment Proof Button */}
          <button
            type="submit"
            disabled={!compressedScreenshot || isBusy || stage === 'SUBMITTED'}
            className="w-full min-h-[54px] px-6 py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>
              {stage === 'COMPRESSING'
                ? 'COMPRESSING...'
                : stage === 'UPLOADING'
                  ? 'UPLOADING...'
                  : stage === 'SAVING_PAYMENT_RECORD'
                    ? 'SAVING PAYMENT RECORD...'
                    : stage === 'SUBMITTED'
                      ? 'SUBMITTED'
                      : 'SUBMIT PAYMENT PROOF'}
            </span>
          </button>
        </form>
      </div>

      {/* SECTION 14: SUCCESS POPUP AFTER BOTH STORAGE UPLOAD & FIRESTORE RECORD SUCCEED */}
      {submittedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 text-[var(--status-success)] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 rounded-xl bg-emerald-500/15 text-[var(--status-success)] text-xs font-bold uppercase tracking-wider">
                PAYMENT PROOF SUBMITTED
              </span>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                Your payment screenshot has been submitted successfully.
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Please wait for Admin verification.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onPaymentProofSubmitted(submittedResult)}
              className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-colors"
            >
              VIEW VERIFICATION STATUS
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
