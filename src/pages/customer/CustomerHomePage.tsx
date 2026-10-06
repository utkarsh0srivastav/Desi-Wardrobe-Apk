import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Store,
  Search,
  Sparkles,
  Tag,
  Navigation,
  RefreshCw,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import {
  locationService,
  LocationServiceError,
  PublicShopWithDistance,
} from '../../services/locationService';
import { CustomerCoordinates } from '../../types/models';
import {
  CustomerCategoryFilter,
  formatPricePolicyLabel,
  formatShopCategoryLabel,
  matchesCustomerCategoryFilter,
} from '../../utils/category';
import { getCurrentLanguage, translations } from '../../utils/i18n';
import { ResilientImage } from '../../components/ResilientImage';

interface CustomerHomePageProps {
  shops: PublicShopWithDistance[];
  customerCoords: CustomerCoordinates | null;
  locationStatus: 'IDLE' | 'LOADING' | 'GRANTED' | 'UNAVAILABLE';
  locationError: LocationServiceError | null;
  onRetryLocation: () => void;
  onSelectShop: (shopId: string) => void;
}

export const CustomerHomePage: React.FC<CustomerHomePageProps> = ({
  shops,
  customerCoords,
  locationStatus,
  locationError,
  onRetryLocation,
  onSelectShop,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CustomerCategoryFilter>('ALL');
  const lang = getCurrentLanguage();
  const t = translations[lang];
  const locationLoading = locationStatus === 'LOADING';

  const filteredShops = useMemo(() => {
    return shops.filter((shop) => {
      const matchesCategory = matchesCustomerCategoryFilter(shop.category, selectedCategory);
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        shop.shopName.toLowerCase().includes(q) ||
        shop.locationName.toLowerCase().includes(q) ||
        formatShopCategoryLabel(shop.category, 'English').toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [shops, selectedCategory, searchQuery]);

  const categoryTabs: { id: CustomerCategoryFilter; label: string }[] =
    lang === 'Hindi'
      ? [
          { id: 'ALL', label: 'सभी दुकानें (All)' },
          { id: 'MEN', label: "पुरुष परिधान (Men's)" },
          { id: 'WOMEN', label: "महिला परिधान (Women's)" },
          { id: 'BOTH', label: 'दोनों (Men & Women)' },
        ]
      : [
          { id: 'ALL', label: 'All Shops' },
          { id: 'MEN', label: "Men's Wear" },
          { id: 'WOMEN', label: "Women's Wear" },
          { id: 'BOTH', label: 'Men & Women (Both)' },
        ];

  return (
    <div className="max-w-5xl mx-auto px-4 pt-5 pb-20 space-y-6">
      {/* Hero Banner */}
      <div className="relative rounded-3xl bg-gradient-to-br from-[#52151E] via-[#3A161A] to-[#1F0B0E] text-[#FAF5F0] p-6 sm:p-8 overflow-hidden shadow-lg border border-[#6E383E]/50">
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#D97706 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 backdrop-blur-xs text-amber-300 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.localFashionMarketplace}</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
            {t.tagline}
          </h1>
          <p className="text-xs sm:text-sm text-[#D9C3B8] max-w-xl leading-relaxed">
            {lang === 'Hindi'
              ? 'अपने 100 KM के दायरे में विश्वसनीय कपड़ों की दुकानें खोजें, कलेक्शन देखें और ₹75 प्रति यूनिट में ऑनलाइन बुक करें।'
              : 'Explore verified clothing shops within 100 KM of your location, browse Men’s & Women’s collections, and reserve items online for 48 hours.'}
          </p>

          {/* Location Status Bar */}
          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/30 border border-white/15 text-xs text-[#FAF5F0]">
              <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              {locationLoading ? (
                <span>Detecting your location...</span>
              ) : customerCoords ? (
                <span>
                  Showing shops within <strong>100 KM</strong> of your location
                </span>
              ) : (
                <span className="text-amber-200">
                  {locationError?.customerMessage ||
                    'Location access is currently blocked for this preview/browser.'}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onRetryLocation}
              disabled={locationLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${locationLoading ? 'animate-spin' : ''}`} />
              <span>{customerCoords ? 'Update Location' : 'RETRY LOCATION'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border-subtle)] shadow-xs space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              lang === 'Hindi'
                ? 'दुकान का नाम, पता या कैटेगरी खोजें...'
                : 'Search by shop name, location or category...'
            }
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {categoryTabs.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shops Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
            {customerCoords ? t.nearbyShopsWithin100Km : t.localClothingShops}
          </h2>
          <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
            {customerCoords
              ? `${filteredShops.length} ${filteredShops.length === 1 ? 'shop' : 'shops'} • ${t.sortedNearestFarthest}`
              : 'Location required'}
          </span>
        </div>

        {locationLoading ? (
          <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
              Detecting Your Location...
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Finding approved clothing shops within 100 KM of your real coordinates.
            </p>
          </div>
        ) : !customerCoords ? (
          <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-10 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                Location access is currently blocked for this preview/browser.
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                {locationError?.customerMessage ||
                  'Location access is currently blocked for this preview/browser.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onRetryLocation}
              className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold tracking-wide transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>RETRY LOCATION</span>
            </button>
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
              <Store className="w-6 h-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
              No Shops Found Within 100 KM
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              There are currently no approved shops matching your filter within 100 KM of your location.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredShops.map((shop) => (
              <div
                key={shop.shopId}
                className="group rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
              >
                {/* Shop Image Header */}
                <div className="relative h-48 w-full bg-[var(--bg-secondary)] overflow-hidden">
                  <ResilientImage
                    src={shop.photo}
                    alt={shop.shopName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  {/* Category Badge */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-1 rounded-xl bg-black/65 backdrop-blur-xs text-white text-[11px] font-semibold">
                      {formatShopCategoryLabel(shop.category, lang)}
                    </span>
                  </div>

                  {/* Distance Badge */}
                  {shop.distanceKm !== null && (
                    <div className="absolute top-3 right-3">
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-600/90 backdrop-blur-xs text-white font-mono-tabular text-[11px] font-bold flex items-center gap-1 shadow-xs">
                        <Navigation className="w-3 h-3" />
                        {locationService.formatDistance(shop.distanceKm)}
                      </span>
                    </div>
                  )}

                  {/* Price Policy Badge */}
                  <div className="absolute bottom-3 right-3">
                    <span
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold tracking-wide uppercase flex items-center gap-1 ${
                        shop.pricePolicy === 'FIXED' || shop.pricePolicy === 'FIXED_PRICE'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      <Tag className="w-3 h-3" />
                      {formatPricePolicyLabel(shop.pricePolicy, lang)}
                    </span>
                  </div>

                  <div className="absolute bottom-3 left-3 right-36">
                    <h3 className="font-display text-xl font-bold text-white truncate">
                      {shop.shopName}
                    </h3>
                  </div>
                </div>

                {/* Shop Info Body — Strictly NO Shopkeeper mobile number */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2 text-xs text-[var(--text-secondary)]">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{shop.locationName}</span>
                    </div>
                    {shop.openingTime && shop.closingTime && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                        <span>
                          {shop.openingTime} – {shop.closingTime}
                        </span>
                      </div>
                    )}
                    {shop.distanceKm !== null && (
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <Navigation className="w-4 h-4 shrink-0" />
                        <span>Distance: {locationService.formatDistance(shop.distanceKm)}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectShop(shop.shopId)}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold tracking-wider uppercase transition-colors"
                  >
                    {t.viewShop}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
