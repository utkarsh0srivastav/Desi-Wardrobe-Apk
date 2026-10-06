import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Map,
  Marker,
  useMap,
  useMapsLibrary,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Check,
  X,
  Navigation,
  Search,
  Layers,
  Plus,
  Minus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { locationService, LocationServiceError } from '../services/locationService';

interface LocationMapPickerModalProps {
  initialLat?: number | null;
  initialLng?: number | null;
  initialLocationName?: string;
  title?: string;
  subtitle?: string;
  autoLocateOnOpen?: boolean;
  onConfirmLocation: (location: {
    latitude: number;
    longitude: number;
    locationName: string;
  }) => void;
  onClose: () => void;
}

// Geographic center of India for full-country initial view when no coordinates are set yet
const INDIA_DEFAULT_CENTER = { lat: 22.9734, lng: 78.6569 };
const INDIA_DEFAULT_ZOOM = 5;
const PINNED_LOCATION_ZOOM = 16;

function isQuotaError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  return (
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('429') ||
    msg.includes('QuotaExceeded')
  );
}

/**
 * Helper child component that imperatively pans/zooms the Google Map instance
 * when target coordinates or zoom change from search, geolocation, or zoom buttons.
 */
const MapCameraController: React.FC<{
  targetPosition: { lat: number; lng: number } | null;
  targetZoom: number | null;
  onCameraSynced: () => void;
}> = ({ targetPosition, targetZoom, onCameraSynced }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !targetPosition) return;
    map.panTo(targetPosition);
    if (targetZoom !== null) {
      map.setZoom(targetZoom);
    }
    onCameraSynced();
  }, [map, targetPosition, targetZoom, onCameraSynced]);

  return null;
};

/**
 * Real Interactive India-Wide Map Location Picker powered by Google Maps JavaScript API,
 * AdvancedMarkerElement (draggable), and Places API (New) AutocompleteSuggestion.
 */
export const LocationMapPickerModal: React.FC<LocationMapPickerModalProps> = ({
  initialLat = null,
  initialLng = null,
  initialLocationName = '',
  title = 'SET SHOP LOCATION',
  subtitle = 'Search any place in India, use your live GPS location, or tap/drag the pin on the map',
  autoLocateOnOpen = false,
  onConfirmLocation,
  onClose,
}) => {
  const hasInitialCoords =
    typeof initialLat === 'number' &&
    typeof initialLng === 'number' &&
    !Number.isNaN(initialLat) &&
    !Number.isNaN(initialLng);

  const [lat, setLat] = useState<number>(
    hasInitialCoords ? initialLat : INDIA_DEFAULT_CENTER.lat
  );
  const [lng, setLng] = useState<number>(
    hasInitialCoords ? initialLng : INDIA_DEFAULT_CENTER.lng
  );
  const [hasPlacedPin, setHasPlacedPin] = useState<boolean>(hasInitialCoords);
  const [locationName, setLocationName] = useState<string>(initialLocationName);
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'hybrid'>('roadmap');

  // Imperative camera target state
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number } | null>(
    hasInitialCoords ? { lat: initialLat, lng: initialLng } : null
  );
  const [cameraZoom, setCameraZoom] = useState<number | null>(
    hasInitialCoords ? PINNED_LOCATION_ZOOM : null
  );

  // Geolocation state
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Places API (New) Autocomplete state
  const placesLib = useMapsLibrary('places');
  const map = useMap();
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const resetAutocompleteSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
    setShowSuggestions(false);
  }, []);

  // Fetch Places API (New) Autocomplete suggestions across India
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!placesLib || trimmed.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        setIsSearching(true);
        const request: google.maps.places.AutocompleteRequest = {
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: ['in'],
        };

        const response =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        setSuggestions(response?.suggestions || []);
        setShowSuggestions(true);
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [placesLib, searchQuery]);

  // Select a place prediction from Places API (New)
  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!placesLib || !suggestion.placePrediction) return;
    setLocationError(null);

    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
      });

      const loc = place.location;
      if (loc) {
        const nextLat = Number(loc.lat().toFixed(6));
        const nextLng = Number(loc.lng().toFixed(6));
        setLat(nextLat);
        setLng(nextLng);
        setHasPlacedPin(true);
        setCameraTarget({ lat: nextLat, lng: nextLng });
        setCameraZoom(PINNED_LOCATION_ZOOM);

        const formattedLabel = [place.displayName, place.formattedAddress]
          .filter(Boolean)
          .join(', ');
        setLocationName(
          formattedLabel ||
            suggestion.placePrediction.text?.text ||
            `${nextLat.toFixed(4)}° N, ${nextLng.toFixed(4)}° E`
        );
        setSearchQuery(
          suggestion.placePrediction.text?.text || place.displayName || ''
        );
      }

      resetAutocompleteSession();
    } catch (err) {
      if (isQuotaError(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      } else {
        setLocationError('Could not load details for the selected place.');
      }
    }
  };

  // Option 1: Use My Current Location
  const handleUseCurrentLocation = useCallback(async () => {
    setLocationError(null);
    setIsLocating(true);
    try {
      const coords = await locationService.getCurrentLocation();
      const nextLat = Number(coords.latitude.toFixed(6));
      const nextLng = Number(coords.longitude.toFixed(6));
      setLat(nextLat);
      setLng(nextLng);
      setHasPlacedPin(true);
      setCameraTarget({ lat: nextLat, lng: nextLng });
      setCameraZoom(PINNED_LOCATION_ZOOM);
      const resolvedName = await locationService.reverseGeocodeLocation(nextLat, nextLng);
      setLocationName(resolvedName);
    } catch (err) {
      if (err instanceof LocationServiceError) {
        setLocationError(err.shopkeeperMessage);
      } else {
        setLocationError(
          'Your current location could not be detected. Please check GPS/location services.'
        );
      }
    } finally {
      setIsLocating(false);
    }
  }, []);

  useEffect(() => {
    if (autoLocateOnOpen) {
      handleUseCurrentLocation();
    }
  }, [autoLocateOnOpen, handleUseCurrentLocation]);

  // Option 2: Tap anywhere on map to place/move marker
  const handleMapClick = (event: MapMouseEvent) => {
    const clickedLatLng = event.detail.latLng;
    if (!clickedLatLng) return;
    setLocationError(null);
    const nextLat = Number(clickedLatLng.lat.toFixed(6));
    const nextLng = Number(clickedLatLng.lng.toFixed(6));
    setLat(nextLat);
    setLng(nextLng);
    setHasPlacedPin(true);
  };

  // Dragging the marker updates coordinates immediately
  const handleMarkerDragEnd = (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    setLocationError(null);
    const nextLat = Number(event.latLng.lat().toFixed(6));
    const nextLng = Number(event.latLng.lng().toFixed(6));
    setLat(nextLat);
    setLng(nextLng);
    setHasPlacedPin(true);
  };

  const handleZoomBy = (delta: number) => {
    if (!map) return;
    const currentZoom = map.getZoom() ?? INDIA_DEFAULT_ZOOM;
    map.setZoom(Math.max(3, Math.min(21, currentZoom + delta)));
  };

  const handleConfirm = () => {
    const finalName =
      locationName.trim() || `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
    onConfirmLocation({
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      locationName: finalName,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[95vh] rounded-t-3xl sm:rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map modal"
            className="min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Two Primary Options Bar: 1. USE MY CURRENT LOCATION & 2. SELECT/SEARCH LOCATION ON MAP */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            {/* Option 1: Use My Current Location */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="sm:col-span-5 min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-primary)]/40 hover:bg-[var(--accent-primary)] hover:text-white text-xs font-semibold text-[var(--accent-primary)] flex items-center justify-center gap-2 transition-colors"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Navigation className="w-4 h-4 shrink-0" />
              )}
              <span>
                {isLocating ? 'Detecting GPS...' : 'USE MY CURRENT LOCATION'}
              </span>
            </button>

            {/* Option 2: Search Any Place in India */}
            <div className="sm:col-span-7 relative">
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder="Search any town, market, road or city in India..."
                  className="w-full min-h-[46px] pl-10 pr-9 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Autocomplete Suggestions Dropdown */}
              {showSuggestions && (suggestions.length > 0 || isSearching) && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-xl max-h-56 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                  {isSearching && suggestions.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
                      <span>Searching locations across India...</span>
                    </div>
                  ) : (
                    suggestions.map((item, idx) => {
                      const prediction = item.placePrediction;
                      if (!prediction) return null;
                      return (
                        <button
                          key={prediction.placeId || idx}
                          type="button"
                          onClick={() => handleSelectSuggestion(item)}
                          className="w-full text-left px-4 py-2.5 hover:bg-[var(--bg-secondary)] transition-colors flex items-start gap-2.5"
                        >
                          <MapPin className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {prediction.mainText?.text || prediction.text?.text}
                            </p>
                            {prediction.secondaryText?.text && (
                              <p className="text-[11px] text-[var(--text-secondary)] truncate">
                                {prediction.secondaryText.text}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {locationError && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs font-medium text-[var(--status-danger)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{locationError}</span>
            </div>
          )}

          {/* Real Interactive Google Map Canvas (Explicit height required per CF2) */}
          <div className="relative w-full h-[320px] sm:h-[360px] rounded-2xl overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-secondary)]">
            <Map
              defaultCenter={
                hasInitialCoords
                  ? { lat: initialLat, lng: initialLng }
                  : INDIA_DEFAULT_CENTER
              }
              defaultZoom={
                hasInitialCoords ? PINNED_LOCATION_ZOOM : INDIA_DEFAULT_ZOOM
              }
              mapTypeId={mapTypeId}
              gestureHandling="greedy"
              disableDefaultUI={true}
              clickableIcons={false}
              onClick={handleMapClick}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapCameraController
                targetPosition={cameraTarget}
                targetZoom={cameraZoom}
                onCameraSynced={() => {
                  setCameraTarget(null);
                  setCameraZoom(null);
                }}
              />

              {/* Draggable Marker */}
              <Marker
                position={{ lat, lng }}
                draggable={true}
                onDragEnd={handleMarkerDragEnd}
                title="Drag to adjust exact shop location"
              />
            </Map>

            {/* Map Type Toggle (Roadmap / Satellite) */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setMapTypeId((prev) =>
                    prev === 'roadmap' ? 'hybrid' : 'roadmap'
                  )
                }
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--bg-card)]/95 backdrop-blur-xs border border-[var(--border-subtle)] shadow-md text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <Layers className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>{mapTypeId === 'roadmap' ? 'Satellite' : 'Map'}</span>
              </button>
            </div>

            {/* Custom Zoom In / Zoom Out Controls */}
            <div className="absolute top-3 right-3 z-10 flex flex-col rounded-xl bg-[var(--bg-card)]/95 backdrop-blur-xs border border-[var(--border-subtle)] shadow-md overflow-hidden">
              <button
                type="button"
                onClick={() => handleZoomBy(1)}
                aria-label="Zoom in"
                className="w-9 h-9 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleZoomBy(-1)}
                aria-label="Zoom out"
                className="w-9 h-9 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>

            {/* Live Selected Coordinates Overlay Pill */}
            <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-[var(--bg-card)]/95 backdrop-blur-xs border border-[var(--border-subtle)] shadow-md text-xs">
              <span className="font-medium text-[var(--text-secondary)]">
                {hasPlacedPin
                  ? 'Tap map or drag red pin to fine-tune'
                  : 'Tap anywhere on the map or drag pin'}
              </span>
              <div className="font-mono-tabular font-semibold text-[var(--text-primary)] flex items-center gap-3">
                <span>Latitude: {lat.toFixed(4)}</span>
                <span>Longitude: {lng.toFixed(4)}</span>
              </div>
            </div>
          </div>

          {/* Dynamic Latitude & Longitude Readout + Location Label Input */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Shop Area / Market / Address Label
              </label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. Main Market Road, Barhalganj or Hazratganj, Lucknow"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isNaN(val)) {
                    setLat(val);
                    setCameraTarget({ lat: val, lng });
                  }
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-xs text-[var(--text-primary)]"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                Longitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={lng}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isNaN(val)) {
                    setLng(val);
                    setCameraTarget({ lat, lng: val });
                  }
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-xs text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Primary Confirm Button: "CONFIRM THIS LOCATION" */}
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full min-h-[50px] px-6 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>CONFIRM THIS LOCATION</span>
          </button>
        </div>
      </div>
    </div>
  );
};
