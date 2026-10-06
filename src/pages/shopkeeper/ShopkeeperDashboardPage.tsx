import React, { useState, useRef } from 'react';
import {
  ClipboardList,
  Upload,
  Package,
  Store,
  LogOut,
  Plus,
  Minus,
  Trash2,
  Edit3,
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  Booking,
  Product,
  Shop,
  Shopkeeper,
  STANDARD_COLORS,
  STANDARD_SIZES,
} from '../../types/models';
import { productService } from '../../services/productService';
import { bookingService } from '../../services/bookingService';
import { imageService } from '../../services/imageService';
import { ResilientImage } from '../../components/ResilientImage';
import { ShopProfileSetupPage } from './ShopProfileSetupPage';

interface ShopkeeperDashboardPageProps {
  shopkeeper: Shopkeeper;
  shop: Shop;
  products: Product[];
  bookings: Booking[];
  onLogout: () => void;
  onRefreshData: () => void;
}

type DashboardView = 'HOME' | 'ORDERS' | 'UPLOAD_PRODUCT' | 'MANAGE_PRODUCTS' | 'SHOP_PROFILE';

interface CompressedPhotoPair {
  optimized: string;
  thumbnail: string;
  sizeKB: number;
}

/**
 * DESI WARDROBE — Shopkeeper Dashboard (Sections 22, 23, 24, 25, 26, 27, 28)
 *
 * Simple, clean dashboard:
 * Main options:
 * - ORDERS
 * - UPLOAD PRODUCT
 * Also:
 * - MANAGE PRODUCTS
 * - SHOP PROFILE
 * - LOGOUT
 */
export const ShopkeeperDashboardPage: React.FC<ShopkeeperDashboardPageProps> = ({
  shopkeeper,
  shop,
  products,
  bookings,
  onLogout,
  onRefreshData,
}) => {
  const [view, setView] = useState<DashboardView>('HOME');
  const [selectedOrder, setSelectedOrder] = useState<Booking | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Upload Product State
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodQty, setProdQty] = useState('10');
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['M', 'L', 'XL']);
  const [selectedColors, setSelectedColors] = useState<string[]>(['Black', 'White', 'Red']);
  const [customColor, setCustomColor] = useState('');
  const [colorOptions, setColorOptions] = useState<string[]>(STANDARD_COLORS);
  const [photos, setPhotos] = useState<CompressedPhotoPair[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);

  // Edit / Update Colors Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editSizes, setEditSizes] = useState<string[]>([]);
  const [editColors, setEditColors] = useState<string[]>([]);
  const [editCustomColor, setEditCustomColor] = useState('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Compress uploaded photos (~300-400 KB target + thumbnail)
  const handlePhotoFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg(null);

    if (photos.length + fileList.length > 8) {
      setErrorMsg('Maximum 8 photos allowed per product.');
      return;
    }

    setIsCompressing(true);
    try {
      const batch: CompressedPhotoPair[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const res = await imageService.compressImageFile(fileList[i]);
        batch.push({
          optimized: res.optimizedDataUrl,
          thumbnail: res.thumbnailDataUrl,
          sizeKB: res.compressedSizeKB,
        });
      }
      setPhotos((prev) => [...prev, ...batch].slice(0, 8));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to compress photo.');
    } finally {
      setIsCompressing(false);
    }
  };

  const toggleItem = (item: string, list: string[], setter: (next: string[]) => void) => {
    if (list.includes(item)) {
      setter(list.filter((x) => x !== item));
    } else {
      setter([...list, item]);
    }
  };

  const handleAddCustomColor = () => {
    const clean = customColor.trim();
    if (!clean) return;
    const formatted = clean.charAt(0).toUpperCase() + clean.slice(1);
    if (!colorOptions.includes(formatted)) {
      setColorOptions((prev) => [...prev, formatted]);
    }
    if (!selectedColors.includes(formatted)) {
      setSelectedColors((prev) => [...prev, formatted]);
    }
    setCustomColor('');
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      productService.createProduct({
        shopId: shop.shopId,
        name: prodName,
        description: prodDesc,
        price: Number(prodPrice),
        quantity: Number(prodQty),
        sizes: selectedSizes,
        colors: selectedColors,
        images: photos.map((p) => p.optimized),
        thumbnails: photos.map((p) => p.thumbnail),
      });

      setProdName('');
      setProdDesc('');
      setProdPrice('');
      setProdQty('10');
      setPhotos([]);
      onRefreshData();
      notify('Product uploaded to your shop.');
      setView('MANAGE_PRODUCTS');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload product.');
    }
  };

  const handleMarkSold = (bookingId: string) => {
    setErrorMsg(null);
    try {
      const updated = bookingService.markOrderSold(bookingId);
      setSelectedOrder(updated);
      onRefreshData();
      notify(`Order ${bookingId} marked SOLD.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to mark order SOLD.');
    }
  };

  const handleMarkNotSold = (bookingId: string) => {
    setErrorMsg(null);
    try {
      const updated = bookingService.markOrderNotSold(bookingId);
      setSelectedOrder(updated);
      onRefreshData();
      notify(`Order ${bookingId} marked NOT SOLD. Reserved stock released.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to mark order NOT SOLD.');
    }
  };

  const handleQuantityStep = (productId: string, delta: number) => {
    try {
      productService.adjustQuantityByDelta(productId, delta);
      onRefreshData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update quantity.');
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditName(product.name);
    setEditDesc(product.description);
    setEditPrice(String(product.price));
    setEditQty(String(product.quantity));
    setEditSizes([...product.sizes]);
    setEditColors([...product.colors]);
    setEditCustomColor('');
  };

  const handleSaveEditProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setErrorMsg(null);
    try {
      productService.updateProduct(editingProduct.productId, {
        name: editName,
        description: editDesc,
        price: Number(editPrice),
        quantity: Number(editQty),
        sizes: editSizes,
        colors: editColors,
      });
      setEditingProduct(null);
      onRefreshData();
      notify('Product updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update product.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pt-5 pb-24 space-y-6">
      {/* Shopkeeper Header */}
      <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[var(--bg-secondary)] shrink-0">
            <ResilientImage
              src={shop.photo}
              alt={shop.shopName}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)]">
              {shopkeeper.name} · <span className="font-mono-tabular">{shop.mobile}</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              {shop.shopName}
            </h1>
            <div className="text-xs text-[var(--text-muted)]">📍 {shop.locationName}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="min-h-[44px] px-4 py-2 rounded-2xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--status-danger)] hover:bg-red-500/10 flex items-center gap-2 self-start sm:self-auto transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>LOGOUT</span>
        </button>
      </div>

      {/* Simple Dashboard Navigation Pills */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-x-auto">
        {(
          [
            { id: 'HOME', label: 'Dashboard' },
            { id: 'ORDERS', label: `ORDERS (${bookings.length})` },
            { id: 'UPLOAD_PRODUCT', label: 'UPLOAD PRODUCT' },
            { id: 'MANAGE_PRODUCTS', label: `MANAGE PRODUCTS (${products.length})` },
            { id: 'SHOP_PROFILE', label: 'SHOP PROFILE' },
          ] as { id: DashboardView; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              view === tab.id
                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            {tab.label}
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

      {/* VIEW 1: SIMPLE DASHBOARD HOME (Section 22) */}
      {view === 'HOME' && (
        <div className="space-y-4">
          {/* Two Main Options: ORDERS and UPLOAD PRODUCT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setView('ORDERS')}
              className="text-left p-6 rounded-3xl bg-[var(--bg-card)] border-2 border-[var(--accent-primary)]/35 hover:border-[var(--accent-primary)] transition-all space-y-3 group shadow-2xs"
            >
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)] text-white flex items-center justify-center">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)]">
                  ORDERS
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  View customer bookings and mark orders SOLD or NOT SOLD.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setView('UPLOAD_PRODUCT')}
              className="text-left p-6 rounded-3xl bg-[var(--bg-card)] border-2 border-[var(--accent-primary)]/35 hover:border-[var(--accent-primary)] transition-all space-y-3 group shadow-2xs"
            >
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)] text-white flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)]">
                  UPLOAD PRODUCT
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Add new clothes using your camera or gallery with sizes and colors.
                </p>
              </div>
            </button>
          </div>

          {/* Secondary Simple Options: MANAGE PRODUCTS, SHOP PROFILE, LOGOUT */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setView('MANAGE_PRODUCTS')}
              className="min-h-[64px] p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-left flex items-center justify-between transition-colors"
            >
              <div>
                <div className="text-xs font-bold text-[var(--text-primary)]">MANAGE PRODUCTS</div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {products.length} uploaded
                </div>
              </div>
              <Package className="w-5 h-5 text-[var(--accent-primary)]" />
            </button>

            <button
              type="button"
              onClick={() => setView('SHOP_PROFILE')}
              className="min-h-[64px] p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-left flex items-center justify-between transition-colors"
            >
              <div>
                <div className="text-xs font-bold text-[var(--text-primary)]">SHOP PROFILE</div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate max-w-[160px]">
                  {shop.category}
                </div>
              </div>
              <Store className="w-5 h-5 text-[var(--accent-primary)]" />
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="min-h-[64px] p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-red-500/50 text-left flex items-center justify-between transition-colors"
            >
              <div>
                <div className="text-xs font-bold text-[var(--status-danger)]">LOGOUT</div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Exit shopkeeper session
                </div>
              </div>
              <LogOut className="w-5 h-5 text-[var(--status-danger)]" />
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: SHOPKEEPER ORDERS — Clean Mobile Cards (Sections 23 & 24) */}
      {view === 'ORDERS' && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
            Shop Orders
          </h2>

          {bookings.length === 0 ? (
            <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-12 text-center space-y-2">
              <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
                No customer bookings yet.
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Orders booked by customers for {shop.shopName} will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {bookings.map((order) => {
                const currentStatus = order.bookingStatus || order.status;
                const isConfirmedReady =
                  currentStatus === 'CONFIRMED' || currentStatus === 'BOOKED';
                const isPendingPayment =
                  currentStatus === 'PAYMENT_PENDING' ||
                  order.paymentStatus === 'PENDING_VERIFICATION';
                const isRejected =
                  currentStatus === 'PAYMENT_REJECTED' ||
                  currentStatus === 'CANCELLED' ||
                  order.paymentStatus === 'REJECTED';

                return (
                  <div
                    key={order.bookingId}
                    onClick={() => setSelectedOrder(order)}
                    className="cursor-pointer rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] p-5 space-y-4 shadow-2xs transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-sm font-bold text-[var(--accent-primary)]">
                        {/^DW-\d{8}-[A-Z0-9]{6}$/.test(order.bookingId)
                          ? order.bookingId
                          : isRejected
                            ? 'Booking Cancelled'
                            : 'Awaiting Payment Verification'}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                          currentStatus === 'SOLD' || isConfirmedReady
                            ? 'bg-emerald-500/15 text-[var(--status-success)]'
                            : isPendingPayment
                              ? 'bg-amber-500/15 text-[var(--status-warning)]'
                              : 'bg-red-500/15 text-[var(--status-danger)]'
                        }`}
                      >
                        {currentStatus === 'SOLD'
                          ? 'SOLD • COMPLETED'
                          : isConfirmedReady
                            ? 'CONFIRMED • READY FOR PICKUP'
                            : isPendingPayment
                              ? 'PAYMENT_PENDING'
                              : currentStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="text-[var(--text-muted)]">Customer</div>
                        <div className="font-semibold text-sm text-[var(--text-primary)]">
                          {order.customerName}
                        </div>
                        <div className="font-mono-tabular text-[var(--text-secondary)]">
                          {order.customerMobile}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[var(--text-muted)]">Product</div>
                        <div className="font-semibold text-sm text-[var(--text-primary)]">
                          {order.productName}
                        </div>
                        <div className="text-[var(--text-secondary)]">
                          Size: <strong>{order.size}</strong> · Color:{' '}
                          <strong>{order.color}</strong> · Qty:{' '}
                          <strong className="font-mono-tabular">{order.quantity}</strong> ·{' '}
                          <strong className="font-mono-tabular text-[var(--text-primary)]">
                            ₹{order.price.toLocaleString('en-IN')}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] font-mono-tabular">
                      <span>
                        Booked:{' '}
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-[var(--status-warning)] font-semibold">
                        Pickup Deadline:{' '}
                        {new Date(order.pickupDeadline).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Action Buttons: MARK SOLD / MARK NOT SOLD */}
                    <div
                      className="pt-2 flex items-center gap-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={!isConfirmedReady}
                        onClick={() => handleMarkSold(order.bookingId)}
                        className="flex-1 min-h-[44px] px-4 py-2 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>MARK SOLD</span>
                      </button>

                      <button
                        type="button"
                        disabled={!isConfirmedReady}
                        onClick={() => handleMarkNotSold(order.bookingId)}
                        className="flex-1 min-h-[44px] px-4 py-2 rounded-2xl bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>MARK NOT SOLD</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: UPLOAD PRODUCT (Sections 27 & 28) */}
      {view === 'UPLOAD_PRODUCT' && (
        <form
          onSubmit={handleUploadSubmit}
          className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-8 space-y-6 shadow-xs"
        >
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              Upload Product
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Add photos from your camera or gallery (up to 8 photos, auto-compressed to ~300–400
              KB).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Product Name <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <input
                type="text"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="e.g. Cotton Festive Kurta or Banarasi Silk Saree"
                className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Description <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
                placeholder="Describe fabric, fit, and occasion..."
                className="w-full px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Price (₹) <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <input
                type="number"
                min={1}
                required
                value={prodPrice}
                onChange={(e) => setProdPrice(e.target.value)}
                placeholder="e.g. 899"
                className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Quantity <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <input
                type="number"
                min={0}
                required
                value={prodQty}
                onChange={(e) => setProdQty(e.target.value)}
                placeholder="e.g. 10"
                className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* PHOTO INPUT: TAKE PHOTO and CHOOSE FROM GALLERY */}
          <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[var(--text-primary)]">
                Photos (Maximum 8 photos) <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                {photos.length} / 8
              </span>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handlePhotoFiles(e.target.files)}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handlePhotoFiles(e.target.files)}
              className="hidden"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="min-h-[52px] px-4 py-3 rounded-2xl border-2 border-dashed border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>TAKE PHOTO</span>
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="min-h-[52px] px-4 py-3 rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-semibold flex items-center justify-center gap-2"
              >
                <ImageIcon className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>CHOOSE FROM GALLERY</span>
              </button>
            </div>

            {isCompressing && (
              <p className="text-xs text-[var(--accent-primary)] font-medium">
                Generating thumbnail & compressing image (~300–400 KB)...
              </p>
            )}

            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {photos.map((p, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-2 space-y-2"
                  >
                    <div className="aspect-3/4 rounded-xl overflow-hidden bg-[var(--bg-secondary)]">
                      <ResilientImage
                        src={p.thumbnail}
                        alt={`Product upload ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] px-1">
                      <span>~{p.sizeKB} KB</span>
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-[var(--status-danger)] font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SIZES */}
          <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              Sizes <span className="text-[var(--accent-primary)]">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {STANDARD_SIZES.map((sz) => {
                const active = selectedSizes.includes(sz);
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => toggleItem(sz, selectedSizes, setSelectedSizes)}
                    className={`min-h-[44px] min-w-[48px] px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      active
                        ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                        : 'bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-primary)]'
                    }`}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </div>

          {/* COLORS */}
          <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              Colors <span className="text-[var(--accent-primary)]">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((clr) => {
                const active = selectedColors.includes(clr);
                return (
                  <button
                    key={clr}
                    type="button"
                    onClick={() => toggleItem(clr, selectedColors, setSelectedColors)}
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      active
                        ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                        : 'bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-primary)]'
                    }`}
                  >
                    {clr}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 max-w-sm">
              <input
                type="text"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                placeholder="Add custom color (e.g. Mustard)"
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
              />
              <button
                type="button"
                onClick={handleAddCustomColor}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--bg-secondary)] text-xs font-semibold text-[var(--text-primary)]"
              >
                + Add Color
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[54px] px-6 py-3.5 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>UPLOAD PRODUCT</span>
          </button>
        </form>
      )}

      {/* VIEW 4: MANAGE PRODUCTS (Sections 25 & 26) */}
      {view === 'MANAGE_PRODUCTS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
              Manage Products
            </h2>
            <button
              type="button"
              onClick={() => setView('UPLOAD_PRODUCT')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Upload Product</span>
            </button>
          </div>

          {products.length === 0 ? (
            <div className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-12 text-center space-y-3">
              <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
                No products uploaded yet.
              </p>
              <button
                type="button"
                onClick={() => setView('UPLOAD_PRODUCT')}
                className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
              >
                Upload Your First Product
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {products.map((product) => {
                const isAvailable = product.quantity > 0;
                return (
                  <div
                    key={product.productId}
                    className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 flex flex-col justify-between space-y-4 shadow-2xs"
                  >
                    <div className="flex gap-4">
                      <div className="w-24 h-32 rounded-2xl overflow-hidden bg-[var(--bg-secondary)] shrink-0">
                        <ResilientImage
                          src={product.thumbnails?.[0] || product.images[0] || ''}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex-1 space-y-1.5">
                        <div className="text-xs font-bold">
                          {isAvailable ? (
                            <span className="text-[var(--status-success)]">AVAILABLE</span>
                          ) : (
                            <span className="text-[var(--status-danger)]">OUT OF STOCK</span>
                          )}
                        </div>

                        <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
                          {product.name}
                        </h3>

                        <div className="font-mono-tabular text-lg font-bold text-[var(--accent-primary)]">
                          ₹{product.price.toLocaleString('en-IN')}
                        </div>

                        <div className="text-xs text-[var(--text-secondary)]">
                          Sizes: {product.sizes.join(', ')}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          Colors: {product.colors.join(', ')}
                        </div>
                      </div>
                    </div>

                    {/* Quantity Management (+ / -) */}
                    <div className="p-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        UPDATE QUANTITY
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={product.quantity <= 0}
                          onClick={() => handleQuantityStep(product.productId, -1)}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-center disabled:opacity-40"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <span className="w-10 text-center font-mono-tabular text-base font-bold text-[var(--text-primary)]">
                          {product.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleQuantityStep(product.productId, 1)}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-center"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Actions: EDIT, UPDATE COLORS, DELETE */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(product)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[var(--bg-secondary)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>EDIT / UPDATE COLORS</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          productService.deleteProduct(product.productId);
                          onRefreshData();
                          notify('Product deleted.');
                        }}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-red-500/10 text-xs font-semibold text-[var(--status-danger)] flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>DELETE</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 5: SHOP PROFILE */}
      {view === 'SHOP_PROFILE' && (
        <ShopProfileSetupPage
          shop={shop}
          onSaved={() => {
            onRefreshData();
            notify('Shop profile updated.');
            setView('HOME');
          }}
          onCancel={() => setView('HOME')}
        />
      )}

      {/* Complete Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  {/^DW-\d{8}-[A-Z0-9]{6}$/.test(selectedOrder.bookingId)
                    ? 'Booking ID'
                    : 'Verification Status'}
                </div>
                <h3 className="font-mono-tabular text-lg font-bold text-[var(--accent-primary)]">
                  {/^DW-\d{8}-[A-Z0-9]{6}$/.test(selectedOrder.bookingId)
                    ? selectedOrder.bookingId
                    : 'Awaiting Payment Verification'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--text-secondary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Status</span>
                <span className="font-bold text-[var(--text-primary)]">{selectedOrder.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Customer Name</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {selectedOrder.customerName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Mobile Number</span>
                <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                  {selectedOrder.customerMobile}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Product</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {selectedOrder.productName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Size & Color</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {selectedOrder.size} · {selectedOrder.color}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Quantity</span>
                <span className="font-mono-tabular font-semibold">{selectedOrder.quantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Price</span>
                <span className="font-mono-tabular font-bold text-[var(--accent-primary)]">
                  ₹{selectedOrder.price.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Booking Date</span>
                <span className="font-mono-tabular text-xs">
                  {new Date(selectedOrder.createdAt).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Pickup Deadline</span>
                <span className="font-mono-tabular text-xs font-semibold text-[var(--status-warning)]">
                  {new Date(selectedOrder.pickupDeadline).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={
                  (selectedOrder.bookingStatus || selectedOrder.status) !== 'CONFIRMED' &&
                  (selectedOrder.bookingStatus || selectedOrder.status) !== 'BOOKED'
                }
                onClick={() => handleMarkSold(selectedOrder.bookingId)}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40"
              >
                MARK SOLD
              </button>
              <button
                type="button"
                disabled={
                  (selectedOrder.bookingStatus || selectedOrder.status) !== 'CONFIRMED' &&
                  (selectedOrder.bookingStatus || selectedOrder.status) !== 'BOOKED'
                }
                onClick={() => handleMarkNotSold(selectedOrder.bookingId)}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-red-700 text-white text-xs font-semibold disabled:opacity-40"
              >
                MARK NOT SOLD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product / Update Quantity / Update Colors Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleSaveEditProduct}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                Edit Product & Colors
              </h3>
              <button type="button" onClick={() => setEditingProduct(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  required
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Price (₹)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Quantity</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Sizes</label>
                <div className="flex flex-wrap gap-1.5">
                  {STANDARD_SIZES.map((sz) => {
                    const active = editSizes.includes(sz);
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => toggleItem(sz, editSizes, setEditSizes)}
                        className={`min-h-[36px] px-3 py-1 rounded-lg border text-xs font-semibold ${
                          active
                            ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                            : 'bg-[var(--bg-primary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Colors</label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set([...STANDARD_COLORS, ...editColors])).map((clr) => {
                    const active = editColors.includes(clr);
                    return (
                      <button
                        key={clr}
                        type="button"
                        onClick={() => toggleItem(clr, editColors, setEditColors)}
                        className={`min-h-[36px] px-3 py-1 rounded-lg border text-xs font-semibold ${
                          active
                            ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                            : 'bg-[var(--bg-primary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        {clr}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={editCustomColor}
                    onChange={(e) => setEditCustomColor(e.target.value)}
                    placeholder="Add custom color..."
                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const c = editCustomColor.trim();
                      if (c && !editColors.includes(c)) {
                        setEditColors([...editColors, c]);
                        setEditCustomColor('');
                      }
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] text-xs font-semibold"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[44px] px-5 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
