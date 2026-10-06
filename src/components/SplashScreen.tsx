import React, { useEffect } from 'react';
import { BrandLogo } from './BrandLogo';

interface SplashScreenProps {
  onComplete: () => void;
}

/**
 * Splash Screen for DESI WARDROBE
 * - Shows original Indian local clothing shop logo
 * - Displays "DESI WARDROBE" & tagline "Your Local Fashion, All in One Place."
 * - Subtle zoom-in, slight zoom-out, fade, settles into position (~1.95s)
 * - Automatically opens Home screen without requiring any button press
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 1950);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)] px-6 select-none">
      <div className="animate-desi-splash flex flex-col items-center text-center max-w-sm">
        <div className="relative mb-6">
          <div className="absolute -inset-5 rounded-full bg-[var(--accent-soft)] blur-2xl" />
          <BrandLogo size="xl" className="relative shadow-lg" />
        </div>

        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[var(--text-primary)]">
          DESI WARDROBE
        </h1>

        <p className="mt-2.5 text-sm sm:text-base font-medium text-[var(--text-secondary)]">
          Your Local Fashion, All in One Place.
        </p>

        <div className="mt-8 w-24 h-0.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
          <div className="h-full w-full bg-[var(--accent-primary)] animate-pulse" />
        </div>
      </div>
    </div>
  );
};
