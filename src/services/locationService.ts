import { CustomerCoordinates, Shop } from '../types/models';
import { CustomerPublicShop, toCustomerPublicShop } from '../utils/category';
import { storage } from '../utils/storage';

/**
 * Centralized Location Service — DESI WARDROBE
 *
 * Handles:
 * - Permission state (granted, prompt, denied via navigator.permissions.query)
 * - Current position (navigator.geolocation.getCurrentPosition with high-accuracy + fallback)
 * - Continuous position updates (navigator.geolocation.watchPosition)
 * - Detailed location error classification (PERMISSION_DENIED, PREVIEW_BLOCKED, POSITION_UNAVAILABLE, TIMEOUT)
 * - Shop document validation (shopStatus == "ACTIVE", profileStatus == "COMPLETED", valid lat/lng, shopName, shopId)
 * - Haversine geographic distance calculation & 100 KM radius filter
 * - Nearest -> farthest sorting
 * - Native Android APK bridge support
 */

export const MAX_SHOP_DISCOVERY_RADIUS_KM = 100;

export type LocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'PREVIEW_BLOCKED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT';

export class LocationServiceError extends Error {
  public readonly code: LocationErrorCode;
  public readonly permissionState: 'granted' | 'denied' | 'prompt';
  public readonly customerMessage: string;
  public readonly shopkeeperMessage: string;

  constructor(params: {
    code: LocationErrorCode;
    permissionState: 'granted' | 'denied' | 'prompt';
    customerMessage: string;
    shopkeeperMessage: string;
  }) {
    super(params.customerMessage);
    this.name = 'LocationServiceError';
    this.code = params.code;
    this.permissionState = params.permissionState;
    this.customerMessage = params.customerMessage;
    this.shopkeeperMessage = params.shopkeeperMessage;
  }
}

export interface ShopWithDistance extends Shop {
  distanceKm: number | null;
}

export interface PublicShopWithDistance extends CustomerPublicShop {
  distanceKm: number | null;
}

export interface NativeAndroidLocationBridge {
  isNativeAndroid?: () => boolean;
  openAppLocationSettings?: () => void;
  checkLocationPermission?: () => 'granted' | 'denied' | 'prompt';
}

declare global {
  interface Window {
    AndroidLocationBridge?: NativeAndroidLocationBridge;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * PART 16 — SHOP DOCUMENT VALIDATION
 * Before displaying a shop, verify:
 * - shopStatus == "ACTIVE"
 * - profileStatus == "COMPLETED"
 * - latitude is a valid number
 * - longitude is a valid number
 * - shopName exists
 * - shopId exists
 * Do NOT show PRE_REGISTERED, PENDING, REJECTED, REMOVED, INCOMPLETE shops.
 */
export function isValidActiveCompletedShop(shop: Shop | null | undefined): shop is Shop {
  if (!shop) return false;
  if (typeof shop.shopId !== 'string' || !shop.shopId.trim()) return false;
  if (typeof shop.shopName !== 'string' || !shop.shopName.trim()) return false;
  if (shop.shopStatus !== 'ACTIVE') return false;
  if (shop.profileStatus !== 'COMPLETED') return false;
  if (!isValidCoordinate(shop.latitude, shop.longitude)) return false;
  return true;
}

function isIframePermissionsPolicyBlocked(rawMessage: string): boolean {
  const lower = rawMessage.toLowerCase();
  return (
    lower.includes('permissions policy') ||
    lower.includes('feature policy') ||
    lower.includes('disabled in this document') ||
    lower.includes('not allowed in this document')
  );
}

async function classifyGeolocationError(
  geoError: GeolocationPositionError | null
): Promise<LocationServiceError> {
  const permState = await locationService.queryPermissionState();
  const rawMsg = geoError?.message || '';
  const blockedMessage = 'Location access is currently blocked for this preview/browser.';

  if (isIframePermissionsPolicyBlocked(rawMsg)) {
    return new LocationServiceError({
      code: 'PREVIEW_BLOCKED',
      permissionState: 'denied',
      customerMessage: blockedMessage,
      shopkeeperMessage: blockedMessage,
    });
  }

  if (!geoError || geoError.code === 1 || permState === 'denied') {
    // PERMISSION_DENIED
    return new LocationServiceError({
      code: 'PERMISSION_DENIED',
      permissionState: 'denied',
      customerMessage: blockedMessage,
      shopkeeperMessage: blockedMessage,
    });
  }

  if (geoError.code === 2) {
    // POSITION_UNAVAILABLE
    return new LocationServiceError({
      code: 'POSITION_UNAVAILABLE',
      permissionState: permState,
      customerMessage:
        'Your current location could not be detected. Please check GPS/location services.',
      shopkeeperMessage:
        'Your current location could not be detected. Please check GPS/location services.',
    });
  }

  // TIMEOUT (code === 3)
  return new LocationServiceError({
    code: 'TIMEOUT',
    permissionState: permState,
    customerMessage: 'Location detection timed out. Please try again.',
    shopkeeperMessage: 'Location detection timed out. Please try again.',
  });
}

function requestSinglePosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export const locationService = {
  /**
   * Detects if the app is running inside a packaged native Android APK / WebView wrapper.
   */
  isNativeAndroidApp: (): boolean => {
    if (typeof window === 'undefined') return false;
    if (window.AndroidLocationBridge?.isNativeAndroid?.()) return true;
    if (
      window.Capacitor?.isNativePlatform?.() &&
      window.Capacitor?.getPlatform?.() === 'android'
    ) {
      return true;
    }
    return false;
  },

  /**
   * Opens the native Android Application Location/Permission Settings screen when packaged as an APK.
   */
  openNativeAppLocationSettings: (): void => {
    if (typeof window === 'undefined') return;
    if (window.AndroidLocationBridge?.openAppLocationSettings) {
      window.AndroidLocationBridge.openAppLocationSettings();
      return;
    }
    try {
      window.location.href =
        'intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;end';
    } catch {
      // No-op in standard browser
    }
  },

  /**
   * Uses the browser Permissions API where supported:
   * navigator.permissions.query({ name: "geolocation" })
   * Returns 'granted' | 'prompt' | 'denied'.
   */
  queryPermissionState: async (): Promise<'granted' | 'denied' | 'prompt'> => {
    if (typeof window !== 'undefined' && window.AndroidLocationBridge?.checkLocationPermission) {
      return window.AndroidLocationBridge.checkLocationPermission();
    }
    if (
      typeof navigator !== 'undefined' &&
      'permissions' in navigator &&
      navigator.permissions?.query
    ) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        return status.state;
      } catch {
        return 'prompt';
      }
    }
    return 'prompt';
  },

  /**
   * Subscribes to browser geolocation permission changes (granted / prompt / denied).
   */
  subscribeToPermissionChange: (
    onChange: (state: 'granted' | 'denied' | 'prompt') => void
  ): (() => void) => {
    let permissionStatus: PermissionStatus | null = null;
    let isCancelled = false;

    const handler = () => {
      if (!isCancelled && permissionStatus) {
        onChange(permissionStatus.state);
      }
    };

    if (
      typeof navigator !== 'undefined' &&
      'permissions' in navigator &&
      navigator.permissions?.query
    ) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (isCancelled) return;
          permissionStatus = status;
          permissionStatus.addEventListener('change', handler);
        })
        .catch(() => {
          // Ignore if Permissions API is not supported
        });
    }

    return () => {
      isCancelled = true;
      if (permissionStatus) {
        permissionStatus.removeEventListener('change', handler);
      }
    };
  },

  /**
   * Calculates exact Haversine great-circle distance in kilometers between two geographic coordinates.
   */
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth radius in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * Alias for calculateDistance returning kilometers.
   */
  calculateDistanceKm: (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    return locationService.calculateDistance(lat1, lon1, lat2, lon2);
  },

  /**
   * Formats distance for customer shop cards & headers:
   * - Under 1 km: "850 m away"
   * - 1 km or more: "2.4 km away"
   */
  formatDistance: (distanceKm: number | null): string => {
    if (distanceKm === null || isNaN(distanceKm) || distanceKm < 0) {
      return '';
    }
    if (distanceKm < 1) {
      const meters = Math.max(10, Math.round(distanceKm * 1000));
      return `${meters} m away`;
    }
    return `${distanceKm.toFixed(1)} km away`;
  },

  /**
   * Obtains the user's real current browser/device geolocation using navigator.geolocation.getCurrentPosition().
   * Never returns fake or hardcoded coordinates.
   */
  getCurrentLocation: async (): Promise<CustomerCoordinates> => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      throw new LocationServiceError({
        code: 'POSITION_UNAVAILABLE',
        permissionState: 'denied',
        customerMessage:
          'Your current location could not be detected. Please check GPS/location services.',
        shopkeeperMessage:
          'Your current location could not be detected. Please check GPS/location services.',
      });
    }

    const permState = await locationService.queryPermissionState();
    if (permState === 'denied') {
      throw new LocationServiceError({
        code: 'PERMISSION_DENIED',
        permissionState: 'denied',
        customerMessage: 'Location access is currently blocked for this preview/browser.',
        shopkeeperMessage: 'Location access is currently blocked for this preview/browser.',
      });
    }

    // For both 'granted' and 'prompt' states, invoke navigator.geolocation.getCurrentPosition()
    try {
      // First attempt: high accuracy GPS
      const pos = await requestSinglePosition({
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      });
      const coords: CustomerCoordinates = {
        latitude: Number(pos.coords.latitude.toFixed(6)),
        longitude: Number(pos.coords.longitude.toFixed(6)),
      };
      storage.saveCustomerCoordinates(coords);
      return coords;
    } catch (firstErr) {
      const geoErr = firstErr as GeolocationPositionError;
      // If user explicitly denied permission or iframe blocked it, do not retry
      if (geoErr && geoErr.code === 1) {
        throw await classifyGeolocationError(geoErr);
      }

      // Fallback attempt: standard browser geolocation (Wi-Fi/network triangulation when indoor GPS times out)
      try {
        const fallbackPos = await requestSinglePosition({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 15000,
        });
        const coords: CustomerCoordinates = {
          latitude: Number(fallbackPos.coords.latitude.toFixed(6)),
          longitude: Number(fallbackPos.coords.longitude.toFixed(6)),
        };
        storage.saveCustomerCoordinates(coords);
        return coords;
      } catch (secondErr) {
        throw await classifyGeolocationError(secondErr as GeolocationPositionError);
      }
    }
  },

  /**
   * Alias for getCurrentLocation().
   */
  requestCurrentLocation: (): Promise<CustomerCoordinates> => {
    return locationService.getCurrentLocation();
  },

  /**
   * Continuously watches the user's real device location via navigator.geolocation.watchPosition()
   * so that if the customer moves, distances and 100 KM filtering update automatically.
   */
  watchCurrentLocation: (
    onLocationUpdate: (coords: CustomerCoordinates) => void,
    onError?: (err: LocationServiceError) => void
  ): (() => void) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return () => {};
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords: CustomerCoordinates = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        };
        storage.saveCustomerCoordinates(coords);
        onLocationUpdate(coords);
      },
      async (geoError) => {
        if (onError) {
          const classified = await classifyGeolocationError(geoError);
          onError(classified);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  },

  /**
   * Reverse geocodes latitude/longitude into a human-readable locality/city name.
   */
  reverseGeocodeLocation: async (latitude: number, longitude: number): Promise<string> => {
    try {
      if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        const response = await geocoder.geocode({
          location: { lat: latitude, lng: longitude },
        });
        if (response.results && response.results.length > 0) {
          const formatted = response.results[0].formatted_address;
          if (formatted) return formatted;
        }
      }
    } catch {
      // Fallback to Nominatim reverse geocoding
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        latitude
      )}&lon=${encodeURIComponent(longitude)}&zoom=16&addressdetails=1`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'en-IN,en',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.display_name) {
          const parts = String(data.display_name)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          return parts.slice(0, 4).join(', ');
        }
      }
    } catch {
      // Ignore network errors
    }

    return `Lat ${latitude.toFixed(6)}, Lng ${longitude.toFixed(6)}`;
  },

  /**
   * Validates each shop (shopStatus == "ACTIVE", profileStatus == "COMPLETED", valid lat/lng, shopName, shopId)
   * and filters to shops within maxRadiusKm (default 100 KM) of the customer's real current location.
   */
  filterShopsWithinRadius: (
    shops: Shop[],
    customerCoords: CustomerCoordinates | null,
    maxRadiusKm: number = MAX_SHOP_DISCOVERY_RADIUS_KM
  ): ShopWithDistance[] => {
    if (!customerCoords || !isValidCoordinate(customerCoords.latitude, customerCoords.longitude)) {
      return [];
    }

    const validActiveShops = shops.filter(isValidActiveCompletedShop);
    const withinRadius: ShopWithDistance[] = [];

    for (const shop of validActiveShops) {
      const distKm = locationService.calculateDistance(
        customerCoords.latitude,
        customerCoords.longitude,
        shop.latitude,
        shop.longitude
      );

      if (distKm <= maxRadiusKm) {
        withinRadius.push({
          ...shop,
          distanceKm: distKm,
        });
      }
    }

    return withinRadius;
  },

  /**
   * Sorts shops from nearest to farthest based on calculated real distance.
   */
  sortShopsByDistance: (shops: ShopWithDistance[]): ShopWithDistance[] => {
    return [...shops].sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  },

  /**
   * Filters ACTIVE + COMPLETED shops within 100 KM of the customer's real location
   * and sorts them nearest -> farthest.
   */
  getShopsSortedByDistance: (
    shops: Shop[],
    customerCoords: CustomerCoordinates | null,
    maxRadiusKm: number = MAX_SHOP_DISCOVERY_RADIUS_KM
  ): ShopWithDistance[] => {
    const filtered = locationService.filterShopsWithinRadius(shops, customerCoords, maxRadiusKm);
    return locationService.sortShopsByDistance(filtered);
  },

  /**
   * Customer-safe version of getShopsSortedByDistance that strips Shopkeeper mobile
   * and personal contact details before passing to Customer UI components.
   */
  getPublicShopsSortedByDistance: (
    shops: Shop[],
    customerCoords: CustomerCoordinates | null,
    maxRadiusKm: number = MAX_SHOP_DISCOVERY_RADIUS_KM
  ): PublicShopWithDistance[] => {
    const sorted = locationService.getShopsSortedByDistance(shops, customerCoords, maxRadiusKm);
    return sorted.map((shopWithDist) => {
      const { distanceKm, ...shop } = shopWithDist;
      return {
        ...toCustomerPublicShop(shop),
        distanceKm,
      };
    });
  },

  /**
   * Generates a standard Google Maps directions URL using real customer coordinates
   * and the shop's saved latitude & longitude.
   */
  getGoogleMapsDirectionsUrl: (
    shopLat: number,
    shopLng: number,
    customerCoords?: CustomerCoordinates | null
  ): string => {
    const destination = `${shopLat},${shopLng}`;
    if (customerCoords && isValidCoordinate(customerCoords.latitude, customerCoords.longitude)) {
      const origin = `${customerCoords.latitude},${customerCoords.longitude}`;
      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  },
};
