import React, { useState, useEffect, useCallback, useRef } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { MapPin, Settings, ArrowLeft } from 'lucide-react';
import { appConfig } from './config/appConfig';
import { SplashScreen } from './components/SplashScreen';
import { HeaderMenu } from './components/HeaderMenu';
import { InfoModals, ModalSection } from './components/InfoModals';
import { CustomerAuthModal } from './components/CustomerAuthModal';
import { EntryPage } from './pages/EntryPage';
import { CustomerHomePage } from './pages/customer/CustomerHomePage';
import { ShopProductsPage } from './pages/customer/ShopProductsPage';
import { ProductDetailsPage } from './pages/customer/ProductDetailsPage';
import { CustomerCartPage } from './pages/customer/CustomerCartPage';
import { CustomerBookingPage } from './pages/customer/CustomerBookingPage';
import { PaymentPage } from './pages/customer/PaymentPage';
import { BookingConfirmationPage } from './pages/customer/BookingConfirmationPage';
import { CustomerOrdersPage } from './pages/customer/CustomerOrdersPage';
import { ShopkeeperAuthPage } from './pages/shopkeeper/ShopkeeperAuthPage';
import { ShopkeeperDashboardPage } from './pages/shopkeeper/ShopkeeperDashboardPage';
import { AdminAuthPage } from './pages/admin/AdminAuthPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import {
  AppEntryMode,
  Booking,
  Customer,
  CustomerCoordinates,
  PaymentRecord,
  PendingCheckoutDraft,
  Product,
  Shop,
  Shopkeeper,
  ThemeMode,
} from './types/models';
import { ActiveAdminSession, storage } from './utils/storage';
import { AppLanguage } from './utils/i18n';
import { shopService } from './services/shopService';
import { productService } from './services/productService';
import { bookingService } from './services/bookingService';
import { paymentService } from './services/paymentService';
import { authService } from './services/authService';
import { customerService } from './services/customerService';
import { shopkeeperService } from './services/shopkeeperService';
import { adminService } from './services/adminService';
import { cartService, EnrichedCartItem } from './services/cartService';
import { locationService, LocationServiceError } from './services/locationService';

type AppRoute =
  | { view: 'ENTRY' }
  | { view: 'CUSTOMER_HOME' }
  | { view: 'SHOP_PRODUCTS'; shopId: string }
  | { view: 'PRODUCT_DETAILS'; productId: string }
  | { view: 'CUSTOMER_CART' }
  | {
      view: 'CUSTOMER_BOOKING';
      productId: string;
      size: string;
      color: string;
      quantity: number;
      fromCartItemId?: string;
    }
  | {
      view: 'CUSTOMER_PAYMENT';
      draft: PendingCheckoutDraft;
    }
  | { view: 'BOOKING_CONFIRMATION'; bookingRefs: string[] }
  | { view: 'CUSTOMER_ORDERS' }
  | { view: 'SHOPKEEPER_PORTAL' }
  | { view: 'ADMIN_PORTAL' };

type NativeDenialMode = 'INITIAL' | 'RETURNED_FROM_SETTINGS' | 'REOPENED' | null;

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>(() => storage.getTheme());
  const [language, setLanguage] = useState<AppLanguage>(
    () => (storage.getSettings().language === 'Hindi' ? 'Hindi' : 'English')
  );
  const [route, setRoute] = useState<AppRoute>({ view: 'ENTRY' });
  const [activeModal, setActiveModal] = useState<ModalSection>(null);
  const [showCustomerAuthModal, setShowCustomerAuthModal] = useState(false);

  const [shops, setShops] = useState<Shop[]>([]);
  const [shopkeepers, setShopkeepers] = useState<Shopkeeper[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [cartItems, setCartItems] = useState<EnrichedCartItem[]>([]);

  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [currentShopkeeper, setCurrentShopkeeper] = useState<Shopkeeper | null>(null);
  const [currentAdminSession, setCurrentAdminSession] = useState<ActiveAdminSession | null>(
    null
  );

  const [customerCoords, setCustomerCoords] = useState<CustomerCoordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    'IDLE' | 'LOADING' | 'GRANTED' | 'UNAVAILABLE'
  >('LOADING');
  const [locationError, setLocationError] = useState<LocationServiceError | null>(null);

  const [nativeDenialMode, setNativeDenialMode] = useState<NativeDenialMode>(null);
  const visitedSettingsRef = useRef(false);

  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  const syncData = useCallback(() => {
    setShops(shopService.getAllShops());
    setShopkeepers(shopkeeperService.getAllShopkeepers());
    setCustomers(customerService.getAllCustomers());
    setProducts(productService.getAllProducts());
    setBookings(bookingService.getAllBookings());
    setPayments(paymentService.getAllPayments());
    setCartItems(cartService.getEnrichedCart());
    setCurrentCustomer(customerService.getCurrentCustomer());
    setCurrentShopkeeper(authService.getCurrentShopkeeper());
    setCurrentAdminSession(adminService.getActiveAdminSession());
    setLanguage(storage.getSettings().language === 'Hindi' ? 'Hindi' : 'English');
  }, []);

  useEffect(() => {
    syncData();
    const unsubscribeStorage = storage.subscribe(syncData);
    return unsubscribeStorage;
  }, [syncData]);

  // Public & auth-bootstrap Firestore listeners (Shops, Products, Shopkeeper Pre-Registrations, Admin Config)
  useEffect(() => {
    const unsubShops = shopService.subscribeToActiveShops(() => syncData());
    const unsubProducts = productService.subscribeToProducts(() => syncData());
    const unsubShopkeepers = shopkeeperService.subscribeToShopkeepers(() => syncData());
    const unsubAdmin = adminService.subscribeToAdminAndSettings(() => syncData());

    return () => {
      unsubShops();
      unsubProducts();
      unsubShopkeepers();
      unsubAdmin();
    };
  }, [syncData]);

  // Strictly role-scoped listeners for Bookings, Payments, and Customer Register (Section 43 & 44)
  useEffect(() => {
    // 1. Authorized Admin: subscribe to all bookings, payments, and the full Customer Register
    if (currentAdminSession && currentAdminSession.pinVerified) {
      const unsubBookings = bookingService.subscribeToBookings(() => syncData());
      const unsubPayments = paymentService.subscribeToPayments(() => syncData());
      const unsubCustomers = customerService.subscribeToCustomers(() => syncData());
      return () => {
        unsubBookings();
        unsubPayments();
        unsubCustomers();
      };
    }

    // 2. Authenticated Customer: subscribe ONLY to this customer's own profile and own orders
    if (currentCustomer?.customerId) {
      const custId = currentCustomer.customerId;
      const unsubOwnProfile = customerService.subscribeToCurrentCustomer(custId, () =>
        syncData()
      );
      const unsubOwnBookings = bookingService.subscribeToCustomerBookings(
        custId,
        (ownBookings) => {
          storage.saveBookings(ownBookings);
          syncData();
        }
      );
      return () => {
        unsubOwnProfile();
        unsubOwnBookings();
      };
    }

    // 3. Authenticated Shopkeeper: subscribe ONLY to this shopkeeper's own shop orders
    if (currentShopkeeper?.shopId) {
      const unsubShopBookings = bookingService.subscribeToShopBookings(
        currentShopkeeper.shopId,
        (shopBookings) => {
          storage.saveBookings(shopBookings);
          syncData();
        }
      );
      return () => {
        unsubShopBookings();
      };
    }

    // 4. Unauthenticated user: do not subscribe to bookings, payments, or customer records
    return undefined;
  }, [
    currentAdminSession?.adminUid,
    currentAdminSession?.pinVerified,
    currentCustomer?.customerId,
    currentShopkeeper?.shopId,
    syncData,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    storage.saveTheme(theme);
  }, [theme]);

  const requestAutomaticCustomerLocation = useCallback(
    async (
      triggerSource: 'LAUNCH' | 'NAVIGATION' | 'FOREGROUND' | 'SETTINGS_RETURN' | 'RETRY'
    ) => {
      setLocationStatus((prev) =>
        triggerSource === 'RETRY' ? 'LOADING' : prev === 'GRANTED' ? 'GRANTED' : 'LOADING'
      );
      try {
        const coords = await locationService.getCurrentLocation();
        setCustomerCoords(coords);
        setLocationError(null);
        setLocationStatus('GRANTED');
        setNativeDenialMode(null);
        visitedSettingsRef.current = false;
      } catch (err) {
        setCustomerCoords(null);
        setLocationStatus('UNAVAILABLE');
        if (err instanceof LocationServiceError) {
          setLocationError(err);
        } else {
          setLocationError(
            new LocationServiceError({
              code: 'POSITION_UNAVAILABLE',
              permissionState: 'prompt',
              customerMessage:
                'Your current location could not be detected. Please check GPS/location services.',
              shopkeeperMessage:
                'Your current location could not be detected. Please check GPS/location services.',
            })
          );
        }

        if (locationService.isNativeAndroidApp()) {
          if (visitedSettingsRef.current || triggerSource === 'SETTINGS_RETURN') {
            setNativeDenialMode('RETURNED_FROM_SETTINGS');
          } else if (triggerSource === 'FOREGROUND') {
            setNativeDenialMode('REOPENED');
          } else {
            setNativeDenialMode('INITIAL');
          }
        }
      }
    },
    []
  );

  // Automatic location request on app launch & whenever entering Customer shop discovery
  useEffect(() => {
    if (!showSplash) {
      void requestAutomaticCustomerLocation('LAUNCH');
    }
  }, [showSplash, requestAutomaticCustomerLocation]);

  useEffect(() => {
    if (!showSplash && route.view === 'CUSTOMER_HOME') {
      void requestAutomaticCustomerLocation('NAVIGATION');
    }
  }, [showSplash, route.view, requestAutomaticCustomerLocation]);

  // Continuous live GPS watchPosition when location is granted
  useEffect(() => {
    if (locationStatus !== 'GRANTED') return;
    const stopWatching = locationService.watchCurrentLocation((coords) => {
      setCustomerCoords(coords);
      setLocationError(null);
      setLocationStatus('GRANTED');
    });
    return stopWatching;
  }, [locationStatus]);

  // Automatic location refresh when returning to foreground / changing browser permission
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const source = visitedSettingsRef.current ? 'SETTINGS_RETURN' : 'FOREGROUND';
        void requestAutomaticCustomerLocation(source);
      }
    };

    const unsubPermission = locationService.subscribeToPermissionChange((state) => {
      if (state === 'granted') {
        void requestAutomaticCustomerLocation('SETTINGS_RETURN');
      } else if (state === 'denied') {
        setCustomerCoords(null);
        setLocationStatus('UNAVAILABLE');
        setLocationError(
          new LocationServiceError({
            code: 'PERMISSION_DENIED',
            permissionState: 'denied',
            customerMessage: 'Location access is currently blocked for this preview/browser.',
            shopkeeperMessage: 'Location access is currently blocked for this preview/browser.',
          })
        );
      }
    });

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      unsubPermission();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [requestAutomaticCustomerLocation]);

  const currentMode: AppEntryMode | null =
    route.view === 'ENTRY'
      ? null
      : route.view === 'SHOPKEEPER_PORTAL'
        ? 'SHOPKEEPER'
        : route.view === 'ADMIN_PORTAL'
          ? 'ADMIN'
          : 'CUSTOMER';

  const maxRadiusKm = appConfig.getShopRadiusKm();
  const sortedPublicShopsWithinRadius = locationService.getPublicShopsSortedByDistance(
    shops,
    customerCoords,
    maxRadiusKm
  );

  // Retry Payment helper for rejected bookings
  const handleRetryPaymentForBooking = (booking: Booking) => {
    const shop = shopService.getShopById(booking.shopId);
    const product = products.find((p) => p.productId === booking.productId);
    const unitPrice = product ? product.price : Math.round(booking.price / booking.quantity);

    const draft = paymentService.createCheckoutDraft({
      customerId: booking.customerId,
      customerName: booking.customerName,
      customerMobile: booking.customerMobile,
      retryForBookingId: booking.bookingReference || booking.bookingId,
      items: [
        {
          productId: booking.productId,
          shopId: booking.shopId,
          shopkeeperId: booking.shopkeeperId,
          shopName: booking.shopName,
          shopLocationName: booking.shopLocationName || shop?.locationName || '',
          productName: booking.productName,
          productImage: booking.productImage,
          size: booking.size,
          color: booking.color,
          quantity: booking.quantity,
          unitPrice,
        },
      ],
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    setRoute({ view: 'CUSTOMER_PAYMENT', draft });
  };

  const renderMainScreen = () => {
    switch (route.view) {
      case 'ENTRY':
        return (
          <EntryPage
            onContinueAsCustomer={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({ view: 'CUSTOMER_HOME' });
            }}
            onOpenShopkeeperPortal={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({ view: 'SHOPKEEPER_PORTAL' });
            }}
            onOpenAdminPortal={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({ view: 'ADMIN_PORTAL' });
            }}
          />
        );

      case 'CUSTOMER_HOME':
        return (
          <CustomerHomePage
            shops={sortedPublicShopsWithinRadius}
            customerCoords={customerCoords}
            locationStatus={locationStatus}
            locationError={locationError}
            onRetryLocation={() => {
              void requestAutomaticCustomerLocation('RETRY');
            }}
            onSelectShop={(shopId) => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({ view: 'SHOP_PRODUCTS', shopId });
            }}
          />
        );

      case 'SHOP_PRODUCTS': {
        const shop = shopService.getCustomerPublicShopById(route.shopId);
        if (!shop || shop.shopStatus !== 'ACTIVE') {
          return (
            <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
              <p className="text-base font-semibold">
                This shop is currently unavailable or has been removed.
              </p>
              <button
                type="button"
                onClick={() => setRoute({ view: 'CUSTOMER_HOME' })}
                className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
              >
                Back to Shops
              </button>
            </div>
          );
        }

        const shopProducts = products.filter((p) => p.shopId === shop.shopId);
        return (
          <ShopProductsPage
            shop={shop}
            products={shopProducts}
            customerCoords={customerCoords}
            onUpdateCustomerCoords={(coords) => {
              setCustomerCoords(coords);
              setLocationStatus('GRANTED');
            }}
            onBack={() => setRoute({ view: 'CUSTOMER_HOME' })}
            onSelectProduct={(productId) => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({ view: 'PRODUCT_DETAILS', productId });
            }}
          />
        );
      }

      case 'PRODUCT_DETAILS': {
        const product = products.find((p) => p.productId === route.productId);
        const shop = product ? shopService.getCustomerPublicShopById(product.shopId) : undefined;
        if (!product || !shop || shop.shopStatus !== 'ACTIVE') {
          return (
            <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
              <p className="text-base font-semibold">Product is no longer available.</p>
              <button
                type="button"
                onClick={() => setRoute({ view: 'CUSTOMER_HOME' })}
                className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
              >
                Back to Shops
              </button>
            </div>
          );
        }

        return (
          <ProductDetailsPage
            product={product}
            shop={shop}
            onBack={() => setRoute({ view: 'SHOP_PRODUCTS', shopId: shop.shopId })}
            onCartUpdated={syncData}
            onOpenCart={() => setRoute({ view: 'CUSTOMER_CART' })}
            onProceedToBooking={(selection) => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({
                view: 'CUSTOMER_BOOKING',
                productId: selection.productId,
                size: selection.size,
                color: selection.color,
                quantity: selection.quantity,
              });
            }}
          />
        );
      }

      case 'CUSTOMER_CART':
        return (
          <CustomerCartPage
            items={cartItems}
            loggedInCustomer={currentCustomer}
            onRequestCustomerLogin={() => setShowCustomerAuthModal(true)}
            onBackToShops={() => setRoute({ view: 'CUSTOMER_HOME' })}
            onCartUpdated={syncData}
            onBookSingleCartItem={(item) => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({
                view: 'CUSTOMER_BOOKING',
                productId: item.productId,
                size: item.size,
                color: item.color,
                quantity: Math.min(item.quantity, item.product.quantity),
                fromCartItemId: item.cartItemId,
              });
            }}
            onProceedToPayment={(draft) => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({ view: 'CUSTOMER_PAYMENT', draft });
            }}
          />
        );

      case 'CUSTOMER_BOOKING': {
        const product = products.find((p) => p.productId === route.productId);
        const shop = product ? shopService.getCustomerPublicShopById(product.shopId) : undefined;
        if (!product || !shop) {
          return (
            <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
              <p className="text-base font-semibold">Product not found.</p>
              <button
                type="button"
                onClick={() => setRoute({ view: 'CUSTOMER_HOME' })}
                className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] text-white text-xs font-semibold"
              >
                Back to Shops
              </button>
            </div>
          );
        }

        return (
          <CustomerBookingPage
            product={product}
            shop={shop}
            initialSize={route.size}
            initialColor={route.color}
            initialQuantity={route.quantity}
            loggedInCustomer={currentCustomer}
            onRequestCustomerLogin={() => setShowCustomerAuthModal(true)}
            onBack={() =>
              route.fromCartItemId
                ? setRoute({ view: 'CUSTOMER_CART' })
                : setRoute({ view: 'PRODUCT_DETAILS', productId: product.productId })
            }
            onProceedToPayment={(draft) => {
              if (route.fromCartItemId) {
                draft.items[0].fromCartItemId = route.fromCartItemId;
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({ view: 'CUSTOMER_PAYMENT', draft });
            }}
          />
        );
      }

      case 'CUSTOMER_PAYMENT':
        return (
          <PaymentPage
            draft={route.draft}
            onBack={() => setRoute({ view: 'CUSTOMER_HOME' })}
            onPaymentProofSubmitted={(result) => {
              // Remove booked items from cart if booked from cart
              for (const item of route.draft.items) {
                if (item.fromCartItemId) {
                  cartService.removeCartItem(item.fromCartItemId);
                }
              }
              syncData();
              const refs = result.bookings.map((b) => b.bookingReference || b.bookingId);
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setRoute({ view: 'BOOKING_CONFIRMATION', bookingRefs: refs });
            }}
          />
        );

      case 'BOOKING_CONFIRMATION': {
        if (!currentCustomer) {
          return (
            <CustomerOrdersPage
              loggedInCustomer={null}
              onRequestCustomerLogin={() => setShowCustomerAuthModal(true)}
              onRetryPayment={handleRetryPaymentForBooking}
              onBackToShops={() => setRoute({ view: 'CUSTOMER_HOME' })}
            />
          );
        }
        const liveBookings = bookings.filter(
          (b) =>
            b.customerId === currentCustomer.customerId &&
            (route.bookingRefs.includes(b.bookingId) ||
              (b.bookingReference && route.bookingRefs.includes(b.bookingReference)))
        );
        return (
          <BookingConfirmationPage
            bookings={liveBookings}
            onRetryPayment={handleRetryPaymentForBooking}
            onViewMyOrders={() => setRoute({ view: 'CUSTOMER_ORDERS' })}
            onExploreMoreShops={() => setRoute({ view: 'CUSTOMER_HOME' })}
          />
        );
      }

      case 'CUSTOMER_ORDERS':
        return (
          <CustomerOrdersPage
            loggedInCustomer={currentCustomer}
            onRequestCustomerLogin={() => setShowCustomerAuthModal(true)}
            onRetryPayment={handleRetryPaymentForBooking}
            onBackToShops={() => setRoute({ view: 'CUSTOMER_HOME' })}
          />
        );

      case 'SHOPKEEPER_PORTAL': {
        const skShop = currentShopkeeper
          ? shopService.getShopById(currentShopkeeper.shopId) ||
            shopService.getShopByShopkeeperId(currentShopkeeper.shopkeeperId)
          : undefined;

        if (!currentShopkeeper || !skShop || currentShopkeeper.profileStatus !== 'COMPLETED') {
          return (
            <ShopkeeperAuthPage
              onBackToEntry={() => setRoute({ view: 'ENTRY' })}
              onSuccess={(sk) => {
                syncData();
                setCurrentShopkeeper(sk);
              }}
            />
          );
        }

        const skProducts = products.filter((p) => p.shopId === skShop.shopId);
        const skBookings = bookings.filter((b) => b.shopId === skShop.shopId);

        return (
          <ShopkeeperDashboardPage
            shopkeeper={currentShopkeeper}
            shop={skShop}
            products={skProducts}
            bookings={skBookings}
            onLogout={() => {
              authService.logout();
              syncData();
              setRoute({ view: 'ENTRY' });
            }}
            onRefreshData={syncData}
          />
        );
      }

      case 'ADMIN_PORTAL': {
        if (!currentAdminSession) {
          return (
            <AdminAuthPage
              onBackToEntry={() => setRoute({ view: 'ENTRY' })}
              onSuccess={(session) => {
                setCurrentAdminSession(session);
                syncData();
              }}
            />
          );
        }

        return (
          <AdminDashboardPage
            session={currentAdminSession}
            shops={shops}
            shopkeepers={shopkeepers}
            customers={customers}
            products={products}
            bookings={bookings}
            payments={payments}
            onRefreshData={syncData}
            onLogout={() => {
              void adminService.logoutAdmin();
              setCurrentAdminSession(null);
              syncData();
              setRoute({ view: 'ENTRY' });
            }}
          />
        );
      }
    }
  };

  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <APIProvider apiKey={googleMapsApiKey} language="en" region="IN">
      <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
        {gmpQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

        <HeaderMenu
          mode={currentMode}
          theme={theme}
          cartCount={totalCartCount}
          loggedInCustomer={currentCustomer}
          loggedInShopkeeper={currentShopkeeper}
          loggedInAdmin={currentAdminSession}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          onOpenCart={() => setRoute({ view: 'CUSTOMER_CART' })}
          onOpenOrders={() => setRoute({ view: 'CUSTOMER_ORDERS' })}
          onOpenCustomerLogin={() => setShowCustomerAuthModal(true)}
          onLogoutCustomer={() => {
            customerService.logoutCustomer();
            setCurrentCustomer(null);
            syncData();
            setRoute({ view: 'ENTRY' });
          }}
          onLogoutShopkeeper={() => {
            authService.logout();
            setCurrentShopkeeper(null);
            syncData();
            setRoute({ view: 'ENTRY' });
          }}
          onLogoutAdmin={() => {
            void adminService.logoutAdmin();
            setCurrentAdminSession(null);
            syncData();
            setRoute({ view: 'ENTRY' });
          }}
          onOpenAdminPortal={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setRoute({ view: 'ADMIN_PORTAL' });
          }}
          onGoHome={() => {
            if (currentMode === 'CUSTOMER') {
              setRoute({ view: 'CUSTOMER_HOME' });
            } else if (currentMode === 'SHOPKEEPER') {
              setRoute({ view: 'SHOPKEEPER_PORTAL' });
            } else if (currentMode === 'ADMIN') {
              setRoute({ view: 'ADMIN_PORTAL' });
            } else {
              setRoute({ view: 'ENTRY' });
            }
          }}
          onReturnToEntry={() => setRoute({ view: 'ENTRY' })}
          onOpenModal={(section) => setActiveModal(section)}
        />

        <main className="flex-1">{renderMainScreen()}</main>

        {/* Native Android APK Permission Denied Modal */}
        {nativeDenialMode && locationService.isNativeAndroidApp() && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 text-center space-y-5 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
                <MapPin className="w-6 h-6" />
              </div>

              <div className="space-y-1.5">
                <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
                  {nativeDenialMode === 'RETURNED_FROM_SETTINGS'
                    ? 'Please enable location access to continue.'
                    : nativeDenialMode === 'REOPENED'
                      ? 'Enable Location to use Desi Wardrobe'
                      : 'Location permission is required to use Desi Wardrobe.'}
                </h3>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    visitedSettingsRef.current = true;
                    locationService.openNativeAppLocationSettings();
                  }}
                  className="w-full min-h-[46px] px-5 py-2.5 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>GO TO SETTINGS</span>
                </button>

                {nativeDenialMode === 'INITIAL' && (
                  <button
                    type="button"
                    onClick={() => {
                      setNativeDenialMode(null);
                      setRoute({ view: 'ENTRY' });
                    }}
                    className="w-full min-h-[44px] px-5 py-2 rounded-2xl border border-[var(--border-subtle)] text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-center gap-2 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>BACK</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-card)] py-6 px-4 text-xs text-[var(--text-muted)]">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm text-[var(--text-primary)]">
                DESI WARDROBE
              </span>
              <span aria-hidden="true">·</span>
              <span>Your Local Fashion, All in One Place.</span>
            </div>
          </div>
        </footer>

        <InfoModals
          activeModal={activeModal}
          onClose={() => setActiveModal(null)}
          theme={theme}
          onSelectTheme={(nextTheme) => setTheme(nextTheme)}
          language={language}
          onSelectLanguage={(nextLang) => {
            const currentSettings = storage.getSettings();
            storage.saveSettings({
              ...currentSettings,
              language: nextLang,
            });
            setLanguage(nextLang);
          }}
        />

        <CustomerAuthModal
          isOpen={showCustomerAuthModal}
          currentCustomer={currentCustomer}
          onClose={() => setShowCustomerAuthModal(false)}
          onAuthSuccess={(customer) => {
            setCurrentCustomer(customer);
            syncData();
          }}
          onLogout={() => {
            customerService.logoutCustomer();
            setCurrentCustomer(null);
            syncData();
            setRoute({ view: 'ENTRY' });
          }}
        />
      </div>
    </APIProvider>
  );
}
