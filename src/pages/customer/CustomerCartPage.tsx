import React, { useState } from 'react';
import {
  ArrowLeft,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  AlertCircle,
  Store,
  CreditCard,
} from 'lucide-react';
import { appConfig } from '../../config/appConfig';
import { Customer, PendingCheckoutDraft } from '../../types/models';
import { cartService, EnrichedCartItem } from '../../services/cartService';
import { paymentService } from '../../services/paymentService';
import { ResilientImage } from '../../components/ResilientImage';

interface CustomerCartPageProps {
  items: EnrichedCartItem[];
  loggedInCustomer: Customer | null;
  onRequestCustomerLogin: () => void;
  onBackToShops: () => void;
  onCartUpdated: () => void;
  onBookSingleCartItem: (item: EnrichedCartItem) => void;
  onProceedToPayment: (draft: PendingCheckoutDraft) => void;
}

/**
 * DESI WARDROBE — Customer Cart Screen (Section 11)
 *
 * Adding a product to cart is a personal shopping list only and does NOT reduce stock.
 * Customers can book a single cart item or book all available cart items together,
 * which calculates the dynamic UPI booking amount (₹75 × total quantity) and opens the Payment Page.
 */
export const CustomerCartPage: React.FC<CustomerCartPageProps> = ({
  items,
  loggedInCustomer,
  onRequestCustomerLogin,
  onBackToShops,
  onCartUpdated,
  onBookSingleCartItem,
  onProceedToPayment,
}) => {
  const [customerName, setCustomerName] = useState(loggedInCustomer?.name || '');
  const [customerMobile, setCustomerMobile] = useState(loggedInCustomer?.mobile || '');
  const [showBookAllModal, setShowBookAllModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (loggedInCustomer) {
      setCustomerName(loggedInCustomer.name);
      setCustomerMobile(loggedInCustomer.mobile);
    }
  }, [loggedInCustomer]);

  const availableItems = items.filter((item) => item.product.quantity > 0);
  const totalCartProductValue = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const totalBookableUnits = availableItems.reduce((sum, item) => sum + item.quantity, 0);
  const perUnitBookingFee = appConfig.getMinBookingAmountPerUnit();
  const totalDynamicBookingFee =
    totalBookableUnits > 0 ? paymentService.calculateBookingAmount(totalBookableUnits) : 0;

  const handleUpdateQty = (cartItemId: string, nextQty: number, maxStock: number) => {
    if (nextQty <= 0) {
      cartService.removeCartItem(cartItemId);
    } else {
      cartService.updateCartItemQuantity(cartItemId, Math.min(nextQty, Math.max(1, maxStock)));
    }
    onCartUpdated();
  };

  const handleRemove = (cartItemId: string) => {
    cartService.removeCartItem(cartItemId);
    onCartUpdated();
  };

  const handleBookAllSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!loggedInCustomer) {
      setShowBookAllModal(false);
      onRequestCustomerLogin();
      return;
    }

    try {
      if (availableItems.length === 0) {
        throw new Error('All items in your cart are currently Out of Stock.');
      }

      const draft = paymentService.createCheckoutDraft({
        customerId: loggedInCustomer.customerId,
        customerName: customerName.trim() || loggedInCustomer.name,
        customerMobile: loggedInCustomer.mobile.replace(/\D/g, ''),
        items: availableItems.map((item) => ({
          productId: item.product.productId,
          shopId: item.shop.shopId,
          shopkeeperId: item.shop.shopkeeperId,
          shopName: item.shop.shopName,
          shopLocationName: item.shop.locationName,
          productName: item.product.name,
          productImage: item.product.thumbnails?.[0] || item.product.images[0] || '',
          size: item.size,
          color: item.color,
          quantity: Math.min(item.quantity, item.product.quantity),
          unitPrice: item.product.price,
          fromCartItemId: item.cartItemId,
        })),
      });

      setShowBookAllModal(false);
      onProceedToPayment(draft);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not proceed to payment.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-5 pb-24 space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToShops}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2 hover:bg-[var(--bg-secondary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Continue Shopping</span>
        </button>

        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
          Your Cart ({items.length})
        </h1>
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
            <ShoppingCart className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Your Cart is Empty
            </h2>
            <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto">
              Browse local clothing shops and add outfits to your cart before booking.
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToShops}
            className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
          >
            Explore Local Shops
          </button>
        </div>
      ) : (
        <>
          <div className="p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
            Note: Adding items to your cart saves them to your personal list and does{' '}
            <strong>not</strong> reserve shop stock until you complete booking payment.
          </div>

          <div className="space-y-4">
            {items.map((item) => {
              const outOfStock = item.product.quantity <= 0;
              const itemBookingFee = paymentService.calculateBookingAmount(item.quantity);
              return (
                <div
                  key={item.cartItemId}
                  className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5 flex flex-col sm:flex-row gap-4 justify-between shadow-2xs"
                >
                  <div className="flex gap-4">
                    <div className="w-20 h-28 rounded-2xl overflow-hidden bg-[var(--bg-secondary)] shrink-0">
                      <ResilientImage
                        src={item.product.thumbnails?.[0] || item.product.images[0] || ''}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                        <Store className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        <span>{item.shop.shopName}</span>
                      </div>

                      <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                        {item.product.name}
                      </h3>

                      <div className="text-xs text-[var(--text-secondary)]">
                        Size: <strong>{item.size}</strong> · Color: <strong>{item.color}</strong>
                      </div>

                      <div className="font-mono-tabular text-base font-bold text-[var(--accent-primary)]">
                        ₹{(item.product.price * item.quantity).toLocaleString('en-IN')}{' '}
                        <span className="text-xs font-normal text-[var(--text-muted)]">
                          (Booking Fee: ₹{itemBookingFee})
                        </span>
                      </div>

                      {outOfStock && (
                        <span className="inline-block text-xs font-bold text-[var(--status-danger)]">
                          OUT OF STOCK
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateQty(
                            item.cartItemId,
                            item.quantity - 1,
                            item.product.quantity
                          )
                        }
                        className="w-9 h-9 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <span className="w-8 text-center font-mono-tabular text-sm font-bold text-[var(--text-primary)]">
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        disabled={item.quantity >= item.product.quantity}
                        onClick={() =>
                          handleUpdateQty(
                            item.cartItemId,
                            item.quantity + 1,
                            item.product.quantity
                          )
                        }
                        className="w-9 h-9 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={outOfStock}
                        onClick={() => onBookSingleCartItem(item)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--accent-primary)] disabled:opacity-40 text-white text-xs font-semibold"
                      >
                        Book Item
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemove(item.cartItemId)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-red-500/10 text-[var(--status-danger)] text-xs font-semibold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cart Footer Summary */}
          <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs text-[var(--text-secondary)]">
                  Total Product Value ({totalBookableUnits} unit(s)):{' '}
                  <strong className="font-mono-tabular text-[var(--text-primary)]">
                    ₹{totalCartProductValue.toLocaleString('en-IN')}
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    Booking Amount Now (₹{perUnitBookingFee} × {totalBookableUnits}):
                  </span>
                  <span className="font-mono-tabular text-xl font-bold text-[var(--accent-primary)]">
                    ₹{totalDynamicBookingFee.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={availableItems.length === 0}
                onClick={() => setShowBookAllModal(true)}
                className="min-h-[50px] px-6 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-colors"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>
                  BOOK ALL ITEMS (PAY ₹{totalDynamicBookingFee.toLocaleString('en-IN')})
                </span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Book All Modal */}
      {showBookAllModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleBookAllSubmit}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Confirm Details for Cart Booking
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Total Booking Amount:{' '}
              <strong className="font-mono-tabular text-[var(--accent-primary)]">
                ₹{totalDynamicBookingFee}
              </strong>{' '}
              (₹{perUnitBookingFee} × {totalBookableUnits} units)
            </p>

            {!loggedInCustomer && (
              <div className="p-3 rounded-2xl bg-[var(--accent-soft)]/50 border border-[var(--accent-primary)]/20 flex items-center justify-between text-xs">
                <span>Already registered?</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowBookAllModal(false);
                    onRequestCustomerLogin();
                  }}
                  className="font-bold text-[var(--accent-primary)] underline"
                >
                  Login first
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Your Name *
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Mobile Number *
              </label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                value={customerMobile}
                onChange={(e) =>
                  setCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))
                }
                placeholder="10-digit mobile number"
                className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm text-[var(--text-primary)]"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-[var(--status-danger)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBookAllModal(false)}
                className="flex-1 min-h-[46px] rounded-2xl bg-[var(--bg-secondary)] text-xs font-semibold text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[46px] rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-bold"
              >
                Proceed to Payment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
