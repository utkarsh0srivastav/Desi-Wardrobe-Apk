import React, { useState } from 'react';
import { X, User, Phone, Mail, Lock, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';
import { Customer } from '../types/models';
import { customerService } from '../services/customerService';

interface CustomerAuthModalProps {
  isOpen: boolean;
  currentCustomer: Customer | null;
  onClose: () => void;
  onAuthSuccess: (customer: Customer) => void;
  onLogout: () => void;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({
  isOpen,
  currentCustomer,
  onClose,
  onAuthSuccess,
  onLogout,
}) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleMobileChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 10);
    setMobile(clean);
    if (clean.length === 10) {
      const check = customerService.checkMobile(clean);
      if (check.isReturningCustomer) {
        setMode('LOGIN');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      if (mode === 'LOGIN') {
        const customer = await customerService.loginCustomerAsync(mobile, pin);
        onAuthSuccess(customer);
        onClose();
      } else {
        const customer = await customerService.registerCustomerAsync({
          name,
          mobile,
          email,
          pin,
          confirmPin,
        });
        onAuthSuccess(customer);
        onClose();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <User className="w-5 h-5 text-[var(--accent-primary)]" />
            <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
              {currentCustomer ? 'Customer Profile' : 'Customer Account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {currentCustomer ? (
          <div className="p-6 space-y-5">
            <div className="p-4 rounded-2xl bg-[var(--bg-secondary)]/70 border border-[var(--border-subtle)] space-y-2">
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                Signed In Customer
              </div>
              <div className="font-display text-2xl font-bold text-[var(--text-primary)]">
                {currentCustomer.name}
              </div>
              <div className="text-xs font-mono-tabular text-[var(--text-secondary)] flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>+91 {currentCustomer.mobile}</span>
              </div>
              {currentCustomer.email && (
                <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>{currentCustomer.email}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  customerService.logoutCustomer();
                  onLogout();
                  onClose();
                }}
                className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-[var(--status-danger)] text-xs font-semibold flex items-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[var(--bg-secondary)]">
              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  setErrorMsg(null);
                }}
                className={`min-h-[40px] rounded-xl text-xs font-semibold transition-all ${
                  mode === 'LOGIN'
                    ? 'bg-[var(--bg-card)] text-[var(--accent-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Returning Customer
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('REGISTER');
                  setErrorMsg(null);
                }}
                className={`min-h-[40px] rounded-xl text-xs font-semibold transition-all ${
                  mode === 'REGISTER'
                    ? 'bg-[var(--bg-card)] text-[var(--accent-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                First-Time Customer
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs font-semibold text-[var(--status-danger)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {mode === 'REGISTER' && (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Full Name <span className="text-[var(--accent-primary)]">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Mobile Number <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => handleMobileChange(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full min-h-[46px] pl-10 pr-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>

            {mode === 'REGISTER' && (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Email ID <span className="text-[var(--accent-primary)]">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                {mode === 'REGISTER' ? 'PIN (4-digit)' : 'PIN (4-digit)'}{' '}
                <span className="text-[var(--accent-primary)]">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full min-h-[46px] pl-10 pr-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-base tracking-widest text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>

            {mode === 'REGISTER' && (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  Confirm PIN <span className="text-[var(--accent-primary)]">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] font-mono-tabular text-base tracking-widest text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[50px] px-6 py-3 rounded-2xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{mode === 'LOGIN' ? 'LOGIN' : 'CREATE ACCOUNT & LOGIN'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
