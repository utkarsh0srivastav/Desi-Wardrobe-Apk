import React, { useState } from 'react';
import { Shirt } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

/**
 * ResilientImage enforces the Zero-Broken-Image Policy:
 * - Always specifies referrerPolicy="no-referrer" and descriptive alt text
 * - Renders a bespoke fashion textile fallback card if an image ever fails to load
 */
export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  className = '',
  fallbackLabel,
}) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[var(--bg-elevated)] text-[var(--text-secondary)] p-4 text-center select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="w-11 h-11 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mb-2">
          <Shirt className="w-5 h-5" />
        </div>
        <span className="text-xs font-medium line-clamp-2 max-w-[16ch]">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
      loading="lazy"
    />
  );
};
