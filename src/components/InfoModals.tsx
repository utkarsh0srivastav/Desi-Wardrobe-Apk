import React from 'react';
import {
  X,
  Sun,
  Moon,
  FileText,
  CheckCircle2,
  Settings,
  HelpCircle,
  Shield,
  Info,
  Globe,
} from 'lucide-react';
import { ThemeMode } from '../types/models';
import { AppLanguage } from '../utils/i18n';

export type ActiveModalType =
  | 'SETTINGS'
  | 'HELP'
  | 'PRIVACY'
  | 'TERMS'
  | 'ABOUT'
  | 'THEME'
  | 'RULES'
  | null;
export type ModalSection = ActiveModalType;

interface InfoModalsProps {
  activeModal: ActiveModalType;
  onClose: () => void;
  theme: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
  language?: AppLanguage;
  onSelectLanguage?: (language: AppLanguage) => void;
}

export const InfoModals: React.FC<InfoModalsProps> = ({
  activeModal,
  onClose,
  theme,
  onSelectTheme,
  language = 'English',
  onSelectLanguage,
}) => {
  if (!activeModal) return null;

  const rulesList = [
    'Customers can book products online from listed local shops.',
    'Booked products remain reserved for 48 hours after payment verification.',
    'Customers must visit the shop within 48 hours to inspect and purchase the product.',
    'Minimum advance booking amount is ₹75 per unit via UPI.',
    'Remaining balance is paid directly at the shop during pickup.',
    'Prices may be Fixed Price or Bargaining Available depending on the shop/product.',
    'Shopkeepers are responsible for maintaining accurate product stock and details.',
    'Fake bookings or misuse of the platform may result in restriction of access.',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {(activeModal === 'THEME' || activeModal === 'SETTINGS') && (
              <Settings className="w-5 h-5 text-[var(--accent-primary)]" />
            )}
            {activeModal === 'HELP' && (
              <HelpCircle className="w-5 h-5 text-[var(--accent-primary)]" />
            )}
            {activeModal === 'PRIVACY' && (
              <Shield className="w-5 h-5 text-[var(--accent-primary)]" />
            )}
            {(activeModal === 'TERMS' || activeModal === 'RULES') && (
              <FileText className="w-5 h-5 text-[var(--accent-primary)]" />
            )}
            {activeModal === 'ABOUT' && (
              <Info className="w-5 h-5 text-[var(--accent-primary)]" />
            )}
            <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
              {activeModal === 'SETTINGS' && 'Settings & Language'}
              {activeModal === 'THEME' && 'Select Appearance'}
              {activeModal === 'HELP' && 'Help & Support'}
              {activeModal === 'PRIVACY' && 'Privacy Policy'}
              {activeModal === 'TERMS' && 'Terms & Conditions'}
              {activeModal === 'RULES' && 'Rules & Regulations'}
              {activeModal === 'ABOUT' && 'About Desi Wardrobe'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5 text-sm text-[var(--text-secondary)] leading-relaxed">
          {activeModal === 'SETTINGS' && (
            <div className="space-y-5">
              {/* Language Selection */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  <Globe className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>App Language / भाषा चुनें</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Choose your preferred language for Desi Wardrobe.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onSelectLanguage && onSelectLanguage('English')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      language === 'English'
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="font-bold text-sm text-[var(--text-primary)]">English</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Default</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectLanguage && onSelectLanguage('Hindi')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      language === 'Hindi'
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="font-bold text-sm text-[var(--text-primary)]">हिन्दी (Hindi)</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">भारतीय भाषा</div>
                  </button>
                </div>
              </div>

              {/* Theme Selection */}
              <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Theme Appearance
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectTheme('light')}
                    className={`p-3.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                      theme === 'light'
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-[var(--text-primary)]">Light Mode</div>
                      <div className="text-[10px] text-[var(--text-muted)]">Warm Cream</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectTheme('dark')}
                    className={`p-3.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                      theme === 'dark'
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <Moon className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                    <div>
                      <div className="font-bold text-xs text-[var(--text-primary)]">Dark Mode</div>
                      <div className="text-[10px] text-[var(--text-muted)]">Royal Maroon</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeModal === 'THEME' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Choose your preferred visual theme. Your choice is saved automatically on this device.
              </p>
              <div className="grid grid-cols-1 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onSelectTheme('light')}
                  className={`p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    theme === 'light'
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FAF6F0] border border-[#E6DCD2] flex items-center justify-center text-[#C81E3A]">
                      <Sun className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">Light Mode</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Cream background with deep red accents
                      </div>
                    </div>
                  </div>
                  {theme === 'light' && (
                    <span className="text-xs font-semibold text-[var(--accent-primary)]">Active</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onSelectTheme('dark')}
                  className={`p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    theme === 'dark'
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1F0B0E] border border-[#52292E] flex items-center justify-center text-[#E03E52]">
                      <Moon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">Dark Mode</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        Dark maroon background with warm brown cards
                      </div>
                    </div>
                  </div>
                  {theme === 'dark' && (
                    <span className="text-xs font-semibold text-[var(--accent-primary)]">Active</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {(activeModal === 'RULES' || activeModal === 'TERMS') && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
                Platform Guidelines &amp; 48-Hour Booking Policy
              </p>
              <ul className="space-y-2.5">
                {rulesList.map((rule, idx) => (
                  <li
                    key={idx}
                    className="p-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-start gap-2.5 text-xs text-[var(--text-primary)]"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeModal === 'HELP' && (
            <div className="space-y-3 text-xs text-[var(--text-primary)]">
              <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2">
                <div className="font-bold text-sm">How Desi Wardrobe Booking Works</div>
                <p className="text-[var(--text-secondary)]">
                  1. Browse approved local clothing shops within 100 KM of your location.
                </p>
                <p className="text-[var(--text-secondary)]">
                  2. Select your desired items and pay the ₹75 per unit advance booking fee via UPI.
                </p>
                <p className="text-[var(--text-secondary)]">
                  3. Upload your UPI payment screenshot for Admin verification.
                </p>
                <p className="text-[var(--text-secondary)]">
                  4. Once verified, visit the shop within 48 hours with your Booking ID to inspect and complete your purchase.
                </p>
              </div>
            </div>
          )}

          {activeModal === 'PRIVACY' && (
            <div className="space-y-3 text-xs text-[var(--text-primary)]">
              <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2">
                <div className="font-bold text-sm">Privacy &amp; Data Protection</div>
                <p className="text-[var(--text-secondary)]">
                  • Customer location is used strictly in real time to discover nearby shops within 100 KM and calculate accurate distance.
                </p>
                <p className="text-[var(--text-secondary)]">
                  • Shopkeeper personal mobile numbers are kept strictly confidential and are never exposed on public customer screens.
                </p>
                <p className="text-[var(--text-secondary)]">
                  • Payment verification screenshots are securely reviewed by Desi Wardrobe Admin and removed when bookings are deleted.
                </p>
              </div>
            </div>
          )}

          {activeModal === 'ABOUT' && (
            <div className="space-y-3 text-xs text-[var(--text-primary)]">
              <div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2">
                <div className="font-bold text-sm">Desi Wardrobe — Local Fashion Marketplace</div>
                <p className="text-[var(--text-secondary)]">
                  Desi Wardrobe connects local clothing stores with nearby shoppers. Discover Men&apos;s Wear, Women&apos;s Wear, and combined collections from verified local boutiques around you.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3.5 bg-[var(--bg-secondary)]/60 border-t border-[var(--border-subtle)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
