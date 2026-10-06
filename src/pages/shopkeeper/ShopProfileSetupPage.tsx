import React, { useState, useRef } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Navigation,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Tag,
  RefreshCw,
} from 'lucide-react';
import { PricePolicy, Shop, ShopCategory } from '../../types/models';
import { normalizeShopCategory } from '../../utils/category';
import { shopService } from '../../services/shopService';
import { imageService } from '../../services/imageService';
import { locationService, LocationServiceError } from '../../services/locationService';
import { LocationMapPickerModal } from '../../components/LocationMapPickerModal';
import { ResilientImage } from '../../components/ResilientImage';

interface ShopProfileSetupPageProps {
  shop: Shop;
  onSaved: (updatedShop: Shop) => void;
  onCancel: () => void;
}

export const ShopProfileSetupPage: React.FC<ShopProfileSetupPageProps> = ({
  shop,
  onSaved,
  onCancel,
}) => {
  const [shopkeeperName, setShopkeeperName] = useState(shop.shopkeeperName);
  const [shopName, setShopName] = useState(shop.shopName);
  const [mobile, setMobile] = useState(shop.mobile);
  const [photo, setPhoto] = useState(shop.photo);
  const [category, setCategory] = useState<ShopCategory>(normalizeShopCategory(shop.category));
  const [pricePolicy, setPricePolicy] = useState<'FIXED_PRICE' | 'BARGAINING_AVAILABLE'>(
    shop.pricePolicy === 'BARGAINING_AVAILABLE' ? 'BARGAINING_AVAILABLE' : 'FIXED_PRICE'
  );
  const [latitude, setLatitude] = useState<number>(shop.latitude);
  const [longitude, setLongitude] = useState<number>(shop.longitude);
  const [locationName, setLocationName] = useState(shop.locationName);

  const [isMapOpen, setIsMapOpen] = useState(false);
  const [autoLocateOnMapOpen, setAutoLocateOnMapOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationErrorMsg, setLocationErrorMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = async (file: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    try {
      const compressed = await imageService.compressImageFile(file, 'shops');
      setPhoto(compressed.optimizedDataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to compress photo.');
    }
  };

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    setLocationErrorMsg(null);
    setErrorMsg(null);
    try {
      const coords = await locationService.getCurrentLocation();
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      const resolvedName = await locationService.reverseGeocodeLocation(
        coords.latitude,
        coords.longitude
      );
      setLocationName(resolvedName);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const updated = shopService.updateShopProfile(shop.shopId, {
        shopkeeperName,
        shopName,
        mobile,
        photo,
        category,
        pricePolicy: pricePolicy as PricePolicy,
        latitude,
        longitude,
        locationName,
        shopStatus: shop.shopStatus || 'ACTIVE',
        profileStatus: 'COMPLETED',
      });
      onSaved(updated);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update shop profile.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 space-y-5 shadow-xs"
    >
      <div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
          Shop Profile
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Update your shop details, storefront photo, and official map pin.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs font-semibold text-[var(--status-danger)] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
            Shopkeeper Name
          </label>
          <input
            type="text"
            required
            value={shopkeeperName}
            onChange={(e) => setShopkeeperName(e.target.value)}
            className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
            Shop Name
          </label>
          <input
            type="text"
            required
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
            Shop Mobile Number
          </label>
          <input
            type="tel"
            required
            maxLength={10}
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm text-[var(--text-primary)]"
          />
        </div>
      </div>

      {/* Shop Photo */}
      <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
        <label className="block text-xs font-semibold text-[var(--text-primary)]">
          Primary Shop Photo
        </label>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
          className="hidden"
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
          className="hidden"
        />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-32 h-24 rounded-2xl overflow-hidden bg-[var(--bg-secondary)] shrink-0">
            <ResilientImage src={photo} alt={shopName} className="w-full h-full object-cover" />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-semibold flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>Take Photo</span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-semibold flex items-center gap-2"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Choose from Gallery</span>
            </button>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
        <label className="block text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Set Shop Location
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-strong)] hover:border-[var(--accent-primary)] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            <Navigation className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{isLocating ? 'GETTING GPS...' : 'USE MY CURRENT LOCATION'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLocationErrorMsg(null);
              setAutoLocateOnMapOpen(false);
              setIsMapOpen(true);
            }}
            className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            <span>SELECT LOCATION ON MAP</span>
          </button>
        </div>

        {locationErrorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-2.5 text-xs text-[var(--status-danger)]">
            <div className="flex items-start gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{locationErrorMsg}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-6">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--accent-primary)] text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>RETRY LOCATION</span>
              </button>
            </div>
          </div>
        )}

        <input
          type="text"
          required
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
        />
        <div className="p-3.5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-sans font-semibold text-[var(--status-success)] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>Selected Shop Coordinates</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setAutoLocateOnMapOpen(false);
                setIsMapOpen(true);
              }}
              className="text-[11px] font-bold text-[var(--accent-primary)] hover:underline"
            >
              View / Adjust Pin on Map
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono-tabular font-semibold text-[var(--text-primary)]">
            <span>Latitude: {latitude.toFixed(6)}</span>
            <span>Longitude: {longitude.toFixed(6)}</span>
          </div>
        </div>
      </div>

      {/* Category */}
      <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
        <label className="block text-xs font-semibold text-[var(--text-primary)]">
          Shop Category
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              { id: 'MEN', label: "Men's Wear" },
              { id: 'WOMEN', label: "Women's Wear" },
              { id: 'BOTH', label: 'Men & Women (Both)' },
            ] as { id: ShopCategory; label: string }[]
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`min-h-[46px] px-3 py-2 rounded-2xl border text-xs font-semibold ${
                normalizeShopCategory(category) === cat.id
                  ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                  : 'bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-primary)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* PRICE POLICY * ([ FIXED PRICE ] | [ BARGAINING AVAILABLE ]) */}
      <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
          PRICE POLICY <span className="text-[var(--accent-primary)]">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPricePolicy('FIXED_PRICE')}
            className={`min-h-[52px] px-4 py-3 rounded-2xl border-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              pricePolicy === 'FIXED_PRICE'
                ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white shadow-md'
                : 'bg-[var(--bg-primary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-primary)]'
            }`}
          >
            <Tag className="w-4 h-4 shrink-0" />
            <span>FIXED PRICE</span>
          </button>

          <button
            type="button"
            onClick={() => setPricePolicy('BARGAINING_AVAILABLE')}
            className={`min-h-[52px] px-4 py-3 rounded-2xl border-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              pricePolicy === 'BARGAINING_AVAILABLE'
                ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white shadow-md'
                : 'bg-[var(--bg-primary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-primary)]'
            }`}
          >
            <Tag className="w-4 h-4 shrink-0" />
            <span>BARGAINING AVAILABLE</span>
          </button>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] px-5 py-2.5 rounded-2xl border border-[var(--border-subtle)] text-xs font-semibold"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 min-h-[48px] px-6 py-2.5 rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-semibold flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Save Shop Profile</span>
        </button>
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
            setLocationErrorMsg(null);
            setIsMapOpen(false);
          }}
          onClose={() => setIsMapOpen(false)}
        />
      )}
    </form>
  );
};
