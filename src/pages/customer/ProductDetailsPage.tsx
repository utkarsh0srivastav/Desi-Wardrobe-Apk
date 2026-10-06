import React, { useState } from 'react';
import {
  ArrowLeft,
  ShoppingCart,
  ShoppingBag,
  Store,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Tag,
  ShieldCheck,
  Navigation,
  ExternalLink,
} from 'lucide-react';
import { Product } from '../../types/models';
import { cartService } from '../../services/cartService';
import { locationService } from '../../services/locationService';
import {
  CustomerPublicShop,
  formatPricePolicyLabel,
  formatShopCategoryLabel,
} from '../../utils/category';
import { getCurrentLanguage, translations } from '../../utils/i18n';
import { ResilientImage } from '../../components/ResilientImage';

interface ProductDetailsPageProps {
  product: Product;
  shop: CustomerPublicShop;
  onBack: () => void;
  onCartUpdated: () => void;
  onOpenCart: () => void;
  onProceedToBooking: (selection: {
    productId: string;
    size: string;
    color: string;
    quantity: number;
  }) => void;
}

export const ProductDetailsPage: React.FC<ProductDetailsPageProps> = ({
  product,
  shop,
  onBack,
  onCartUpdated,
  onOpenCart,
  onProceedToBooking,
}) => {
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] || 'M');
  const [selectedColor, setSelectedColor] = useState(product.colors[0] || 'Black');
  const [quantity, setQuantity] = useState(1);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const lang = getCurrentLanguage();
  const t = translations[lang];

  const outOfStock = product.quantity <= 0;
  const maxQty = Math.max(1, product.quantity);

  const handleGetDirections = async () => {
    setMapsLoading(true);
    try {
      let originCoords = null;
      try {
        originCoords = await locationService.getCurrentLocation();
      } catch {
        originCoords = null;
      }
      const url = locationService.getGoogleMapsDirectionsUrl(
        shop.latitude,
        shop.longitude,
        originCoords
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setMapsLoading(false);
    }
  };

  const handleAdd = () => {
    if (outOfStock) return;
    cartService.addToCart({
      productId: product.productId,
      shopId: shop.shopId,
      size: selectedSize,
      color: selectedColor,
      quantity,
    });
    onCartUpdated();
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-5 pb-20 space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4 text-[var(--accent-primary)]" />
        <span>BACK TO {shop.shopName.toUpperCase()}</span>
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Product Image Gallery */}
        <div className="space-y-3">
          <div className="relative h-80 sm:h-96 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden">
            <ResilientImage
              src={product.images[selectedImageIdx] || product.images[0] || ''}
              alt={product.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-3 left-3">
              {outOfStock ? (
                <span className="px-3 py-1 rounded-xl bg-red-600 text-white text-xs font-bold uppercase flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  OUT OF STOCK
                </span>
              ) : (
                <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Available Stock: {product.quantity}
                </span>
              )}
            </div>
          </div>

          {product.images.length > 1 && (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImageIdx(idx)}
                  className={`w-16 h-16 rounded-2xl overflow-hidden border-2 shrink-0 transition-all ${
                    selectedImageIdx === idx
                      ? 'border-[var(--accent-primary)] scale-105'
                      : 'border-[var(--border-subtle)] opacity-70 hover:opacity-100'
                  }`}
                >
                  <ResilientImage
                    src={product.thumbnails?.[idx] || img}
                    alt={`${product.name} thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Configuration & Actions */}
        <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  product.pricePolicy === 'FIXED' || product.pricePolicy === 'FIXED_PRICE'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                {formatPricePolicyLabel(product.pricePolicy, lang)}
              </span>

              <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                {formatShopCategoryLabel(shop.category, lang)}
              </span>
            </div>

            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                {product.name}
              </h1>
              <div className="mt-2 font-mono-tabular text-2xl sm:text-3xl font-bold text-[var(--accent-primary)]">
                ₹{product.price.toLocaleString('en-IN')}
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {product.description}
            </p>

            {/* Size Selection */}
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Select Size
              </label>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedSize === size
                        ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                        : 'bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Select Color
              </label>
              <div className="flex flex-wrap gap-2">
                {product.colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedColor === color
                        ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                        : 'bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity Selection */}
            {!outOfStock && (
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Quantity (Max {maxQty})
                </label>
                <div className="inline-flex items-center rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-1">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg font-bold text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                  >
                    -
                  </button>
                  <span className="w-12 text-center font-mono-tabular text-sm font-bold text-[var(--text-primary)]">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                    className="w-9 h-9 rounded-lg font-bold text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Shop Details Box — Strictly NO Shopkeeper mobile number */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                <Store className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>{shop.shopName}</span>
              </div>
              <div className="flex items-start gap-2 text-[var(--text-secondary)]">
                <MapPin className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                <span>{shop.locationName}</span>
              </div>
              <button
                type="button"
                onClick={handleGetDirections}
                disabled={mapsLoading}
                className="w-full min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--accent-primary)] font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>{mapsLoading ? t.openingMaps : t.getDirections}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 space-y-3">
            {outOfStock ? (
              <div className="w-full min-h-[48px] rounded-2xl bg-red-500/15 border border-red-500/30 text-[var(--status-danger)] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>Currently Out of Stock</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={addedFeedback ? onOpenCart : handleAdd}
                  className="min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--accent-primary)] text-[var(--accent-primary)] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{addedFeedback ? 'ADDED • VIEW CART' : 'ADD TO CART'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onProceedToBooking({
                      productId: product.productId,
                      size: selectedSize,
                      color: selectedColor,
                      quantity,
                    })
                  }
                  className="min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>BOOK NOW</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)] text-center">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
              <span>Reserved for 48 hours after booking • Pay at shop during pickup</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
