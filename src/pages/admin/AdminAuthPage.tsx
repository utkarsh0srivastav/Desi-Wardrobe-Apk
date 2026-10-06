import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowLeft,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  Smartphone,
} from 'lucide-react';
import { adminService, UNAUTHORIZED_ADMIN_MESSAGE } from '../../services/adminService';
import { ActiveAdminSession, storage } from '../../utils/storage';

interface AdminAuthPageProps {
  onSuccess: (session: ActiveAdminSession) => void;
  onBackToEntry: () => void;
}

type AdminAuthStep =
  | 'TRUSTED_DEVICE_PIN'
  | 'GOOGLE_AUTH'
  | 'CREATE_PIN'
  | 'AUTHORIZE_DEVICE_PIN';

/**
 * DESI WARDROBE — Device-Trusted Admin Login
 *
 * 1. RETURNING LOGIN ON A TRUSTED ADMIN DEVICE:
 *    - Does NOT require Google Sign-In again.
 *    - Directly opens the Admin PIN screen (`[ Enter Admin PIN ]` + `[ VERIFY PIN & LOGIN ]`).
 *    - Verifies the Admin PIN + trusted device credential and opens Admin Dashboard.
 *
 * 2. FIRST-TIME ADMIN LOGIN ON A NEW / UNTRUSTED DEVICE:
 *    - Shows ONLY `[ SIGN IN WITH GOOGLE (ADMIN) ]` (never displays ADMIN_EMAIL in UI, no manual email input).
 *    - Compares authenticated Google account with backend `ADMIN_EMAIL`.
 *    - Continues to Admin PIN creation (first time) or Admin PIN verification (new device),
 *      securely registers the device as a TRUSTED ADMIN DEVICE, and opens Admin Dashboard.
 */
export const AdminAuthPage: React.FC<AdminAuthPageProps> = ({
  onSuccess,
  onBackToEntry,
}) => {
  const [isTrustedDevice, setIsTrustedDevice] = useState<boolean>(() =>
    adminService.isCurrentDeviceTrusted()
  );
  const [step, setStep] = useState<AdminAuthStep>(() =>
    adminService.isCurrentDeviceTrusted() ? 'TRUSTED_DEVICE_PIN' : 'GOOGLE_AUTH'
  );

  const [verifiedUid, setVerifiedUid] = useState<string>('admin_primary');
  const [verifiedEmail, setVerifiedEmail] = useState<string>('');

  const [pin, setPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Keep trusted-device detection reactive when Firestore snapshot arrives
  useEffect(() => {
    const syncTrustState = () => {
      const trusted = adminService.isCurrentDeviceTrusted();
      setIsTrustedDevice(trusted);
      setStep((prev) => {
        if (trusted && prev === 'GOOGLE_AUTH') {
          return 'TRUSTED_DEVICE_PIN';
        }
        if (!trusted && prev === 'TRUSTED_DEVICE_PIN') {
          return 'GOOGLE_AUTH';
        }
        return prev;
      });
    };

    syncTrustState();
    return storage.subscribe(syncTrustState);
  }, []);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await adminService.signInWithGoogleForAdmin();
      setVerifiedUid(res.uid);
      setVerifiedEmail(res.email);
      setPin('');
      setConfirmPin('');
      setStep(res.hasPinConfigured ? 'AUTHORIZE_DEVICE_PIN' : 'CREATE_PIN');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === UNAUTHORIZED_ADMIN_MESSAGE) {
        setErrorMsg(UNAUTHORIZED_ADMIN_MESSAGE);
      } else if (msg.includes('popup-closed-by-user')) {
        setErrorMsg('Google Sign-In was cancelled. Please try again.');
      } else {
        setErrorMsg(msg || 'Google authentication failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const session = await adminService.createAdminPin({
        uid: verifiedUid,
        email: verifiedEmail,
        pin,
        confirmPin,
      });
      onSuccess(session);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create Admin PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthorizeDevicePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const session = await adminService.authorizeNewDeviceWithPin({
        email: verifiedEmail,
        pin,
      });
      onSuccess(session);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid Admin PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrustedDevicePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const session = await adminService.loginOnTrustedDeviceWithPin(pin);
      onSuccess(session);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid Admin PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const trustedDeviceRecord = adminService.getTrustedDeviceRecordForCurrentDevice();

  return (
    <div className="max-w-md mx-auto px-4 pt-8 pb-20 space-y-5">
      <button
        type="button"
        onClick={onBackToEntry}
        className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2 hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Home</span>
      </button>

      <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
              {isTrustedDevice ? 'Trusted Admin Device' : 'Admin Security'}
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              Desi Wardrobe Admin
            </h1>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs font-semibold text-[var(--status-danger)] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* RETURNING LOGIN ON THE SAME TRUSTED DEVICE — PIN ONLY (NO GOOGLE SIGN-IN REQUIRED) */}
        {step === 'TRUSTED_DEVICE_PIN' && (
          <form onSubmit={handleTrustedDevicePinSubmit} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-2 text-xs text-[var(--status-success)] font-semibold">
              <span className="flex items-center gap-2 truncate">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  Trusted Device ({trustedDeviceRecord?.deviceLabel || 'Verified'})
                </span>
              </span>
              <span className="text-[10px] font-mono-tabular uppercase px-2 py-0.5 rounded-md bg-emerald-500/15">
                TRUSTED
              </span>
            </div>

            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                Enter Admin PIN
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                This device is recognized as a trusted Admin device. Enter your Admin PIN to open the Admin Dashboard.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Admin PIN
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 4–6 digit PIN"
                  className="w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-base tracking-widest text-[var(--text-primary)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors"
            >
              {isLoading ? 'VERIFYING PIN...' : 'VERIFY PIN & LOGIN'}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setPin('');
                  setStep('GOOGLE_AUTH');
                }}
                className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
              >
                Re-verify with Google Sign-In instead
              </button>
            </div>
          </form>
        )}

        {/* FIRST-TIME LOGIN ON A NEW / UNTRUSTED DEVICE */}
        {step === 'GOOGLE_AUTH' && (
          <div className="space-y-5">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              First-time login on this device requires Google administrator verification. Once verified, this device will be registered as a Trusted Admin Device so future logins only require your Admin PIN.
            </p>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleGoogleSignIn}
              className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2.5 shadow-sm transition-colors"
            >
              <Mail className="w-4 h-4" />
              <span>
                {isLoading ? 'AUTHENTICATING WITH GOOGLE...' : 'SIGN IN WITH GOOGLE (ADMIN)'}
              </span>
            </button>

            {isTrustedDevice && (
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setStep('TRUSTED_DEVICE_PIN');
                  }}
                  className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline"
                >
                  Back to Trusted Device PIN Login
                </button>
              </div>
            )}
          </div>
        )}

        {/* FIRST-TIME ADMIN PIN CREATION + DEVICE TRUST REGISTRATION */}
        {step === 'CREATE_PIN' && (
          <form onSubmit={handleCreatePinSubmit} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2.5 text-xs text-[var(--status-success)] font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Authorized Google Account Verified</span>
            </div>

            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                Create Admin PIN &amp; Trust Device
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Create your 4 to 6 digit Admin PIN. This device will be securely registered as a Trusted Admin Device so future logins only need your PIN.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Create Admin PIN (4–6 digits)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-base tracking-widest text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Confirm Admin PIN
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-base tracking-widest text-[var(--text-primary)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors"
            >
              {isLoading ? 'REGISTERING TRUSTED DEVICE...' : 'SAVE PIN & TRUST THIS DEVICE'}
            </button>
          </form>
        )}

        {/* NEW DEVICE AUTHORIZATION WHEN ADMIN PIN IS ALREADY CONFIGURED */}
        {step === 'AUTHORIZE_DEVICE_PIN' && (
          <form onSubmit={handleAuthorizeDevicePinSubmit} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-2 text-xs text-[var(--status-success)] font-semibold">
              <span className="flex items-center gap-2 truncate">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="truncate">Authorized Google Account Verified</span>
              </span>
            </div>

            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                Verify Admin PIN to Trust Device
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Enter your Admin PIN to register this device as a Trusted Admin Device and open the Admin Dashboard.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Admin PIN
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 4–6 digit PIN"
                  className="w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-base tracking-widest text-[var(--text-primary)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors"
            >
              {isLoading ? 'AUTHORIZING DEVICE...' : 'VERIFY PIN & LOGIN'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
