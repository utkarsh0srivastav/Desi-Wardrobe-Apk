import React from 'react';
import {
  CheckCircle2,
  Clock,
  Store,
  MapPin,
  ShoppingBag,
  ClipboardList,
  Navigation,
  ExternalLink,
  Hourglass,
  XCircle,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { Booking } from '../../types/models';
import { shopService } from '../../services/shopService';
import { locationService } from '../../services/locationService';
import { ResilientImage } from '../../components/ResilientImage';

interface BookingConfirmationPageProps {
  bookings: Booking[];
  onRetryPayment?: (booking: Booking) => void;
  onViewMyOrders: () => void;
  onExploreMoreShops: () => void;
}

export const BookingConfirmationPage: React.FC<BookingConfirmationPageProps> = ({
  bookings,
  onViewMyOrders,
  onExploreMoreShops,
}) => {
  if (bookings.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">Booking details not found.</p>
        <button
          type="button"
          onClick={onExploreMoreShops}
          className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
        >
          Explore Local Shops
        </button>
      </div>
    );
  }

  const primary = bookings[0];
  const currentStatus = primary.bookingStatus || primary.status;

  const isSold = currentStatus === 'SOLD';
  const isNotSold = currentStatus === 'NOT_SOLD';
  const isExpired = currentStatus === 'EXPIRED';

  const isRejected =
    primary.paymentStatus === 'REJECTED' ||
    currentStatus === 'PAYMENT_REJECTED' ||
    currentStatus === 'CANCELLED';

  const isApproved =
    !isRejected &&
    (primary.paymentStatus === 'APPROVED' ||
      primary.paymentStatus === 'VERIFIED' ||
      currentStatus === 'CONFIRMED' ||
      currentStatus === 'BOOKED' ||
      isSold);

  const totalAdvancePaid = bookings.reduce(
    (sum, b) => sum + (b.paymentAmount || b.quantity * 75),
    0
  );

  const handleGetDirections = async (booking: Booking) => {
    const shop = shopService.getCustomerPublicShopById(booking.shopId);
    if (!shop) return;

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
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-5 pb-20 space-y-6">
      <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 text-center space-y-5 shadow-md">
        {/* Status Icon */}
        {isSold ? (
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-9 h-9" />
          </div>
        ) : isNotSold ? (
          <div className="w-16 h-16 rounded-3xl bg-red-500/15 text-[var(--status-danger)] flex items-center justify-center mx-auto">
            <XCircle className="w-9 h-9" />
          </div>
        ) : isExpired ? (
          <div className="w-16 h-16 rounded-3xl bg-stone-500/15 text-[var(--text-muted)] flex items-center justify-center mx-auto">
            <AlertCircle className="w-9 h-9" />
          </div>
        ) : isApproved ? (
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>
        ) : isRejected ? (
          <div className="w-16 h-16 rounded-3xl bg-red-500/15 text-[var(--status-danger)] flex items-center justify-center mx-auto">
            <XCircle className="w-9 h-9" />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-3xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Hourglass className="w-9 h-9 animate-pulse" />
          </div>
        )}

        {/* Headline */}
        <div className="space-y-1.5">
          <span
            className={`text-xs font-bold uppercase tracking-widest ${
              isSold || isApproved
                ? 'text-emerald-600 dark:text-emerald-400'
                : isRejected || isNotSold
                  ? 'text-[var(--status-danger)]'
                  : isExpired
                    ? 'text-[var(--text-muted)]'
                    : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {isSold
              ? 'ORDER COMPLETED'
              : isNotSold
                ? 'ORDER NOT COMPLETED'
                : isExpired
                  ? 'RESERVATION EXPIRED'
                  : isApproved
                    ? 'PAYMENT APPROVED'
                    : isRejected
                      ? 'PAYMENT REJECTED'
                      : 'PAYMENT UNDER VERIFICATION'}
          </span>

          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
            {isSold
              ? 'PRODUCT PURCHASED'
              : isNotSold
                ? 'BOOKING CANCELLED AT SHOP'
                : isExpired
                  ? 'BOOKING EXPIRED'
                  : isApproved
                    ? 'BOOKING CONFIRMED'
                    : isRejected
                      ? 'BOOKING CANCELLED'
                      : 'BOOKING PENDING CONFIRMATION'}
          </h1>

          <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            {isSold
              ? 'Thank you for shopping with Desi Wardrobe! This item has been purchased at the shop.'
              : isNotSold
                ? 'The shopkeeper marked this reservation as not completed.'
                : isExpired
                  ? 'The 48-hour shop pickup window for this booking has expired.'
                  : isApproved
                    ? 'Your payment has been approved and your booking is confirmed. Please visit the shop within 48 hours to complete your purchase.'
                    : isRejected
                      ? 'Your payment screenshot could not be verified by Admin. This booking has been cancelled.'
                      : 'Your payment screenshot has been submitted. Your booking will be confirmed once verified by Admin.'}
          </p>
        </div>

        {/* Booking ID Banner — shown when Approved or Sold */}
        {(isApproved || isSold) && /^DW-\d{8}-[A-Z0-9]{6}$/.test(primary.bookingId) && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 inline-block mx-auto">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Confirmed Booking ID
            </div>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-[var(--text-primary)] mt-0.5">
              Booking ID: {primary.bookingId}
            </div>
          </div>
        )}

        {/* Advance Payment Summary */}
        <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-between text-xs text-left">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[var(--accent-primary)] shrink-0" />
            <div>
              <div className="font-bold text-[var(--text-primary)]">
                Advance Booking Amount ({bookings.reduce((s, b) => s + b.quantity, 0)} units × ₹75)
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Status:{' '}
                <strong className="uppercase">
                  {isRejected
                    ? 'REJECTED (CANCELLED)'
                    : isApproved || isSold
                      ? 'APPROVED (CONFIRMED)'
                      : 'PENDING_VERIFICATION'}
                </strong>
              </div>
            </div>
          </div>
          <div className="font-mono-tabular text-lg font-bold text-[var(--accent-primary)]">
            ₹{totalAdvancePaid.toLocaleString('en-IN')}
          </div>
        </div>

        {/* 48-Hour Pickup Deadline & Confirmed Date Notice (Only for active confirmed bookings) */}
        {isApproved && !isSold && !isNotSold && !isExpired && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs font-semibold text-amber-700 dark:text-amber-300">
            {primary.confirmedAt && (
              <span>
                Confirmed Date:{' '}
                {new Date(primary.confirmedAt).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                Pickup Deadline (48 Hours):{' '}
                {new Date(primary.pickupDeadline).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
          </div>
        )}

        {/* Booked Items List — Strictly NO Shopkeeper mobile number */}
        <div className="text-left space-y-3 pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Booked Product Details ({bookings.length})
          </div>
          {bookings.map((booking) => (
            <div
              key={booking.bookingId}
              className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex flex-col sm:flex-row gap-4 text-xs"
            >
              <div className="w-20 h-24 rounded-xl overflow-hidden shrink-0 bg-[var(--bg-secondary)]">
                <ResilientImage
                  src={booking.productImage}
                  alt={booking.productName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-bold text-[var(--text-primary)]">
                    {booking.productName}
                  </span>
                  {(isApproved || isSold) &&
                    /^DW-\d{8}-[A-Z0-9]{6}$/.test(booking.bookingId) && (
                      <span className="font-mono-tabular text-[11px] font-bold px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)]">
                        {booking.bookingId}
                      </span>
                    )}
                </div>
                <div className="font-mono-tabular font-bold text-[var(--accent-primary)]">
                  Product Price: ₹{booking.price.toLocaleString('en-IN')} (Qty: {booking.quantity})
                </div>
                <div className="text-[var(--text-secondary)]">
                  Size: {booking.size} • Color: {booking.color}
                </div>
                <div className="pt-1 space-y-0.5 text-[var(--text-muted)]">
                  <div className="flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span className="font-semibold text-[var(--text-primary)]">
                      {booking.shopName}
                    </span>
                  </div>
                  {booking.shopLocationName && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      <span>{booking.shopLocationName}</span>
                    </div>
                  )}
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleGetDirections(booking)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--accent-primary)] text-[11px] font-bold uppercase tracking-wider transition-colors"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>GET DIRECTIONS</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Navigation Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
          <button
            type="button"
            onClick={onViewMyOrders}
            className="min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center justify-center gap-2 transition-colors"
          >
            <ClipboardList className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>VIEW MY ORDERS</span>
          </button>

          <button
            type="button"
            onClick={onExploreMoreShops}
            className="min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>CONTINUE SHOPPING</span>
          </button>
        </div>
      </div>
    </div>
  );
};
