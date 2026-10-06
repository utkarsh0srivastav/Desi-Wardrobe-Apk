import React from 'react';
import {
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Clock,
  Store,
  Lock,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { getCurrentLanguage, translations } from '../utils/i18n';

interface EntryPageProps {
  onContinueAsCustomer: () => void;
  onOpenShopkeeperPortal: () => void;
  onOpenAdminPortal: () => void;
}

/**
  * DESI WARDROBE — Main Landing / Entry Screen
  *
  * Customer-first marketplace landing screen:
  * - Shows ONLY the customer-facing "EXPLORE LOCAL SHOPS" card prominently.
  * - Moves Shopkeeper & Admin access to a small, secondary footer section at the bottom.
  */
export const EntryPage: React.FC<EntryPageProps> = ({
  onContinueAsCustomer,
  onOpenShopkeeperPortal,
  onOpenAdminPortal,
}) => {
  const lang = getCurrentLanguage();
  const t = translations[lang];

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-16 min-h-[calc(100vh-9rem)] flex flex-col justify-between gap-10">
      <div className="space-y-6">
        {/* Brand Hero */}
        <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 text-center shadow-xs space-y-4">
          <div className="flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
              DESI WARDROBE
            </h1>
            <p className="text-sm font-medium text-[var(--accent-primary)]">
              {t.tagline}
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto pt-1 leading-relaxed">
              {lang === 'Hindi'
                ? 'आस-पास की कपड़ों की दुकानें खोजें, असली स्टोर इन्वेंटरी देखें और 48 घंटे के पिकअप के लिए कपड़े बुक करें।'
                : 'Discover nearby clothing shops, browse real store inventory, and reserve outfits for 48-hour in-store pickup.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="p-2.5 rounded-2xl bg-[var(--bg-secondary)]/70 text-center space-y-1">
              <MapPin className="w-4 h-4 text-[var(--accent-primary)] mx-auto" />
              <div className="text-[11px] font-semibold text-[var(--text-primary)]">Nearby Shops</div>
            </div>
            <div className="p-2.5 rounded-2xl bg-[var(--bg-secondary)]/70 text-center space-y-1">
              <Clock className="w-4 h-4 text-[var(--accent-primary)] mx-auto" />
              <div className="text-[11px] font-semibold text-[var(--text-primary)]">48h Hold</div>
            </div>
            <div className="p-2.5 rounded-2xl bg-[var(--bg-secondary)]/70 text-center space-y-1">
              <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)] mx-auto" />
              <div className="text-[11px] font-semibold text-[var(--text-primary)]">UPI Verified</div>
            </div>
          </div>
        </div>

        {/* Prominent Customer Entry Card */}
        <div className="rounded-3xl bg-[var(--bg-card)] border-2 border-[var(--accent-primary)]/30 hover:border-[var(--accent-primary)] p-6 sm:p-7 shadow-sm transition-all space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[10px] font-bold uppercase tracking-wider">
                {t.localFashionMarketplace}
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
                {t.exploreLocalShops}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {lang === 'Hindi'
                  ? 'आस-पास की कपड़ों की दुकानों से पुरुषों एवं महिलाओं (Men & Women) के फैशन कलेक्शन देखें, कार्ट में जोड़ें और इन-स्टोर पिकअप के लिए बुक करें।'
                  : "Browse Men's & Women's fashion collections from nearby clothing stores, add items to your cart, and book products for in-store pickup."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onContinueAsCustomer}
            className="w-full min-h-[54px] px-6 py-3.5 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] active:scale-[0.99] text-white text-sm font-bold flex items-center justify-between shadow-sm transition-all"
          >
            <span>{t.exploreLocalShopsBtn}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Small Secondary Footer Section for Shopkeepers & Admin */}
      <div className="pt-6 border-t border-[var(--border-subtle)]/70 text-center space-y-2">
        <p className="text-[11px] text-[var(--text-muted)]">Are you a Shopkeeper?</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={onOpenShopkeeperPortal}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-primary)] underline underline-offset-4 transition-colors py-1 px-2"
          >
            <Store className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>Shopkeeper Login / Register</span>
          </button>

          <span className="text-[var(--border-strong)]">·</span>

          <button
            type="button"
            onClick={onOpenAdminPortal}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors py-1 px-2"
          >
            <Lock className="w-3 h-3" />
            <span>Admin Portal</span>
          </button>
        </div>
      </div>
    </div>
  );
};
