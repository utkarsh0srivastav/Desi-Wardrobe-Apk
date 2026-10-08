import React, { useState, useRef } from 'react';
import {
  Phone,
  Lock,
  Store,
  MapPin,
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Navigation,
  Tag,
  Clock,
  RefreshCw,
} from 'lucide-react';
import {
  INDIAN_STATES,
  PricePolicy,
  Shop,
  ShopCategory,
  Shopkeeper,
} from '../../types/models';
import { authService } from '../../services/authService';
import { shopService } from '../../services/shopService';
import { shopkeeperService } from '../../services/shopkeeperService';
import { imageService } from '../../services/imageService';
import { locationService, LocationServiceError } from '../../services/locationService';
import { LocationMapPickerModal } from '../../components/LocationMapPickerModal';
import { ResilientImage } from '../../components/ResilientImage';

interface ShopkeeperAuthPageProps {
  onSuccess: (shopkeeper: Shopkeeper, shop: Shop) => void;
  onBackToEntry: () => void;
}

type AuthStep =
  | 'MOBILE_INPUT'
  | 'AWAITING_APPROVAL'
  | 'CREATE_NEW_PIN'
  | 'RETURNING_PIN'
  | 'SHOP_SETUP';

/**
 * DESI WARDROBE — Shopkeeper Verification, PIN Setup, Shop Profile & Returning Login
 *
 * Lifecycle:
 * 1. Admin Pre-Registers Mobile Number
 * 2. Shopkeeper enters Mobile -> VERIFY & LOGIN (marks VERIFIED, requests Admin approval)
 * 3. Admin Approves Shopkeeper
 * 4. Shopkeeper Creates Own 4-Digit PIN (hashed in Firestore)
 * 5. Shopkeeper Completes Shop Profile (Shop Name, Photo, Category, Price Policy, Location) -> ACTIVE
 * 6. Returning Login with Mobile + 4-Digit PIN
 */
export const ShopkeeperAuthPage: React.FC<ShopkeeperAuthPageProps> = ({
  onSuccess,
  onBackToEntry,
}) => {
  const [step, setStep] = useState<AuthStep>('MOBILE_INPUT');
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // First-time Shop Setup fields
  const [shopkeeperName, setShopkeeperName] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopMobile, setShopMobile] = useState('');
  const [category, setCategory] = useState<ShopCategory>('BOTH');
  const [pricePolicy, setPricePolicy] = useState<PricePolicy | null>(null);
  const [photo, setPhoto] = useState('');
  const [photoSizeKB, setPhotoSizeKB] = useState<number | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);

  // Location fields
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationName, setLocationName] = useState('');
  const [shopState, setShopState] = useState('');
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [autoLocateOnMapOpen, setAutoLocateOnMapOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationErrorMsg, setLocationErrorMsg] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleVerifyMobile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const result = await authService.verifyMobile(mobile);
      setMobile(result.mobile);
      setShopMobile(result.mobile);

      if (result.nextStep === 'REJECTED_BY_ADMIN') {
        setErrorMsg('Your shopkeeper registration request was rejected by Desi Wardrobe Admin.');
        return;
      }

      if (result.nextStep === 'AWAITING_ADMIN_APPROVAL') {
        setStep('AWAITING_APPROVAL');
        return;
      }

      if (result.nextStep === 'CREATE_NEW_PIN') {
        setStep('CREATE_NEW_PIN');
        return;
      }

      setStep('RETURNING_PIN');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to verify mobile number.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReturningLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const sk = authService.loginWithPin(mobile, pin);
      const shop = shopService.getShopById(sk.shopId) || shopService.getShopByShopkeeperId(sk.shopkeeperId);
      if (!shop || sk.profileStatus !== 'COMPLETED') {
        setShopkeeperName(sk.name || '');
        setShopMobile(sk.mobile);
        setStep('SHOP_SETUP');
        return;
      }
      onSuccess(sk, shop);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Login failed.');
    }
  };

  const handleCreatePinContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const updatedSk = await shopkeeperService.createShopkeeperPin(mobile, pin, confirmPin);
      const existingShop =
        shopService.getShopById(updatedSk.shopId) ||
        shopService.getShopByShopkeeperId(updatedSk.shopkeeperId);

      if (existingShop && updatedSk.profileStatus === 'COMPLETED') {
        onSuccess(updatedSk, existingShop);
      } else {
        setStep('SHOP_SETUP');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoFile = async (file: File | null | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setIsCompressingPhoto(true);
    try {
      const compressed = await imageService.compressImageFile(file, 'shops');
      setPhoto(compressed.optimizedDataUrl);
      setPhotoSizeKB(compressed.compressedSizeKB);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process photo.');
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setErrorMsg(null);
    setLocationErrorMsg(null);
    setIsLocating(true);
    try {
      const coords = await locationService.getCurrentLocation();
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      const readableAddress = await locationService.reverseGeocodeLocation(
        coords.latitude,
        coords.longitude
      );
      setLocationName(readableAddress);
      const detectedState = locationService.extractStateFromLocationText(readableAddress);
      if (detectedState) {
        setShopState(detectedState);
      }
    } catch (err) {
      if (err instanceof LocationServiceError) {
        setLocationErrorMsg(err.shopkeeperMessage);
      } else {
        setLocationErrorMsg(
          'Your current location could not be detected. Please check GPS/location services.'
        );
      }
    } finally {
      setIsLocating(false);
    }
  };

  const handleCompleteRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (latitude === null || longitude === null) {
      setErrorMsg(
        'Please set your Shop Location using "USE MY CURRENT LOCATION" or "SELECT LOCATION ON MAP".'
      );
      return;
    }

    if (!pricePolicy) {
      setErrorMsg(
        'Please select your Shop Price Policy (FIXED PRICE or BARGAINING AVAILABLE).'
      );
      return;
    }

    try {
      const { shopkeeper, shop } = shopService.registerShopkeeperAndShop({
        mobile,
        pin,
        shopkeeperName,
        shopName,
        shopMobile,
        photo,
        category,
        pricePolicy,
        latitude,
        longitude,
        locationName,
        state: shopState || locationService.extractStateFromLocationText(locationName),
        shopStatus: 'ACTIVE',
        profileStatus: 'COMPLETED',
      });
      onSuccess(shopkeeper, shop);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed.');
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-20 space-y-5">
      <button
        type="button"
        onClick={onBackToEntry}
        className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2 hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Home</span>
      </button>

      <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 shadow-sm space-y-6">
        {/* Header */}
        <div className="space-y-1.5">
          <span className="inline-block px-3 py-1 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-bold tracking-wide">
            SHOPKEEPER PORTAL
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
            {step === 'MOBILE_INPUT' && 'Shopkeeper Verification & Login'}
            {step === 'AWAITING_APPROVAL' && 'Awaiting Admin Approval'}
            {step === 'RETURNING_PIN' && 'Welcome Back, Shopkeeper'}
            {step === 'CREATE_NEW_PIN' && 'Create Your 4-Digit PIN'}
            {step === 'SHOP_SETUP' && 'Complete Your Shop Profile'}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            {step === 'MOBILE_INPUT' &&
              'Enter your Admin pre-registered 10-digit mobile number to verify or login.'}
            {step === 'AWAITING_APPROVAL' &&
              `Mobile +91 ${mobile} is verified and waiting for Desi Wardrobe Admin approval.`}
            {step === 'RETURNING_PIN' && `Enter your 4-digit PIN for +91 ${mobile}.`}
            {step === 'CREATE_NEW_PIN' &&
              `Your account (+91 ${mobile}) is approved! Set a 4-digit PIN to secure your shop.`}
            {step === 'SHOP_SETUP' &&
              'Fill in your shop details and GPS location so nearby customers within 100 KM can discover your store.'}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs font-medium text-[var(--status-danger)]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: MOBILE NUMBER INPUT */}
        {step === 'MOBILE_INPUT' && (
          <form onSubmit={handleVerifyMobile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Mobile Number <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Enter 10-digit mobile number"
                  className="w-full min-h-[48px] pl-10 pr-4 py-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-semibold text-sm transition-colors shadow-sm"
            >
              {isLoading ? 'VERIFYING...' : 'VERIFY & LOGIN'}
            </button>
          </form>
        )}

        {/* STEP 1B: AWAITING ADMIN APPROVAL */}
        {step === 'AWAITING_APPROVAL' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-[var(--status-warning)]">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Verification Request Sent to Admin</span>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Your mobile number (<strong className="font-mono-tabular">+91 {mobile}</strong>) has been verified (`verificationStatus = VERIFIED`, `approvalStatus = PENDING`). Once Desi Wardrobe Admin approves your request, tap <strong>CHECK APPROVAL STATUS</strong> below to create your PIN and set up your shop.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleVerifyMobile()}
                className="flex-1 min-h-[48px] px-4 py-2.5 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>CHECK APPROVAL STATUS</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('MOBILE_INPUT');
                  setErrorMsg(null);
                }}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] text-xs font-semibold text-[var(--text-primary)]"
              >
                Change Number
              </button>
            </div>
          </div>
        )}

        {/* STEP 2A: RETURNING SHOPKEEPER — ENTER PIN */}
        {step === 'RETURNING_PIN' && (
          <form onSubmit={handleReturningLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Enter 4-Digit PIN
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full min-h-[48px] pl-10 pr-4 py-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-lg tracking-widest text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep('MOBILE_INPUT');
                  setPin('');
                  setErrorMsg(null);
                }}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] text-xs font-semibold text-[var(--text-primary)]"
              >
                Change Mobile
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[48px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-colors"
              >
                LOGIN TO SHOP DASHBOARD
              </button>
            </div>
          </form>
        )}

        {/* STEP 2B: FIRST-TIME APPROVED SHOPKEEPER — CREATE NEW PIN */}
        {step === 'CREATE_NEW_PIN' && (
          <form onSubmit={handleCreatePinContinue} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                New PIN (4 digits) <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter 4-digit PIN"
                className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-base tracking-widest text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Confirm PIN (4 digits) <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Re-enter 4-digit PIN"
                className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-base tracking-widest text-[var(--text-primary)]"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep('MOBILE_INPUT');
                  setPin('');
                  setConfirmPin('');
                  setErrorMsg(null);
                }}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] text-xs font-semibold text-[var(--text-primary)]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 min-h-[48px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-colors"
              >
                {isLoading ? 'SAVING PIN...' : 'SAVE PIN & CONTINUE'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: COMPLETE SHOP PROFILE SETUP */}
        {step === 'SHOP_SETUP' && (
          <form onSubmit={handleCompleteRegistration} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Shopkeeper Name <span className="text-[var(--accent-primary)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={shopkeeperName}
                  onChange={(e) => setShopkeeperName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Shop Name <span className="text-[var(--accent-primary)]">*</span>
                </label>
                <div className="relative">
                  <Store className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="e.g. Royal Ethnic Wear"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Shop Mobile Number <span className="text-[var(--accent-primary)]">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  value={shopMobile}
                  onChange={(e) => setShopMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit shop phone"
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Shop Category <span className="text-[var(--accent-primary)]">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ShopCategory)}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                >
                  <option value="MEN">Men&apos;s Wear (MEN)</option>
                  <option value="WOMEN">Women&apos;s Wear (WOMEN)</option>
                  <option value="BOTH">Men &amp; Women (BOTH)</option>
                </select>
              </div>
            </div>

            {/* PRICE POLICY */}
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <label className="block text-xs font-semibold text-[var(--text-primary)]">
                PRICE POLICY <span className="text-[var(--accent-primary)]">*</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPricePolicy('FIXED_PRICE');
                    setErrorMsg(null);
                  }}
                  className={`min-h-[52px] px-4 py-3 rounded-2xl border-2 text-xs font-bold flex items-center justify-between gap-2 transition-all ${
                    pricePolicy === 'FIXED_PRICE'
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white shadow-sm'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Tag className="w-4 h-4 shrink-0" />
                    <span>FIXED PRICE</span>
                  </span>
                  {pricePolicy === 'FIXED_PRICE' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPricePolicy('BARGAINING_AVAILABLE');
                    setErrorMsg(null);
                  }}
                  className={`min-h-[52px] px-4 py-3 rounded-2xl border-2 text-xs font-bold flex items-center justify-between gap-2 transition-all ${
                    pricePolicy === 'BARGAINING_AVAILABLE'
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white shadow-sm'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Tag className="w-4 h-4 shrink-0" />
                    <span>BARGAINING AVAILABLE</span>
                  </span>
                  {pricePolicy === 'BARGAINING_AVAILABLE' && (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                </button>
              </div>
            </div>

            {/* Shop Photo Input */}
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <label className="block text-xs font-semibold text-[var(--text-primary)]">
                Shop Photo (Primary Photo) <span className="text-[var(--accent-primary)]">*</span>
              </label>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handlePhotoFile(e.target.files?.[0])}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoFile(e.target.files?.[0])}
                className="hidden"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-[48px] px-4 py-3 rounded-2xl border-2 border-dashed border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>TAKE PHOTO</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="min-h-[48px] px-4 py-3 rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <ImageIcon className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>CHOOSE FROM GALLERY</span>
                </button>
              </div>

              {isCompressingPhoto && (
                <p className="text-xs text-[var(--accent-primary)]">Compressing photo...</p>
              )}

              {photo && (
                <div className="flex items-center gap-4 p-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                  <div className="w-20 h-16 rounded-xl overflow-hidden bg-[var(--bg-secondary)] shrink-0">
                    <ResilientImage
                      src={photo}
                      alt="Shop preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold text-[var(--status-success)] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Primary Shop Photo Ready</span>
                    </div>
                    {photoSizeKB && (
                      <div className="text-[var(--text-muted)] font-mono-tabular">
                        Compressed size: ~{photoSizeKB} KB
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Shop Location Setup */}
            <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
              <label className="block text-xs font-semibold text-[var(--text-primary)]">
                Shop Location <span className="text-[var(--accent-primary)]">*</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-2 hover:border-[var(--accent-primary)] transition-colors"
                >
                  <Navigation className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>{isLocating ? 'DETECTING GPS...' : 'USE MY CURRENT LOCATION'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLocationErrorMsg(null);
                    setAutoLocateOnMapOpen(false);
                    setIsMapOpen(true);
                  }}
                  className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-2 hover:border-[var(--accent-primary)] transition-colors"
                >
                  <MapPin className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>SELECT LOCATION ON MAP</span>
                </button>
              </div>

              {locationErrorMsg && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5 text-xs">
                  <div className="flex items-start gap-2 font-semibold text-[var(--status-warning)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{locationErrorMsg}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={isLocating}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-xs"
                    >
                      {isLocating ? 'DETECTING...' : 'RETRY LOCATION'}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Shop Area / Landmark / City <span className="text-[var(--accent-primary)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={locationName}
                  onChange={(e) => {
                    setLocationName(e.target.value);
                    const detected = locationService.extractStateFromLocationText(e.target.value);
                    if (detected && !shopState) {
                      setShopState(detected);
                    }
                  }}
                  placeholder="e.g. Main Market, Near Bus Stand"
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  State (India)
                </label>
                <select
                  value={shopState}
                  onChange={(e) => setShopState(e.target.value)}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
                >
                  <option value="">Select State</option>
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {latitude !== null && longitude !== null && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--status-success)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Location Coordinates Pinned</span>
                  </span>
                  <span className="font-mono-tabular text-[var(--text-secondary)]">
                    {latitude.toFixed(5)}, {longitude.toFixed(5)}
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full min-h-[52px] px-6 py-3.5 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm shadow-md transition-colors"
            >
              COMPLETE SHOP REGISTRATION
            </button>
          </form>
        )}
      </div>

      {isMapOpen && (
        <LocationMapPickerModal
          initialLat={latitude}
          initialLng={longitude}
          initialLocationName={locationName}
          autoLocateOnOpen={autoLocateOnMapOpen}
          onConfirmLocation={(loc) => {
            setLatitude(loc.latitude);
            setLongitude(loc.longitude);
            setLocationName(loc.locationName);
            const detected = locationService.extractStateFromLocationText(loc.locationName);
            if (detected) {
              setShopState(detected);
            }
            setLocationErrorMsg(null);
            setIsMapOpen(false);
          }}
          onClose={() => setIsMapOpen(false)}
        />
      )}
    </div>
  );
};
