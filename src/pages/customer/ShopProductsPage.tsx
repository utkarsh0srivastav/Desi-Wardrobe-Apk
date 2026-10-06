import React, { useState } from 'react';
import {
  ArrowLeft,
  MapPin,
  Tag,
  Package,
  AlertCircle,
  CheckCircle2,
  Navigation,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { CustomerCoordinates, Product } from '../../types/models';
import { locationService } from '../../services/locationService';
import {
  CustomerPublicShop,
  formatPricePolicyLabel,
  formatShopCategoryLabel,
} from '../../utils/category';
import { getCurrentLanguage, translations } from '../../utils/i18n';
import { ResilientImage } from '../../components/ResilientImage';

interface ShopProductsPageProps {
  shop: CustomerPublicShop;
  products: Product[];
  customerCoords: CustomerCoordinates | null;
  onUpdateCustomerCoords: (coords: CustomerCoordinates) => void;
  onBack: () => void;
  onSelectProduct: (productId: string) => void;
}

export const ShopProductsPage: React.FC<ShopProductsPageProps> = ({
  shop,
  products,
  customerCoords,
  onUpdateCustomerCoords,
  onBack,
  onSelectProduct,
}) => {
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const lang = getCurrentLanguage();
  const t = translations[lang];

  const distanceKm =
    customerCoords &&
    typeof shop.latitude === 'number' &&
    typeof shop.longitude === 'number'
      ? locationService.calculateDistanceKm(
          customerCoords.latitude,
          customerCoords.longitude,
          shop.latitude,
          shop.longitude
        )
      : null;

  const handleGetDirections = async () => {
    setMapsError(null);
    setMapsLoading(true);
    try {
      let originCoords = customerCoords;
      if (!originCoords) {
        try {
          originCoords = await locationService.getCurrentLocation();
          onUpdateCustomerCoords(originCoords);
        } catch {
          originCoords = null;
        }
      }

      const url = locationService.getGoogleMapsDirectionsUrl(
        shop.latitude,
        shop.longitude,
        originCoords
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setMapsError('Unable to open Google Maps directions right now.');
    } finally {
      setMapsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-5 pb-20 space-y-6">
      {/* Back Navigation */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4 text-[var(--accent-primary)]" />
        <span>{t.backToShops}</span>
      </button>

      {/* Shop Header Banner — Strictly NO Shopkeeper mobile number */}
      <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden shadow-xs">
        <div className="relative h-52 sm:h-64 w-full bg-[var(--bg-secondary)]">
          <ResilientImage
            src={shop.photo}
            alt={shop.shopName}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block px-2.5 py-1 rounded-xl bg-white/15 backdrop-blur-xs text-white text-[11px] font-semibold">
                  {formatShopCategoryLabel(shop.category, lang)}
                </span>
                {distanceKm !== null && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600/90 backdrop-blur-xs text-white font-mono-tabular text-[11px] font-bold">
                    <Navigation className="w-3 h-3" />
                    {locationService.formatDistance(distanceKm)}
                  </span>
                )}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {shop.shopName}
              </h1>
            </div>
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide uppercase flex items-center gap-1.5 ${
                shop.pricePolicy === 'FIXED' || shop.pricePolicy === 'FIXED_PRICE'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              {formatPricePolicyLabel(shop.pricePolicy, lang)}
            </span>
          </div>
        </div>

        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-secondary)]/40 text-xs text-[var(--text-secondary)]">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
              <span>{shop.locationName}</span>
            </div>
            {shop.openingTime && shop.closingTime && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <span>
                  {shop.openingTime} – {shop.closingTime}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleGetDirections}
              disabled={mapsLoading}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-60"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{mapsLoading ? t.openingMaps : t.getDirections}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            {mapsError && (
              <span className="text-[11px] text-[var(--status-danger)] font-medium">
                {mapsError}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Product Listing */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
            {t.shopCollection}
          </h2>
          <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
            {products.length} {products.length === 1 ? 'Product' : 'Products'}
          </span>
        </div>

        {products.length === 0 ? (
          <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
              <Package className="w-6 h-6" />
            </div>
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
              No Products Listed Yet
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              This shop has not uploaded any products to its catalog yet. Please check back soon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {products.map((product) => {
              const outOfStock = product.quantity <= 0;
              return (
                <div
                  key={product.productId}
                  onClick={() => onSelectProduct(product.productId)}
                  className="cursor-pointer group rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
                >
                  {/* Product Image */}
                  <div className="relative h-56 w-full bg-[var(--bg-secondary)] overflow-hidden">
                    <ResilientImage
                      src={product.thumbnails?.[0] || product.images[0] || ''}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {/* Stock Badge */}
                    <div className="absolute top-3 left-3">
                      {outOfStock ? (
                        <span className="px-2.5 py-1 rounded-xl bg-red-600 text-white text-[11px] font-bold uppercase flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          OUT OF STOCK
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Available: {product.quantity}
                        </span>
                      )}
                    </div>

                    {/* Price Policy Badge */}
                    <div className="absolute top-3 right-3">
                      <span
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider ${
                          product.pricePolicy === 'FIXED' || product.pricePolicy === 'FIXED_PRICE'
                            ? 'bg-black/75 text-white'
                            : 'bg-amber-500 text-white'
                        }`}
                      >
                        {formatPricePolicyLabel(product.pricePolicy, lang)}
                      </span>
                    </div>
                  </div>

                  {/* Product Details */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1.5">
                      <h3 className="font-display text-lg font-bold text-[var(--text-primary)] line-clamp-1">
                        {product.name}
                      </h3>
                      <div className="font-mono-tabular text-lg font-bold text-[var(--accent-primary)]">
                        ₹{product.price.toLocaleString('en-IN')}
                      </div>

                      <div className="pt-1 space-y-1 text-[11px] text-[var(--text-secondary)]">
                        <div>
                          <span className="font-semibold text-[var(--text-primary)]">Sizes: </span>
                          {product.sizes.join(', ')}
                        </div>
                        <div>
                          <span className="font-semibold text-[var(--text-primary)]">Colors: </span>
                          {product.colors.join(', ')}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProduct(product.productId);
                      }}
                      className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-[var(--bg-primary)] group-hover:bg-[var(--accent-primary)] group-hover:text-white border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] transition-colors"
                    >
                      VIEW PRODUCT
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
