import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ClipboardList,
  Clock,
  Store,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Navigation,
  ExternalLink,
  ShieldCheck,
  Hourglass,
  ShoppingBag,
  Lock,
  UserCheck,
} from 'lucide-react';
import { Booking, Customer } from '../../types/models';
import { bookingService } from '../../services/bookingService';
import { shopService } from '../../services/shopService';
import { locationService } from '../../services/locationService';
import { ResilientImage } from '../../components/ResilientImage';

interface CustomerOrdersPageProps {
  loggedInCustomer: Customer | null;
  onRequestCustomerLogin: () => void;
  onRetryPayment?: (booking: Booking) => void;
  onBackToShops: () => void;
}

export const CustomerOrdersPage: React.FC<CustomerOrdersPageProps> = ({
  loggedInCustomer,
  onRequestCustomerLogin,
  onBackToShops,
}) => {
  const [orders, setOrders] = useState<Booking[]>([]);

  const authenticatedCustomerId = loggedInCustomer?.customerId || null;

  useEffect(() => {
    // Strictly clear and block order loading when Customer is not logged in
    if (!authenticatedCustomerId) {
      setOrders([]);
      return;
    }

    // Initialize with cached orders strictly belonging to this authenticated customerId
    setOrders(
      bookingService
        .getBookingsByCustomer(authenticatedCustomerId)
        .filter((b) => b.customerId === authenticatedCustomerId)
    );

    // Real-time Firestore subscription scoped strictly to customerId
    const unsubscribe = bookingService.subscribeToCustomerBookings(
      authenticatedCustomerId,
      (customerBookings) => {
        setOrders(customerBookings.filter((b) => b.customerId === authenticatedCustomerId));
      }
    );

    return () => {
      unsubscribe();
    };
  }, [authenticatedCustomerId]);

  const handleOpenDirections = async (order: Booking) => {
    const shop = shopService.getCustomerPublicShopById(order.shopId);
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

  const renderStatusBadge = (order: Booking) => {
    const currentStatus = order.bookingStatus || order.status;

    // 1. Completed / Sold at shop
    if (currentStatus === 'SOLD') {
      return (
        <span className="px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase flex items-center gap-1.5">
          <ShoppingBag className="w-3.5 h-3.5" />
          PRODUCT PURCHASED • ORDER COMPLETED
        </span>
      );
    }

    // 2. Marked Not Sold by Shopkeeper
    if (currentStatus === 'NOT_SOLD') {
      return (
        <span className="px-3 py-1 rounded-xl bg-red-500/15 text-[var(--status-danger)] text-xs font-bold uppercase flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5" />
          ORDER NOT COMPLETED
        </span>
      );
    }

    // 3. Expired after 48-hour reservation window
    if (currentStatus === 'EXPIRED') {
      return (
        <span className="px-3 py-1 rounded-xl bg-stone-500/15 text-[var(--text-muted)] text-xs font-bold uppercase flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          BOOKING EXPIRED
        </span>
      );
    }

    // 4. Rejected payment / Cancelled booking
    if (
      order.paymentStatus === 'REJECTED' ||
      currentStatus === 'PAYMENT_REJECTED' ||
      currentStatus === 'CANCELLED'
    ) {
      return (
        <span className="px-3 py-1 rounded-xl bg-red-500/15 text-[var(--status-danger)] text-xs font-bold uppercase flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5" />
          PAYMENT REJECTED • BOOKING CANCELLED
        </span>
      );
    }

    // 5. Pending Admin Payment Verification
    if (
      order.paymentStatus === 'PENDING_VERIFICATION' ||
      currentStatus === 'PAYMENT_PENDING'
    ) {
      return (
        <span className="px-3 py-1 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase flex items-center gap-1.5">
          <Hourglass className="w-3.5 h-3.5" />
          PAYMENT UNDER VERIFICATION
        </span>
      );
    }

    // 6. Approved & Active Confirmed Booking
    return (
      <span className="px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" />
        PAYMENT VERIFIED • BOOKING SUCCESSFUL
      </span>
    );
  };

  // STRICT AUTHENTICATION GATE: Never display or load any orders when Customer is not logged in
  if (!loggedInCustomer || !authenticatedCustomerId) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-5 pb-20 space-y-6">
        <button
          type="button"
          onClick={onBackToShops}
          className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--accent-primary)]" />
          <span>BACK TO SHOPS</span>
        </button>

        <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-10 sm:p-12 text-center space-y-5 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              Please login to view your orders.
            </h1>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
              Sign in with your registered mobile number and 4-digit PIN to securely access your personal bookings and order history.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onRequestCustomerLogin}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-7 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-colors"
            >
              <UserCheck className="w-4 h-4" />
              <span>LOGIN / REGISTER</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const scopedOrders = orders.filter((o) => o.customerId === authenticatedCustomerId);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-5 pb-20 space-y-6">
      <button
        type="button"
        onClick={onBackToShops}
        className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4 text-[var(--accent-primary)]" />
        <span>BACK TO SHOPS</span>
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
            My Bookings &amp; Orders
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Track your payment verification status, 48-hour shop pickup window, and completed purchases
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] self-start sm:self-auto">
          <UserCheck className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span className="font-semibold text-[var(--text-primary)]">{loggedInCustomer.name}</span>
        </div>
      </div>

      {/* Scoped Orders List for Authenticated Customer */}
      {scopedOrders.length === 0 ? (
        <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
            <ClipboardList className="w-7 h-7" />
          </div>
          <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
            No Bookings Found
          </h2>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
            You have not placed any product bookings yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {scopedOrders.map((order) => {
            const currentStatus = order.bookingStatus || order.status;
            const isRejected =
              order.paymentStatus === 'REJECTED' ||
              currentStatus === 'PAYMENT_REJECTED' ||
              currentStatus === 'CANCELLED';
            const isSold = currentStatus === 'SOLD';
            const isNotSold = currentStatus === 'NOT_SOLD';
            const isExpired = currentStatus === 'EXPIRED';
            const isPendingVerification =
              !isRejected &&
              !isSold &&
              !isNotSold &&
              !isExpired &&
              (order.paymentStatus === 'PENDING_VERIFICATION' ||
                currentStatus === 'PAYMENT_PENDING');
            const isConfirmedActive =
              !isRejected &&
              !isSold &&
              !isNotSold &&
              !isExpired &&
              !isPendingVerification;

            const hasFinalBookingId = /^DW-\d{8}-[A-Z0-9]{6}$/.test(order.bookingId);

            return (
              <div
                key={order.bookingId}
                className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 space-y-4 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    {(isConfirmedActive || isSold) && hasFinalBookingId ? (
                      <span className="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                        Booking ID: {order.bookingId}
                      </span>
                    ) : isRejected ? (
                      <span className="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--status-danger)]">
                        BOOKING CANCELLED
                      </span>
                    ) : isNotSold ? (
                      <span className="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--status-danger)]">
                        NOT COMPLETED
                      </span>
                    ) : isExpired ? (
                      <span className="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded-lg bg-stone-500/10 border border-stone-500/30 text-[var(--text-muted)]">
                        BOOKING EXPIRED
                      </span>
                    ) : (
                      <span className="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                        BOOKING PENDING CONFIRMATION
                      </span>
                    )}
                    <span className="text-xs text-[var(--text-muted)]">
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  {renderStatusBadge(order)}
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-20 h-24 rounded-2xl overflow-hidden shrink-0 bg-[var(--bg-secondary)]">
                    <ResilientImage
                      src={order.productImage}
                      alt={order.productName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5 text-xs">
                    <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                      {order.productName}
                    </h3>
                    <div className="font-mono-tabular text-base font-bold text-[var(--accent-primary)]">
                      ₹{order.price.toLocaleString('en-IN')}{' '}
                      <span className="text-xs font-normal text-[var(--text-muted)]">
                        (Qty: {order.quantity} • Size: {order.size} • Color: {order.color})
                      </span>
                    </div>

                    {order.paymentAmount && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] font-mono-tabular text-[11px] font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Advance Booking Paid: ₹{order.paymentAmount}</span>
                      </div>
                    )}

                    {/* Strictly NO Shopkeeper mobile number displayed here */}
                    <div className="pt-1 space-y-1 text-[var(--text-secondary)]">
                      <div className="flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        <span className="font-semibold text-[var(--text-primary)]">
                          {order.shopName}
                        </span>
                      </div>
                      {order.shopLocationName && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span>{order.shopLocationName}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => handleOpenDirections(order)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--accent-primary)] text-[11px] font-bold uppercase tracking-wider transition-colors"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>GET DIRECTIONS</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status Specific Footer */}
                {isSold && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Product Purchased at Shop — Order Completed
                        {hasFinalBookingId ? ` (Booking ID: ${order.bookingId})` : ''}
                      </span>
                    </div>
                  </div>
                )}

                {isNotSold && (
                  <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-xs text-[var(--status-danger)] font-semibold">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>
                      This booking was marked as not completed at the shop. Reserved stock has been restored.
                    </span>
                  </div>
                )}

                {isExpired && (
                  <div className="p-3 rounded-2xl bg-stone-500/10 border border-stone-500/30 flex items-center gap-2 text-xs text-[var(--text-muted)] font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>The 48-hour reservation window has expired.</span>
                  </div>
                )}

                {isConfirmedActive && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>
                        Visit the shop before{' '}
                        {new Date(order.pickupDeadline).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {hasFinalBookingId ? ` with Booking ID ${order.bookingId}` : ''}
                      </span>
                    </div>
                  </div>
                )}

                {isPendingVerification && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 font-medium">
                    <Hourglass className="w-4 h-4 shrink-0" />
                    <span>
                      Your payment screenshot is under verification by Admin. Your confirmed Booking ID will appear once verified.
                    </span>
                  </div>
                )}

                {isRejected && (
                  <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-xs text-[var(--status-danger)] font-semibold">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>
                      Payment verification was rejected by Admin. This booking has been cancelled.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
