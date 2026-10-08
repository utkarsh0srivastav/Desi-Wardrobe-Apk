import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Store,
  Users,
  UserPlus,
  CreditCard,
  ClipboardList,
  Settings,
  LogOut,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  X,
  Phone,
  MapPin,
  Ban,
  Unlock,
  Trash2,
  Download,
  Search,
  Sparkles,
} from 'lucide-react';
import { appConfig, PlatformConfig } from '../../config/appConfig';
import {
  Booking,
  Customer,
  getShopSponsorRemainingDays,
  INDIAN_STATES,
  isShopCurrentlySponsored,
  PaymentRecord,
  Product,
  resolveShopState,
  Shop,
  Shopkeeper,
  ShopSponsor,
  SPONSOR_DURATION_OPTIONS,
  SponsorDurationValue,
} from '../../types/models';
import { adminService } from '../../services/adminService';
import {
  isPaymentApprovedStatus,
  isPaymentRejectedStatus,
  paymentService,
} from '../../services/paymentService';
import { shopkeeperService } from '../../services/shopkeeperService';
import { shopService } from '../../services/shopService';
import {
  downloadAdminCustomersExcel,
  formatCustomerRegistrationDate,
  formatCustomerRegistrationDateTime,
} from '../../utils/excelExport';
import { ActiveAdminSession } from '../../utils/storage';
import { ResilientImage } from '../../components/ResilientImage';

interface AdminDashboardPageProps {
  session: ActiveAdminSession;
  shops: Shop[];
  shopkeepers: Shopkeeper[];
  customers: Customer[];
  products: Product[];
  bookings: Booking[];
  payments: PaymentRecord[];
  onRefreshData: () => void;
  onLogout: () => void;
}

type AdminTab =
  | 'DASHBOARD'
  | 'CUSTOMER_REQUESTS'
  | 'SHOPKEEPER_REQUESTS'
  | 'REGISTER_SHOPKEEPER'
  | 'SHOPS'
  | 'ORDERS'
  | 'PAYMENTS'
  | 'SETTINGS';

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  session,
  shops,
  shopkeepers,
  customers,
  products,
  bookings,
  payments,
  onRefreshData,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('DASHBOARD');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Register Shopkeeper State (Mobile ONLY)
  const [preRegMobile, setPreRegMobile] = useState('');
  const [isSubmittingPreReg, setIsSubmittingPreReg] = useState(false);

  // Payment Screenshot Preview Modal & Delete Confirmation Modal
  const [previewPayment, setPreviewPayment] = useState<PaymentRecord | null>(null);
  const [deleteConfirmPayment, setDeleteConfirmPayment] = useState<PaymentRecord | null>(null);
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);

  // Shop Details Modal
  const [inspectingShop, setInspectingShop] = useState<Shop | null>(null);

  // Admin Shops State Filter (Default: All States) & Sponsorship State
  const [selectedShopState, setSelectedShopState] = useState<string>('All States');
  const [sponsorMap, setSponsorMap] = useState<Record<string, ShopSponsor>>({});
  const [selectedSponsorDurations, setSelectedSponsorDurations] = useState<
    Record<string, SponsorDurationValue>
  >({});
  const [processingSponsorShopId, setProcessingSponsorShopId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = shopService.subscribeToShopSponsors((map) => setSponsorMap(map));
    return unsub;
  }, []);

  // Customer Register Search State (Admin-only)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Settings State
  const currentPlatformCfg = appConfig.get();
  const [cfgUpiId, setCfgUpiId] = useState(currentPlatformCfg.ADMIN_UPI_ID);
  const [cfgBookingFee, setCfgBookingFee] = useState(
    String(currentPlatformCfg.MIN_BOOKING_AMOUNT_PER_UNIT)
  );
  const [cfgRadiusKm, setCfgRadiusKm] = useState(String(currentPlatformCfg.SHOP_RADIUS_KM));
  const [cfgPickupHours, setCfgPickupHours] = useState(String(currentPlatformCfg.PICKUP_HOURS));

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Summary metrics
  const totalShopsCount = shops.length;
  const activeShopsCount = shops.filter((s) => s.shopStatus === 'ACTIVE').length;
  const pendingShopkeeperRequestsCount = shopkeepers.filter(
    (sk) => sk.verificationStatus === 'VERIFIED' && sk.approvalStatus === 'PENDING'
  ).length;
  const pendingCustomerRequestsCount = customers.filter(
    (c) => c.approvalStatus === 'PENDING' || c.accountStatus === 'PENDING'
  ).length;
  const pendingPaymentsCount = payments.filter(
    (p) => p.status === 'PENDING_VERIFICATION'
  ).length;
  const confirmedBookingsCount = bookings.filter(
    (b) => (b.bookingStatus || b.status) === 'CONFIRMED' || b.status === 'BOOKED'
  ).length;
  const soldOrdersCount = bookings.filter(
    (b) => (b.bookingStatus || b.status) === 'SOLD'
  ).length;
  const notSoldOrdersCount = bookings.filter(
    (b) => (b.bookingStatus || b.status) === 'NOT_SOLD'
  ).length;
  const expiredBookingsCount = bookings.filter(
    (b) => (b.bookingStatus || b.status) === 'EXPIRED'
  ).length;

  // Section 18: Register Shopkeeper (Mobile ONLY)
  const handlePreRegisterShopkeeper = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmittingPreReg(true);
    try {
      const created = await shopkeeperService.preRegisterShopkeeperMobileByAdmin(preRegMobile);
      setPreRegMobile('');
      onRefreshData();
      notify(`Shopkeeper mobile +91 ${created.mobile} pre-registered.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not pre-register mobile.');
    } finally {
      setIsSubmittingPreReg(false);
    }
  };

  // Section 20: Approve / Reject Shopkeeper
  const handleShopkeeperDecision = async (
    shopkeeperId: string,
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    setErrorMsg(null);
    try {
      const updated = await shopkeeperService.updateShopkeeperApprovalByAdmin(
        shopkeeperId,
        decision
      );
      onRefreshData();
      notify(`Shopkeeper +91 ${updated.mobile} marked ${decision}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update shopkeeper status.');
    }
  };

  // Section 32-35: Admin Customer Register Excel Download
  const handleDownloadCustomersExcel = () => {
    setErrorMsg(null);
    try {
      downloadAdminCustomersExcel(customers);
      notify(
        customers.length > 0
          ? `Exported ${customers.length} registered customer(s) to Excel.`
          : 'Exported empty customer register template to Excel.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to export Excel file.');
    }
  };

  // Section 34: Admin Payment Verification
  const handleApprovePayment = async (paymentId: string) => {
    setErrorMsg(null);
    setProcessingPaymentId(paymentId);
    try {
      const res = await paymentService.approvePaymentByAdmin(paymentId);
      setPreviewPayment(null);
      onRefreshData();
      const ids = res.confirmedBookings.map((b) => b.bookingId).join(', ');
      notify(`Payment APPROVED! Booking Confirmed — Booking ID: ${ids}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to approve payment.');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    setErrorMsg(null);
    setProcessingPaymentId(paymentId);
    try {
      await paymentService.rejectPaymentByAdmin(paymentId);
      setPreviewPayment(null);
      onRefreshData();
      notify('Payment REJECTED and Booking CANCELLED.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reject payment.');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  // Sections 4, 5, 6, 10, 18-23: Confirmed Admin Delete Payment Proof
  const handleConfirmDeletePaymentProof = async (pay: PaymentRecord) => {
    setErrorMsg(null);
    setProcessingPaymentId(pay.paymentId);
    const wasPending = pay.status === 'PENDING_VERIFICATION';
    const wasApproved = isPaymentApprovedStatus(pay.status);
    try {
      await paymentService.deletePaymentProofByAdmin(pay.paymentId);
      setDeleteConfirmPayment(null);
      setPreviewPayment(null);
      onRefreshData();
      if (wasPending) {
        notify(
          'Payment proof deleted from Storage. Payment marked REJECTED and booking CANCELLED.'
        );
      } else if (wasApproved) {
        notify(
          'Screenshot deleted from Firebase Storage. Payment remains APPROVED and booking remains SUCCESSFUL.'
        );
      } else {
        notify(
          'Screenshot deleted from Firebase Storage. Payment remains REJECTED and booking remains CANCELLED.'
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete payment proof.');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  // Section 35: Admin Shop Management
  const handleShopStatusToggle = async (shopId: string, nextStatus: 'ACTIVE' | 'REMOVED') => {
    setErrorMsg(null);
    try {
      const updated = await shopService.updateShopStatusByAdmin(shopId, nextStatus);
      if (inspectingShop?.shopId === shopId) {
        setInspectingShop(updated);
      }
      onRefreshData();
      notify(
        nextStatus === 'ACTIVE'
          ? `Shop "${updated.shopName}" is now ACTIVE and visible to customers.`
          : `Shop "${updated.shopName}" has been REMOVED from customer discovery.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update shop status.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const nextCfg: PlatformConfig = {
        ADMIN_EMAIL: appConfig.getAdminEmail(),
        ADMIN_UPI_ID: cfgUpiId.trim(),
        MIN_BOOKING_AMOUNT_PER_UNIT: Math.max(1, Number(cfgBookingFee) || 75),
        SHOP_RADIUS_KM: Math.max(1, Number(cfgRadiusKm) || 100),
        PICKUP_HOURS: Math.max(1, Number(cfgPickupHours) || 48),
      };
      await adminService.savePlatformConfig(nextCfg);
      onRefreshData();
      notify('Platform configuration saved and synced.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save configuration.');
    }
  };

  const handleToggleDeviceTrust = async (
    deviceId: string,
    nextStatus: 'TRUSTED' | 'REVOKED'
  ) => {
    setErrorMsg(null);
    try {
      const updated = await adminService.updateAdminDeviceStatus(deviceId, nextStatus);
      onRefreshData();
      if (deviceId === session.deviceId && nextStatus === 'REVOKED') {
        onLogout();
        return;
      }
      notify(`Device "${updated.deviceLabel}" status updated to ${nextStatus}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update device trust status.');
    }
  };

  const adminDevices = adminService.getAdminDevices();

  const navItems: { id: AdminTab; label: string; badge?: number }[] = [
    { id: 'DASHBOARD', label: 'DASHBOARD' },
    {
      id: 'PAYMENTS',
      label: 'PAYMENTS',
      badge: pendingPaymentsCount > 0 ? pendingPaymentsCount : undefined,
    },
    {
      id: 'SHOPKEEPER_REQUESTS',
      label: 'SHOPKEEPER REQUESTS',
      badge: pendingShopkeeperRequestsCount > 0 ? pendingShopkeeperRequestsCount : undefined,
    },
    { id: 'REGISTER_SHOPKEEPER', label: 'REGISTER SHOPKEEPER' },
    { id: 'SHOPS', label: `SHOPS (${totalShopsCount})` },
    { id: 'ORDERS', label: `ORDERS (${bookings.length})` },
    {
      id: 'CUSTOMER_REQUESTS',
      label: `CUSTOMERS (${customers.length})`,
      badge: pendingCustomerRequestsCount > 0 ? pendingCustomerRequestsCount : undefined,
    },
    { id: 'SETTINGS', label: 'SETTINGS' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 pt-5 pb-24 space-y-6">
      {/* Top Admin Header */}
      <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)] text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-mono-tabular font-semibold text-[var(--accent-primary)]">
              ADMIN PORTAL · VERIFIED SESSION
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              Desi Wardrobe Control Center
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="min-h-[44px] px-4 py-2 rounded-2xl border border-[var(--border-subtle)] text-xs font-bold text-[var(--status-danger)] hover:bg-red-500/10 flex items-center gap-2 self-start sm:self-auto transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>LOGOUT</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-x-auto">
        {navItems.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono-tabular font-bold ${
                  activeTab === tab.id
                    ? 'bg-white text-[var(--accent-primary)]'
                    : 'bg-[var(--accent-primary)] text-white'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {toastMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-[var(--status-success)] flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toastMsg}</span>
          </span>
          <button type="button" onClick={() => setToastMsg(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs font-semibold text-[var(--status-danger)] flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </span>
          <button type="button" onClick={() => setErrorMsg(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: DASHBOARD SUMMARY (Section 32) */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <button
              type="button"
              onClick={() => setActiveTab('SHOPS')}
              className="text-left p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] transition-colors space-y-1.5 shadow-2xs"
            >
              <div className="text-xs font-semibold text-[var(--text-secondary)]">Total Shops</div>
              <div className="font-mono-tabular text-3xl font-bold text-[var(--text-primary)]">
                {totalShopsCount}
              </div>
              <div className="text-[11px] text-[var(--status-success)] font-semibold">
                {activeShopsCount} Active
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('SHOPKEEPER_REQUESTS')}
              className="text-left p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] transition-colors space-y-1.5 shadow-2xs"
            >
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Pending Shopkeeper Requests
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-[var(--accent-primary)]">
                {pendingShopkeeperRequestsCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {shopkeepers.length} Total Pre-Registered
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('CUSTOMER_REQUESTS')}
              className="text-left p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] transition-colors space-y-1.5 shadow-2xs"
            >
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                TOTAL CUSTOMERS
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-[var(--text-primary)]">
                {customers.length}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Registered Customer Accounts
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('PAYMENTS')}
              className="text-left p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] transition-colors space-y-1.5 shadow-2xs"
            >
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Pending Payments
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-[var(--status-warning)]">
                {pendingPaymentsCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {payments.length} Total Submissions
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ORDERS')}
              className="text-left p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] transition-colors space-y-1.5 shadow-2xs"
            >
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Confirmed Bookings
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-[var(--status-success)]">
                {confirmedBookingsCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">48h Active Holds</div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ORDERS')}
              className="text-left p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] transition-colors space-y-1.5 shadow-2xs"
            >
              <div className="text-xs font-semibold text-[var(--text-secondary)]">Sold Orders</div>
              <div className="font-mono-tabular text-3xl font-bold text-emerald-600">
                {soldOrdersCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">Completed in-store</div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ORDERS')}
              className="text-left p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] transition-colors space-y-1.5 shadow-2xs"
            >
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Not Sold Orders
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-[var(--status-danger)]">
                {notSoldOrdersCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">Stock restored</div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ORDERS')}
              className="text-left p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] transition-colors space-y-1.5 shadow-2xs"
            >
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Expired Bookings
              </div>
              <div className="font-mono-tabular text-3xl font-bold text-[var(--text-muted)]">
                {expiredBookingsCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">Past 48h window</div>
            </button>
          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('REGISTER_SHOPKEEPER')}
              className="p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-left flex items-center justify-between transition-colors"
            >
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  Pre-Register Shopkeeper
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Authorize a shopkeeper mobile number
                </div>
              </div>
              <UserPlus className="w-5 h-5 text-[var(--accent-primary)]" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('PAYMENTS')}
              className="p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-left flex items-center justify-between transition-colors"
            >
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  Verify UPI Screenshots
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {pendingPaymentsCount} awaiting verification
                </div>
              </div>
              <CreditCard className="w-5 h-5 text-[var(--accent-primary)]" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('SHOPKEEPER_REQUESTS')}
              className="p-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-left flex items-center justify-between transition-colors"
            >
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  Shopkeeper Approvals
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {pendingShopkeeperRequestsCount} pending requests
                </div>
              </div>
              <Store className="w-5 h-5 text-[var(--accent-primary)]" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: REGISTER SHOPKEEPER (Section 18 — Mobile Number ONLY) */}
      {activeTab === 'REGISTER_SHOPKEEPER' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-5 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 space-y-5 self-start shadow-xs">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                Step 1 of Onboarding
              </span>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                Register Shopkeeper
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Enter the Shopkeeper&apos;s 10-digit mobile number. Once pre-registered, the shopkeeper can verify their number, get approved, create their own PIN, and set up their shop profile.
              </p>
            </div>

            <form onSubmit={handlePreRegisterShopkeeper} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Mobile Number <span className="text-[var(--accent-primary)]">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    required
                    value={preRegMobile}
                    onChange={(e) =>
                      setPreRegMobile(e.target.value.replace(/\D/g, '').slice(0, 10))
                    }
                    placeholder="10-digit mobile number"
                    className="w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingPreReg}
                className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isSubmittingPreReg ? 'REGISTERING...' : 'REGISTER'}</span>
              </button>
            </form>
          </div>

          <div className="md:col-span-7 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 space-y-4 shadow-xs">
            <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
              Pre-Registered Shopkeeper Numbers ({shopkeepers.length})
            </h3>

            {shopkeepers.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-8 text-center">
                No shopkeeper mobile numbers pre-registered yet.
              </p>
            ) : (
              <div className="space-y-3">
                {shopkeepers.map((sk) => (
                  <div
                    key={sk.shopkeeperId}
                    className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-mono-tabular text-sm font-bold text-[var(--text-primary)]">
                        +91 {sk.mobile}
                      </div>
                      <div className="text-[var(--text-secondary)]">
                        {sk.name ? `Name: ${sk.name} · ` : ''}
                        Added: {new Date(sk.createdAt).toLocaleDateString('en-IN')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-secondary)] font-semibold text-[var(--text-primary)]">
                        Verify: {sk.verificationStatus}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg font-bold ${
                          sk.approvalStatus === 'APPROVED'
                            ? 'bg-emerald-500/15 text-[var(--status-success)]'
                            : sk.approvalStatus === 'PENDING'
                              ? 'bg-amber-500/15 text-[var(--status-warning)]'
                              : sk.approvalStatus === 'REJECTED'
                                ? 'bg-red-500/15 text-[var(--status-danger)]'
                                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                        }`}
                      >
                        Approval: {sk.approvalStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SHOPKEEPER REQUESTS (Section 20) */}
      {activeTab === 'SHOPKEEPER_REQUESTS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Shopkeeper Verification &amp; Approval Requests
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab('REGISTER_SHOPKEEPER')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-bold"
            >
              + Pre-Register Mobile
            </button>
          </div>

          {shopkeepers.length === 0 ? (
            <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-12 text-center space-y-2">
              <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
                No Shopkeeper Requests Yet
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Pre-register a shopkeeper&apos;s mobile number first in the Register Shopkeeper tab.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {shopkeepers.map((sk) => (
                <div
                  key={sk.shopkeeperId}
                  className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
                >
                  <div className="space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-tabular text-base font-bold text-[var(--text-primary)]">
                        +91 {sk.mobile}
                      </span>
                      {sk.name && (
                        <span className="font-semibold text-[var(--text-secondary)]">
                          ({sk.name})
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                          sk.approvalStatus === 'APPROVED'
                            ? 'bg-emerald-500/15 text-[var(--status-success)]'
                            : sk.approvalStatus === 'PENDING'
                              ? 'bg-amber-500/15 text-[var(--status-warning)]'
                              : sk.approvalStatus === 'REJECTED'
                                ? 'bg-red-500/15 text-[var(--status-danger)]'
                                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                        }`}
                      >
                        {sk.approvalStatus}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--text-secondary)]">
                      <span>Registration: {sk.registrationStatus}</span>
                      <span>Verification: {sk.verificationStatus}</span>
                      <span>PIN Created: {sk.pinCreated ? 'Yes' : 'No'}</span>
                      <span>Profile: {sk.profileStatus}</span>
                    </div>

                    <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
                      Pre-Registered: {new Date(sk.createdAt).toLocaleString('en-IN')}
                      {sk.verifiedAt
                        ? ` · Verified: ${new Date(sk.verifiedAt).toLocaleString('en-IN')}`
                        : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      disabled={sk.approvalStatus === 'APPROVED'}
                      onClick={() => handleShopkeeperDecision(sk.shopkeeperId, 'APPROVED')}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>APPROVE</span>
                    </button>

                    <button
                      type="button"
                      disabled={sk.approvalStatus === 'REJECTED'}
                      onClick={() => handleShopkeeperDecision(sk.shopkeeperId, 'REJECTED')}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>REJECT</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CUSTOMERS — Admin Customer Register & Excel Export (Sections 24-37) */}
      {activeTab === 'CUSTOMER_REQUESTS' && (
        <div className="space-y-5">
          {/* Top Summary & Download Excel Bar */}
          <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                <Users className="w-7 h-7" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  TOTAL CUSTOMERS
                </div>
                <div className="font-mono-tabular text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
                  {customers.length}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  Real-time registered customer accounts in Firebase
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadCustomersExcel}
              className="min-h-[48px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-colors self-start sm:self-auto"
            >
              <Download className="w-4 h-4" />
              <span>DOWNLOAD EXCEL</span>
            </button>
          </div>

          {/* Search Customers by Name or Mobile Number */}
          <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5">
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                placeholder="Search registered customers by Customer Name or Mobile Number..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {/* Registered Customer List */}
          {customers.length === 0 ? (
            <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-12 text-center space-y-2 shadow-2xs">
              <Users className="w-8 h-8 text-[var(--accent-primary)] mx-auto" />
              <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
                No registered customers yet.
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                When a real customer registers in Desi Wardrobe, their record will automatically appear here.
              </p>
            </div>
          ) : (
            (() => {
              const q = customerSearchQuery.trim().toLowerCase();
              const filteredCustomers = q
                ? customers.filter(
                    (c) =>
                      c.name.toLowerCase().includes(q) ||
                      c.mobile.toLowerCase().includes(q) ||
                      (c.email && c.email.toLowerCase().includes(q))
                  )
                : customers;

              if (filteredCustomers.length === 0) {
                return (
                  <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-10 text-center space-y-2">
                    <p className="font-display text-xl font-bold text-[var(--text-primary)]">
                      No matching customers found.
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Try searching with a different customer name or mobile number.
                    </p>
                  </div>
                );
              }

              return (
                <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                          <th className="py-3.5 px-4 sm:px-6">S.No.</th>
                          <th className="py-3.5 px-4 sm:px-6">Customer Name</th>
                          <th className="py-3.5 px-4 sm:px-6">Mobile Number</th>
                          <th className="py-3.5 px-4 sm:px-6">Email ID</th>
                          <th className="py-3.5 px-4 sm:px-6">Registered Date</th>
                          <th className="py-3.5 px-4 sm:px-6">Registered Date &amp; Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] text-xs sm:text-sm">
                        {filteredCustomers.map((cust, index) => {
                          const serialNumber = index + 1;
                          const emailDisplay = cust.email && cust.email.trim() ? cust.email.trim() : '—';
                          const regDate = formatCustomerRegistrationDate(cust.createdAt);
                          const regDateTime = formatCustomerRegistrationDateTime(cust.createdAt);
                          return (
                            <tr
                              key={cust.customerId}
                              className="hover:bg-[var(--bg-secondary)]/30 transition-colors"
                            >
                              <td className="py-3.5 px-4 sm:px-6 font-mono-tabular font-bold text-[var(--text-secondary)]">
                                {serialNumber}
                              </td>
                              <td className="py-3.5 px-4 sm:px-6 font-semibold text-[var(--text-primary)]">
                                {cust.name}
                              </td>
                              <td className="py-3.5 px-4 sm:px-6 font-mono-tabular font-semibold text-[var(--text-primary)]">
                                {cust.mobile}
                              </td>
                              <td className="py-3.5 px-4 sm:px-6 text-[var(--text-primary)]">
                                {emailDisplay}
                              </td>
                              <td className="py-3.5 px-4 sm:px-6 font-mono-tabular text-[var(--text-secondary)]">
                                {regDate}
                              </td>
                              <td className="py-3.5 px-4 sm:px-6 font-mono-tabular text-[var(--text-secondary)]">
                                {regDateTime}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* TAB 5: PAYMENTS — Admin UPI Screenshot Verification (Sections 9, 10, 18-23) */}
      {activeTab === 'PAYMENTS' && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
            UPI Payment Proofs &amp; History ({payments.length})
          </h2>

          {payments.length === 0 ? (
            <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-12 text-center space-y-2">
              <CreditCard className="w-8 h-8 text-[var(--accent-primary)] mx-auto" />
              <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
                No Payment Submissions Yet
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Customer UPI screenshots submitted during booking will appear here for verification.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {payments.map((pay) => {
                const isApproved = isPaymentApprovedStatus(pay.status);
                const isRejected = isPaymentRejectedStatus(pay.status);
                const isPending = !isApproved && !isRejected;
                const isScreenshotDeleted =
                  pay.screenshotDeleted === true || !pay.screenshotURL;

                return (
                  <div
                    key={pay.paymentId}
                    className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 space-y-4 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                      <div>
                        <span className="font-mono-tabular text-xs font-bold text-[var(--accent-primary)]">
                          {pay.paymentId}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] ml-2 font-mono-tabular">
                          Ref: {pay.bookingReference}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-xl text-xs font-bold ${
                            isApproved
                              ? 'bg-emerald-500/15 text-[var(--status-success)]'
                              : isRejected
                                ? 'bg-red-500/15 text-[var(--status-danger)]'
                                : 'bg-amber-500/15 text-[var(--status-warning)]'
                          }`}
                        >
                          Payment Status:{' '}
                          {isApproved
                            ? 'APPROVED'
                            : isRejected
                              ? 'REJECTED'
                              : 'PENDING VERIFICATION'}
                        </span>

                        {isApproved && (
                          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-600 text-white">
                            Booking: SUCCESSFUL
                          </span>
                        )}

                        {isRejected && (
                          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-red-600 text-white">
                            Booking: CANCELLED
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Screenshot Thumbnail or Deleted by Admin Notice */}
                      <div className="md:col-span-3">
                        {isScreenshotDeleted ? (
                          <div className="aspect-3/4 max-w-[160px] rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-3 flex flex-col items-center justify-center text-center gap-2">
                            <Trash2 className="w-6 h-6 text-[var(--text-muted)]" />
                            <span className="text-[11px] font-bold text-[var(--text-primary)]">
                              Screenshot: Deleted by Admin
                            </span>
                            {pay.screenshotDeletedAt && (
                              <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                                {new Date(pay.screenshotDeletedAt).toLocaleDateString('en-IN')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div
                            onClick={() => setPreviewPayment(pay)}
                            className="cursor-pointer group relative aspect-3/4 max-w-[160px] rounded-2xl overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                          >
                            <ResilientImage
                              src={pay.screenshotURL}
                              alt={`Payment proof ${pay.paymentId}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <span className="px-2.5 py-1 rounded-lg bg-white text-black text-[11px] font-bold flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5" /> View Full Image
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Payment & Order Metadata */}
                      <div className="md:col-span-6 space-y-2 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="text-[var(--text-muted)]">Customer Name: </span>
                            <strong className="text-[var(--text-primary)]">
                              {pay.customerName}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Customer Mobile: </span>
                            <strong className="font-mono-tabular text-[var(--text-primary)]">
                              {pay.customerMobile}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Shop Name: </span>
                            <strong className="text-[var(--text-primary)]">{pay.shopName}</strong>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Product Name: </span>
                            <strong className="text-[var(--text-primary)]">{pay.productName}</strong>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Size / Color: </span>
                            <strong>
                              {pay.size} / {pay.color}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[var(--text-muted)]">Quantity: </span>
                            <strong className="font-mono-tabular">{pay.quantity}</strong>
                          </div>
                        </div>

                        <div className="p-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-[var(--text-secondary)]">
                              Expected Amount:{' '}
                            </span>
                            <span className="font-mono-tabular text-base font-bold text-[var(--accent-primary)]">
                              ₹{pay.expectedAmount.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                            Payment Status:{' '}
                            <strong>
                              {isApproved
                                ? 'APPROVED'
                                : isRejected
                                  ? 'REJECTED'
                                  : 'PENDING VERIFICATION'}
                            </strong>
                          </div>
                        </div>

                        {isApproved && pay.finalBookingIds && pay.finalBookingIds.length > 0 && (
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs font-mono-tabular font-bold text-[var(--status-success)]">
                            Booking: SUCCESSFUL · Booking ID: {pay.finalBookingIds.join(', ')}
                          </div>
                        )}

                        {isRejected && (
                          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs font-mono-tabular font-bold text-[var(--status-danger)]">
                            Booking: CANCELLED
                          </div>
                        )}

                        {isScreenshotDeleted && (
                          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                            Screenshot: Deleted by Admin
                          </div>
                        )}

                        <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>
                            Submitted: {new Date(pay.submittedAt).toLocaleString('en-IN')}
                          </span>
                          {pay.verifiedAt && (
                            <span>
                              Approved: {new Date(pay.verifiedAt).toLocaleString('en-IN')}
                            </span>
                          )}
                          {pay.rejectedAt && (
                            <span>
                              Rejected: {new Date(pay.rejectedAt).toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Section 9 & 23: Strict Admin Button Logic */}
                      <div className="md:col-span-3 flex flex-col gap-2">
                        {!isScreenshotDeleted && (
                          <button
                            type="button"
                            onClick={() => setPreviewPayment(pay)}
                            className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-[var(--bg-secondary)] text-xs font-bold text-[var(--text-primary)] flex items-center justify-center gap-1.5"
                          >
                            <Eye className="w-4 h-4" />
                            <span>VIEW FULL IMAGE</span>
                          </button>
                        )}

                        {/* PENDING_VERIFICATION: Show [ APPROVE PAYMENT ], [ REJECT PAYMENT ], [ DELETE PAYMENT PROOF ] */}
                        {isPending && (
                          <>
                            <button
                              type="button"
                              disabled={processingPaymentId === pay.paymentId}
                              onClick={() => handleApprovePayment(pay.paymentId)}
                              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>APPROVE PAYMENT</span>
                            </button>

                            <button
                              type="button"
                              disabled={processingPaymentId === pay.paymentId}
                              onClick={() => handleRejectPayment(pay.paymentId)}
                              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>REJECT PAYMENT</span>
                            </button>
                          </>
                        )}

                        {/* APPROVED: Show APPROVED badge + [ DELETE PAYMENT PROOF ], NO REJECT BUTTON */}
                        {isApproved && (
                          <div className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[var(--status-success)] text-xs font-bold flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>APPROVED</span>
                          </div>
                        )}

                        {/* REJECTED: Show REJECTED badge + [ DELETE PAYMENT PROOF ], NO APPROVE BUTTON */}
                        {isRejected && (
                          <div className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-[var(--status-danger)] text-xs font-bold flex items-center justify-center gap-1.5">
                            <XCircle className="w-4 h-4" />
                            <span>REJECTED</span>
                          </div>
                        )}

                        {/* [ DELETE PAYMENT PROOF ] button (shown for PENDING, APPROVED, and REJECTED) */}
                        <button
                          type="button"
                          disabled={
                            isScreenshotDeleted || processingPaymentId === pay.paymentId
                          }
                          onClick={() => setDeleteConfirmPayment(pay)}
                          className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-[var(--status-danger)] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>
                            {isScreenshotDeleted
                              ? 'SCREENSHOT DELETED'
                              : 'DELETE PAYMENT PROOF'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: SHOPS — Admin Shop Management, State Filter & Sponsorship (Section 35) */}
      {activeTab === 'SHOPS' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                All Registered Shops ({shops.length})
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Filter shops by Indian State and manage Shop Sponsorship priority.
              </p>
            </div>

            {/* Mobile-Friendly State Filter Dropdown */}
            <div className="w-full sm:w-72">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Filter by State
              </label>
              <select
                value={selectedShopState}
                onChange={(e) => setSelectedShopState(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                <option value="All States">All States</option>
                {INDIAN_STATES.map((stateName) => (
                  <option key={stateName} value={stateName}>
                    {stateName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const filteredShopsByState =
              selectedShopState === 'All States'
                ? shops
                : shops.filter(
                    (s) =>
                      resolveShopState(s).toLowerCase() === selectedShopState.toLowerCase()
                  );

            if (shops.length === 0) {
              return (
                <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-12 text-center space-y-2">
                  <Store className="w-8 h-8 text-[var(--accent-primary)] mx-auto" />
                  <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
                    No Shops Created Yet
                  </p>
                </div>
              );
            }

            if (filteredShopsByState.length === 0) {
              return (
                <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-10 text-center space-y-2">
                  <Store className="w-8 h-8 text-[var(--accent-primary)] mx-auto" />
                  <p className="font-display text-xl font-bold text-[var(--text-primary)]">
                    No Shops Found in {selectedShopState}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Select &ldquo;All States&rdquo; or another state from the dropdown above.
                  </p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredShopsByState.map((shop) => {
                  const shopProds = products.filter((p) => p.shopId === shop.shopId);
                  const isRemoved = shop.shopStatus === 'REMOVED';
                  const resolvedState = resolveShopState(shop);
                  const sponsorRecord = sponsorMap[shop.shopId];
                  const isSponsoredActive = isShopCurrentlySponsored(shop, sponsorRecord);
                  const effectiveStartDate =
                    sponsorRecord?.sponsorStartDate || shop.sponsorStartDate;
                  const effectiveEndDate =
                    sponsorRecord?.sponsorEndDate || shop.sponsorEndDate;
                  const effectivePlan = sponsorRecord?.sponsorPlan || shop.sponsorPlan;
                  const remainingDays = getShopSponsorRemainingDays(effectiveEndDate);
                  const isSponsorExpired =
                    !isSponsoredActive &&
                    Boolean(effectiveEndDate) &&
                    new Date(effectiveEndDate!).getTime() < Date.now() &&
                    (sponsorRecord?.sponsorStatus === 'ACTIVE' ||
                      shop.sponsorStatus === 'ACTIVE' ||
                      sponsorRecord?.sponsorStatus === 'EXPIRED' ||
                      shop.sponsorStatus === 'EXPIRED');
                  const chosenDuration: SponsorDurationValue =
                    selectedSponsorDurations[shop.shopId] || '30_DAYS';

                  return (
                    <div
                      key={shop.shopId}
                      className={`rounded-3xl bg-[var(--bg-card)] border p-5 space-y-4 shadow-2xs flex flex-col justify-between ${
                        isSponsoredActive
                          ? 'border-amber-500/70 ring-1 ring-amber-500/25'
                          : 'border-[var(--border-subtle)]'
                      }`}
                    >
                      <div className="flex gap-4">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[var(--bg-secondary)] shrink-0">
                          <ResilientImage
                            src={shop.photo}
                            alt={shop.shopName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="space-y-1 text-xs flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase ${
                                  isRemoved
                                    ? 'bg-red-500/15 text-[var(--status-danger)]'
                                    : 'bg-emerald-500/15 text-[var(--status-success)]'
                                }`}
                              >
                                {shop.shopStatus || 'ACTIVE'}
                              </span>
                              {isSponsoredActive ? (
                                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-black text-[10px] font-extrabold uppercase flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  <span>SPONSORED</span>
                                </span>
                              ) : isSponsorExpired ? (
                                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-[var(--status-warning)] text-[10px] font-bold uppercase">
                                  SPONSOR EXPIRED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-muted)] text-[10px] font-semibold uppercase">
                                  NOT SPONSORED
                                </span>
                              )}
                            </div>
                            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                              {shopProds.length} products
                            </span>
                          </div>

                          <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
                            {shop.shopName}
                          </h3>
                          <div className="text-[var(--text-secondary)]">
                            Owner: <strong>{shop.shopkeeperName}</strong> · +91 {shop.mobile}
                          </div>
                          <div className="text-[var(--text-muted)] flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                            <span className="line-clamp-1">{shop.locationName}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="text-[11px] text-[var(--text-secondary)]">
                              State:{' '}
                              <strong>{resolvedState || 'Not Set'}</strong>
                            </span>
                            <select
                              value={resolvedState}
                              onChange={async (e) => {
                                const newState = e.target.value;
                                try {
                                  await shopService.updateShopStateByAdmin(
                                    shop.shopId,
                                    newState
                                  );
                                  onRefreshData();
                                  notify(
                                    `Updated state for ${shop.shopName} to ${newState || 'Unset'}.`
                                  );
                                } catch (err) {
                                  setErrorMsg(
                                    err instanceof Error
                                      ? err.message
                                      : 'Failed to update shop state.'
                                  );
                                }
                              }}
                              className="min-h-[28px] px-2 py-0.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)]"
                            >
                              <option value="">Set State...</option>
                              {INDIAN_STATES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Shop Sponsorship Management Box */}
                      <div className="p-3.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>Shop Sponsorship</span>
                          </span>
                          {isSponsoredActive && (
                            <span className="font-mono-tabular text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              {remainingDays} {remainingDays === 1 ? 'day' : 'days'} remaining
                            </span>
                          )}
                        </div>

                        {(isSponsoredActive || isSponsorExpired) && effectiveEndDate && (
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-card)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                            <div>
                              <span className="text-[var(--text-muted)] block">Start Date</span>
                              <strong className="font-mono-tabular text-[var(--text-primary)]">
                                {effectiveStartDate
                                  ? new Date(effectiveStartDate).toLocaleDateString('en-IN')
                                  : '—'}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[var(--text-muted)] block">Expiry Date</span>
                              <strong className="font-mono-tabular text-[var(--text-primary)]">
                                {new Date(effectiveEndDate).toLocaleDateString('en-IN')}
                              </strong>
                            </div>
                            {effectivePlan && (
                              <div className="col-span-2">
                                <span className="text-[var(--text-muted)]">Plan: </span>
                                <strong className="text-[var(--text-primary)]">
                                  {effectivePlan}
                                </strong>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <select
                            value={chosenDuration}
                            onChange={(e) =>
                              setSelectedSponsorDurations((prev) => ({
                                ...prev,
                                [shop.shopId]: e.target.value as SponsorDurationValue,
                              }))
                            }
                            className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)]"
                          >
                            {SPONSOR_DURATION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            disabled={processingSponsorShopId === shop.shopId}
                            onClick={async () => {
                              setErrorMsg(null);
                              setProcessingSponsorShopId(shop.shopId);
                              try {
                                await shopService.sponsorShopByAdmin({
                                  shopId: shop.shopId,
                                  duration: chosenDuration,
                                  adminUid: session.adminUid,
                                });
                                onRefreshData();
                                notify(`Sponsored ${shop.shopName} successfully.`);
                              } catch (err) {
                                setErrorMsg(
                                  err instanceof Error
                                    ? err.message
                                    : 'Failed to activate sponsorship.'
                                );
                              } finally {
                                setProcessingSponsorShopId(null);
                              }
                            }}
                            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              {isSponsoredActive ? 'EXTEND SPONSOR' : 'SPONSOR SHOP'}
                            </span>
                          </button>

                          {isSponsoredActive && (
                            <button
                              type="button"
                              disabled={processingSponsorShopId === shop.shopId}
                              onClick={async () => {
                                setErrorMsg(null);
                                setProcessingSponsorShopId(shop.shopId);
                                try {
                                  await shopService.removeShopSponsorshipByAdmin(
                                    shop.shopId,
                                    session.adminUid
                                  );
                                  onRefreshData();
                                  notify(`Removed sponsorship for ${shop.shopName}.`);
                                } catch (err) {
                                  setErrorMsg(
                                    err instanceof Error
                                      ? err.message
                                      : 'Failed to remove sponsorship.'
                                  );
                                } finally {
                                  setProcessingSponsorShopId(null);
                                }
                              }}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 text-[var(--status-danger)] text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1 transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>REMOVE</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={() => setInspectingShop(shop)}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[var(--bg-secondary)] text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>VIEW DETAILS</span>
                        </button>

                        {isRemoved ? (
                          <button
                            type="button"
                            onClick={() => handleShopStatusToggle(shop.shopId, 'ACTIVE')}
                            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 ml-auto"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>ACTIVATE SHOP</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleShopStatusToggle(shop.shopId, 'REMOVED')}
                            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold flex items-center gap-1.5 ml-auto"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>REMOVE / DEACTIVATE</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 7: ORDERS — Admin Order Management (Section 36) */}
      {activeTab === 'ORDERS' && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
            All Platform Bookings &amp; Orders ({bookings.length})
          </h2>

          {bookings.length === 0 ? (
            <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-12 text-center space-y-2">
              <ClipboardList className="w-8 h-8 text-[var(--accent-primary)] mx-auto" />
              <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
                No Orders Recorded Yet
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {bookings.map((b) => {
                const effectiveStatus = b.bookingStatus || b.status;
                return (
                  <div
                    key={b.bookingId}
                    className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 space-y-3 shadow-2xs text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
                      <div>
                        <span className="font-mono-tabular text-sm font-bold text-[var(--accent-primary)]">
                          {b.bookingId}
                        </span>
                        <span className="text-[var(--text-muted)] ml-2">Shop: {b.shopName}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-secondary)] font-semibold">
                          Payment: {b.paymentStatus || 'VERIFIED'}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-lg font-bold ${
                            effectiveStatus === 'CONFIRMED' || effectiveStatus === 'SOLD'
                              ? 'bg-emerald-500/15 text-[var(--status-success)]'
                              : effectiveStatus === 'PAYMENT_PENDING'
                                ? 'bg-amber-500/15 text-[var(--status-warning)]'
                                : 'bg-red-500/15 text-[var(--status-danger)]'
                          }`}
                        >
                          {effectiveStatus}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <div className="text-[var(--text-muted)]">Customer</div>
                        <div className="font-bold text-[var(--text-primary)]">{b.customerName}</div>
                        <div className="font-mono-tabular">{b.customerMobile}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">Product</div>
                        <div className="font-bold text-[var(--text-primary)]">{b.productName}</div>
                        <div>
                          Size {b.size} · {b.color} · Qty {b.quantity}
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)]">Amounts</div>
                        <div className="font-mono-tabular font-bold text-[var(--text-primary)]">
                          Product Total: ₹{b.price.toLocaleString('en-IN')}
                        </div>
                        <div className="font-mono-tabular text-[var(--accent-primary)] font-semibold">
                          Booking Fee Paid: ₹{(b.paymentAmount || b.quantity * 75).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap justify-between gap-2 text-[11px] font-mono-tabular text-[var(--text-muted)]">
                      <span>Created: {new Date(b.createdAt).toLocaleString('en-IN')}</span>
                      <span>
                        Pickup Deadline: {new Date(b.pickupDeadline).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 8: SETTINGS — Centralized Configuration & Trusted Admin Devices */}
      {activeTab === 'SETTINGS' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveSettings}
            className="max-w-xl rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 space-y-5 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-[var(--accent-primary)]" />
              <div>
                <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                  Centralized Platform Configuration
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Changes sync immediately with Firestore and update all booking &amp; discovery calculations.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  ADMIN_UPI_ID
                </label>
                <input
                  type="text"
                  required
                  value={cfgUpiId}
                  onChange={(e) => setCfgUpiId(e.target.value)}
                  className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-xs text-[var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    MIN_BOOKING_AMOUNT_PER_UNIT (₹)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={cfgBookingFee}
                    onChange={(e) => setCfgBookingFee(e.target.value)}
                    className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-xs text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    SHOP_RADIUS_KM
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={cfgRadiusKm}
                    onChange={(e) => setCfgRadiusKm(e.target.value)}
                    className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-xs text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    PICKUP_HOURS
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={cfgPickupHours}
                    onChange={(e) => setCfgPickupHours(e.target.value)}
                    className="w-full min-h-[46px] px-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-xs text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold shadow-sm transition-colors"
            >
              SAVE PLATFORM CONFIGURATION
            </button>
          </form>

          {/* Trusted Admin Devices Management */}
          <div className="max-w-3xl rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 space-y-4 shadow-xs">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-[var(--accent-primary)]" />
              <div>
                <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                  Trusted Admin Devices ({adminDevices.length})
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Devices registered with Google verification + Admin PIN can log in using Admin PIN only. Revoking a device immediately requires Google Sign-In again on that device.
                </p>
              </div>
            </div>

            {adminDevices.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                No trusted devices registered yet.
              </div>
            ) : (
              <div className="space-y-3">
                {adminDevices.map((dev) => {
                  const isCurrent = dev.deviceId === session.deviceId;
                  const isTrusted = dev.status === 'TRUSTED';
                  return (
                    <div
                      key={dev.deviceId}
                      className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[var(--text-primary)]">
                            {dev.deviceLabel}
                          </span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[10px] font-bold uppercase">
                              THIS DEVICE
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              isTrusted
                                ? 'bg-emerald-500/15 text-[var(--status-success)]'
                                : 'bg-red-500/15 text-[var(--status-danger)]'
                            }`}
                          >
                            {dev.status}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                          ID: {dev.deviceId}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                          Registered: {new Date(dev.createdAt).toLocaleString('en-IN')} · Last Used:{' '}
                          {new Date(dev.lastUsedAt).toLocaleString('en-IN')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isTrusted ? (
                          <button
                            type="button"
                            onClick={() => handleToggleDeviceTrust(dev.deviceId, 'REVOKED')}
                            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-[var(--status-danger)] text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>{isCurrent ? 'REVOKE & LOGOUT' : 'REVOKE TRUST'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleDeviceTrust(dev.deviceId, 'TRUSTED')}
                            className="min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-[var(--status-success)] text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>RESTORE TRUST</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Screenshot Fullscreen Inspection Modal */}
      {previewPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <div className="text-xs font-mono-tabular text-[var(--accent-primary)] font-bold">
                  {previewPayment.paymentId}
                </div>
                <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
                  Payment Proof · ₹{previewPayment.expectedAmount}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPayment(null)}
                className="w-9 h-9 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden bg-black/20 border border-[var(--border-subtle)] max-h-[55vh] flex items-center justify-center">
              <ResilientImage
                src={previewPayment.screenshotURL}
                alt="Payment proof full view"
                className="max-h-[55vh] w-auto object-contain"
              />
            </div>

            <div className="text-xs space-y-1 text-[var(--text-secondary)]">
              <div>
                Customer: <strong>{previewPayment.customerName}</strong> (
                {previewPayment.customerMobile})
              </div>
              <div>
                Product: <strong>{previewPayment.productName}</strong> · Qty{' '}
                {previewPayment.quantity}
              </div>
              <div>
                Expected UPI Amount:{' '}
                <strong className="font-mono-tabular text-[var(--accent-primary)]">
                  ₹{previewPayment.expectedAmount}
                </strong>{' '}
                to {previewPayment.upiId}
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-2">
              {previewPayment.status === 'PENDING_VERIFICATION' && (
                <>
                  <button
                    type="button"
                    disabled={processingPaymentId === previewPayment.paymentId}
                    onClick={() => handleApprovePayment(previewPayment.paymentId)}
                    className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold"
                  >
                    APPROVE PAYMENT
                  </button>
                  <button
                    type="button"
                    disabled={processingPaymentId === previewPayment.paymentId}
                    onClick={() => handleRejectPayment(previewPayment.paymentId)}
                    className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white text-xs font-bold"
                  >
                    REJECT PAYMENT
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={
                  previewPayment.screenshotDeleted === true ||
                  !previewPayment.screenshotURL ||
                  processingPaymentId === previewPayment.paymentId
                }
                onClick={() => setDeleteConfirmPayment(previewPayment)}
                className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl bg-red-500/15 hover:bg-red-500/25 disabled:opacity-40 text-[var(--status-danger)] text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>DELETE PAYMENT PROOF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section 10: Confirmation Dialog Before Deleting Payment Screenshot */}
      {deleteConfirmPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-500/15 text-[var(--status-danger)] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--status-danger)]">
                  Confirm Screenshot Deletion
                </div>
                <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
                  Delete Payment Proof
                </h3>
              </div>
            </div>

            <p className="text-sm font-medium text-[var(--text-primary)] leading-relaxed">
              {deleteConfirmPayment.status === 'PENDING_VERIFICATION'
                ? 'Deleting this payment proof will reject the payment and cancel the booking. Continue?'
                : isPaymentApprovedStatus(deleteConfirmPayment.status)
                  ? 'Delete the payment screenshot? The booking will remain successful.'
                  : 'Delete the payment screenshot? The booking will remain cancelled.'}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={processingPaymentId === deleteConfirmPayment.paymentId}
                onClick={() => setDeleteConfirmPayment(null)}
                className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-secondary)] hover:bg-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] transition-colors"
              >
                CANCEL
              </button>

              <button
                type="button"
                disabled={processingPaymentId === deleteConfirmPayment.paymentId}
                onClick={() => void handleConfirmDeletePaymentProof(deleteConfirmPayment)}
                className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-bold transition-colors"
              >
                {deleteConfirmPayment.status === 'PENDING_VERIFICATION'
                  ? 'DELETE & REJECT'
                  : 'DELETE SCREENSHOT'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shop Details Modal */}
      {inspectingShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                  Shop Inspection
                </span>
                <h3 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                  {inspectingShop.shopName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingShop(null)}
                className="w-9 h-9 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <div>
                  <span className="text-[var(--text-muted)]">Shopkeeper: </span>
                  <strong>{inspectingShop.shopkeeperName}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Mobile: </span>
                  <strong className="font-mono-tabular">+91 {inspectingShop.mobile}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Category &amp; Policy: </span>
                  <strong>
                    {inspectingShop.category} · {inspectingShop.pricePolicy}
                  </strong>
                </div>
              </div>
              <div className="space-y-1.5">
                <div>
                  <span className="text-[var(--text-muted)]">Status: </span>
                  <strong>{inspectingShop.shopStatus}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Location: </span>
                  <strong>{inspectingShop.locationName}</strong>
                </div>
                <div className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  GPS: {inspectingShop.latitude}, {inspectingShop.longitude}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-display text-lg font-bold text-[var(--text-primary)]">
                Uploaded Products (
                {products.filter((p) => p.shopId === inspectingShop.shopId).length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products
                  .filter((p) => p.shopId === inspectingShop.shopId)
                  .map((prod) => (
                    <div
                      key={prod.productId}
                      className="p-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs space-y-1"
                    >
                      <div className="font-bold text-[var(--text-primary)] truncate">
                        {prod.name}
                      </div>
                      <div className="font-mono-tabular text-[var(--accent-primary)] font-bold">
                        ₹{prod.price} · Qty {prod.quantity}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
