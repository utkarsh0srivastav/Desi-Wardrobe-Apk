import React, { useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Store,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
} from 'lucide-react';
import { appConfig } from '../../config/appConfig';
import { Customer, PendingCheckoutDraft, Product } from '../../types/models';
import { paymentService } from '../../services/paymentService';
import { CustomerPublicShop } from '../../utils/category';
import { ResilientImage } from '../../components/ResilientImage';

interface CustomerBookingPageProps {
  product: Product;
  shop: CustomerPublicShop;
  initialSize: string;
  initialColor: string;
  initialQuantity: number;
  loggedInCustomer: Customer | null;
  onRequestCustomerLogin: () => void;
  onBack: () => void;
  onProceedToPayment: (draft: PendingCheckoutDraft) => void;
}

export const CustomerBookingPage: React.FC<CustomerBookingPageProps> = ({
  product,
  shop,
  initialSize,
  initialColor,
  initialQuantity,
  loggedInCustomer,
  onRequestCustomerLogin,
  onBack,
  onProceedToPayment,
}) => {
  const [customerName, setCustomerName] = useState(loggedInCustomer?.name || '');
  const [customerMobile, setCustomerMobile] = useState(loggedInCustomer?.mobile || '');
  const [selectedSize, setSelectedSize] = useState(initialSize || product.sizes[0] || 'M');
  const [selectedColor, setSelectedColor] = useState(initialColor || product.colors[0] || 'Black');
  const [quantity, setQuantity] = useState(
    Math.min(Math.max(1, initialQuantity), Math.max(1, product.quantity))
  );
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (loggedInCustomer) {
      setCustomerName(loggedInCustomer.name);
      setCustomerMobile(loggedInCustomer.mobile);
    }
  }, [loggedInCustomer]);

  const minBookingUnitFee = appConfig.getMinBookingAmountPerUnit();
  const advanceAmount = paymentService.calculateBookingAmount(quantity);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!loggedInCustomer) {
      setError('Please login or register first to place a booking.');
      onRequestCustomerLogin();
      return;
    }

    try {
      const draft = paymentService.createCheckoutDraft({
        customerId: loggedInCustomer.customerId,
        customerName: customerName.trim() || loggedInCustomer.name,
        customerMobile: loggedInCustomer.mobile.replace(/\D/g, ''),
        items: [
          {
            productId: product.productId,
            shopId: shop.shopId,
            shopkeeperId: shop.shopkeeperId,
            shopName: shop.shopName,
            shopLocationName: shop.locationName,
            productName: product.name,
            productImage: product.thumbnails?.[0] || product.images[0] || '',
            size: selectedSize,
            color: selectedColor,
            quantity,
            unitPrice: product.price,
          },
        ],
      });

      onProceedToPayment(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to proceed to payment.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-5 pb-20 space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4 text-[var(--accent-primary)]" />
        <span>BACK TO PRODUCT</span>
      </button>

      <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 shadow-sm space-y-6">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
            48-Hour Product Reservation
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
            Complete Your Booking
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Proceed to pay the ₹{minBookingUnitFee} per unit advance booking fee via UPI to reserve this item.
          </p>
        </div>

        {/* Product & Shop Summary — Strictly NO Shopkeeper mobile number */}
        <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex flex-col sm:flex-row gap-4">
          <div className="w-24 h-28 rounded-2xl overflow-hidden shrink-0 bg-[var(--bg-secondary)]">
            <ResilientImage
              src={product.thumbnails?.[0] || product.images[0] || ''}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 space-y-1.5 text-xs">
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
              {product.name}
            </h3>
            <div className="font-mono-tabular text-base font-bold text-[var(--accent-primary)]">
              ₹{(product.price * quantity).toLocaleString('en-IN')}{' '}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                (₹{product.price.toLocaleString('en-IN')} × {quantity})
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-[var(--text-secondary)] pt-1">
              <span>
                <strong>Size:</strong> {selectedSize}
              </span>
              <span>
                <strong>Color:</strong> {selectedColor}
              </span>
              <span>
                <strong>Qty:</strong> {quantity}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[var(--text-muted)] pt-1">
              <Store className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>
                {shop.shopName} — {shop.locationName}
              </span>
            </div>
          </div>
        </div>

        {/* Size / Color / Quantity Quick Adjust */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-[var(--text-secondary)] mb-1">Size</label>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            >
              {product.sizes.map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[var(--text-secondary)] mb-1">Color</label>
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
            >
              {product.colors.map((clr) => (
                <option key={clr} value={clr}>
                  {clr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[var(--text-secondary)] mb-1">
              Quantity (Max {product.quantity})
            </label>
            <input
              type="number"
              min={1}
              max={Math.max(1, product.quantity)}
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  Math.min(
                    Math.max(1, Number(e.target.value) || 1),
                    Math.max(1, product.quantity)
                  )
                )
              }
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-[var(--text-primary)]"
            />
          </div>
        </div>

        {/* Advance Payment Highlight */}
        <div className="p-4 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-primary)]/30 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-[var(--accent-primary)] uppercase tracking-wider flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5" />
              <span>Minimum Booking Advance Payable Now</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {quantity} {quantity === 1 ? 'unit' : 'units'} × ₹{minBookingUnitFee} per unit
            </p>
          </div>
          <div className="font-mono-tabular text-xl font-bold text-[var(--accent-primary)]">
            ₹{advanceAmount.toLocaleString('en-IN')}
          </div>
        </div>

        {/* 48 Hours Reservation Notice */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-primary)] space-y-1">
            <div className="font-bold">Reserved for 48 Hours After Payment Verification</div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Once your ₹{advanceAmount} UPI booking payment is verified by Admin, the shopkeeper will hold this item for you for 48 hours.
            </p>
          </div>
        </div>

        {!loggedInCustomer && (
          <div className="p-3.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Have a Customer account?</span>
            <button
              type="button"
              onClick={onRequestCustomerLogin}
              className="font-bold text-[var(--accent-primary)] underline"
            >
              Login / Register
            </button>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-[var(--status-danger)] flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Customer Name *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Customer Mobile Number *
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
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
                className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[50px] py-3 px-6 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>PROCEED TO UPI PAYMENT (₹{advanceAmount})</span>
          </button>
        </form>
      </div>
    </div>
  );
};
