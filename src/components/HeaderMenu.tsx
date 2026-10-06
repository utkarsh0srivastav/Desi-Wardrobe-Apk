import React, { useState, useRef, useEffect } from 'react';
import {
  MoreVertical,
  ShoppingCart,
  Sun,
  Moon,
  ClipboardList,
  Settings,
  HelpCircle,
  Shield,
  FileText,
  Info,
  LogOut,
  UserCheck,
  Store,
  Home,
  Lock,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { AppEntryMode, Customer, Shopkeeper, ThemeMode } from '../types/models';
import { ActiveAdminSession } from '../utils/storage';
import { getCurrentLanguage, translations } from '../utils/i18n';
import { ActiveModalType, ModalSection } from './InfoModals';

export type { ActiveModalType, ModalSection };

interface HeaderMenuProps {
  mode: AppEntryMode | null;
  theme: ThemeMode;
  cartCount: number;
  loggedInCustomer: Customer | null;
  loggedInShopkeeper: Shopkeeper | null;
  loggedInAdmin: ActiveAdminSession | null;
  onToggleTheme: () => void;
  onOpenCart: () => void;
  onOpenOrders: () => void;
  onOpenCustomerLogin: () => void;
  onLogoutCustomer: () => void;
  onLogoutShopkeeper: () => void;
  onLogoutAdmin: () => void;
  onOpenAdminPortal?: () => void;
  onGoHome: () => void;
  onReturnToEntry: () => void;
  onOpenModal: (section: ModalSection) => void;
}

export const HeaderMenu: React.FC<HeaderMenuProps> = ({
  mode,
  theme,
  cartCount,
  loggedInCustomer,
  loggedInShopkeeper,
  loggedInAdmin,
  onToggleTheme,
  onOpenCart,
  onOpenOrders,
  onOpenCustomerLogin,
  onLogoutCustomer,
  onLogoutShopkeeper,
  onLogoutAdmin,
  onOpenAdminPortal,
  onGoHome,
  onReturnToEntry,
  onOpenModal,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const lang = getCurrentLanguage();
  const t = translations[lang];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-[var(--bg-card)]/95 backdrop-blur-md border-b border-[var(--border-subtle)] transition-colors">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        {/* Brand Logo & App Name */}
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-3 text-left group focus:outline-none"
        >
          <BrandLogo size="sm" />
          <div>
            <div className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] leading-none group-hover:text-[var(--accent-primary)] transition-colors">
              DESI WARDROBE
            </div>
            <div className="text-[11px] font-medium text-[var(--text-secondary)] mt-0.5">
              {mode === 'SHOPKEEPER'
                ? t.shopkeeperPortal
                : mode === 'ADMIN'
                  ? t.adminPortal
                  : t.localFashionMarketplace}
            </div>
          </div>
        </button>

        {/* Right Actions: Cart Icon (Customer mode) + Three-Dot Menu */}
        <div className="flex items-center gap-2">
          {mode === 'CUSTOMER' && (
            <button
              type="button"
              onClick={onOpenCart}
              aria-label="Open Cart"
              className="relative min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center gap-1.5 text-[var(--text-primary)] transition-colors"
            >
              <ShoppingCart className="w-5 h-5 text-[var(--accent-primary)]" />
              <span className="hidden sm:inline text-xs font-semibold">{t.cart}</span>
              {cartCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-lg bg-[var(--accent-primary)] text-white font-mono-tabular text-[11px] font-bold">
                  {cartCount}
                </span>
              )}
            </button>
          )}

          {/* Three-Dot Menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="More options"
              className="min-h-[44px] min-w-[44px] rounded-2xl bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)] transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl py-2 z-50 divide-y divide-[var(--border-subtle)]">
                {/* Active Account Status or Login Action */}
                <div className="px-3 py-2">
                  {mode === 'CUSTOMER' &&
                    (loggedInCustomer ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate">
                          <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {loggedInCustomer.name}
                          </div>
                          <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                            +91 {loggedInCustomer.mobile}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onLogoutCustomer();
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-red-500/10 text-[var(--status-danger)] text-xs font-semibold flex items-center gap-1"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>{t.logout}</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenCustomerLogin();
                        }}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-semibold flex items-center gap-2"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>{t.customerLoginRegister}</span>
                      </button>
                    ))}

                  {mode === 'SHOPKEEPER' && loggedInShopkeeper && (
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate">
                        <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {loggedInShopkeeper.name}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                          {loggedInShopkeeper.mobile}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onLogoutShopkeeper();
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-red-500/10 text-[var(--status-danger)] text-xs font-semibold flex items-center gap-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{t.logout}</span>
                      </button>
                    </div>
                  )}

                  {mode === 'ADMIN' && loggedInAdmin && (
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate">
                        <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                          Desi Wardrobe Admin
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          Verified Session
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onLogoutAdmin();
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-red-500/10 text-[var(--status-danger)] text-xs font-semibold flex items-center gap-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{t.logout}</span>
                      </button>
                    </div>
                  )}

                  {!mode && (
                    <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-2 py-1">
                      <Store className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span>Welcome to Desi Wardrobe</span>
                    </div>
                  )}
                </div>

                {/* Primary Menu Items */}
                <div className="py-1">
                  {mode !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onReturnToEntry();
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                    >
                      <Home className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span>{t.home}</span>
                    </button>
                  )}

                  {mode === 'CUSTOMER' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenOrders();
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                    >
                      <ClipboardList className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span>{t.myOrders}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onToggleTheme();
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center justify-between"
                  >
                    <span className="flex items-center gap-3">
                      {theme === 'dark' ? (
                        <Sun className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Moon className="w-4 h-4 text-[var(--accent-primary)]" />
                      )}
                      <span>{t.themeLabel}</span>
                    </span>
                    <span className="text-[11px] font-mono-tabular uppercase text-[var(--text-muted)]">
                      {theme}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenModal('SETTINGS');
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                  >
                    <Settings className="w-4 h-4 text-[var(--text-secondary)]" />
                    <span>{t.settings}</span>
                  </button>
                </div>

                {/* Informational Items (Customer menu NEVER contains Admin Portal) */}
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenModal('HELP');
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                  >
                    <HelpCircle className="w-4 h-4 text-[var(--text-secondary)]" />
                    <span>{t.helpSupport}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenModal('PRIVACY');
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                  >
                    <Shield className="w-4 h-4 text-[var(--text-secondary)]" />
                    <span>{t.privacyPolicy}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenModal('TERMS');
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                  >
                    <FileText className="w-4 h-4 text-[var(--text-secondary)]" />
                    <span>{t.termsConditions}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenModal('ABOUT');
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                  >
                    <Info className="w-4 h-4 text-[var(--text-secondary)]" />
                    <span>{t.aboutDesiWardrobe}</span>
                  </button>

                  {mode === null && onOpenAdminPortal && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenAdminPortal();
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] flex items-center gap-3"
                    >
                      <Lock className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span>{t.adminPortal}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
