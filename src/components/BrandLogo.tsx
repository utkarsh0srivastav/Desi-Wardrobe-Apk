import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

/**
 * Original Custom Logo for DESI WARDROBE
 * Visual Concept:
 * - A welcoming local Indian clothing shop with a scalloped boutique awning
 * - Clothes hanging/displayed inside the shop
 * - A shopkeeper welcoming inside behind the counter
 * - A customer standing outside admiring/buying clothes
 * Clean geometric line-art that scales from favicon/header size to splash screen centerpiece.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', className = '' }) => {
  const dimensions = {
    sm: 'w-9 h-9 rounded-xl',
    md: 'w-11 h-11 rounded-2xl',
    lg: 'w-16 h-16 rounded-2xl',
    xl: 'w-28 h-28 rounded-3xl',
  }[size];

  return (
    <div
      className={`inline-flex items-center justify-center bg-[var(--accent-primary)] text-[#FAF4EC] shadow-sm select-none shrink-0 ${dimensions} ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[82%] h-[82%]"
      >
        {/* Shop Roof & Scalloped Indian Bazaar Awning */}
        <path
          d="M12 22H52L56 30H8L12 22Z"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 30C8 33.5 11.5 35.5 16 35.5C20.5 35.5 24 33.5 24 30C24 33.5 27.5 35.5 32 35.5C36.5 35.5 40 33.5 40 30C40 33.5 43.5 35.5 48 35.5C52.5 35.5 56 33.5 56 30"
          stroke="#FDE68A"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Shop Frame & Base Ground Line */}
        <path
          d="M12 34V62M52 34V62M6 62H74"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* Hanging Garments Inside the Shop (Left Side Rack) */}
        <path
          d="M16 40H31"
          stroke="#FDE68A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Garment 1 (Kurta / Dress on Hanger) */}
        <path
          d="M20 40L17 45V53H23V45L20 40Z"
          fill="#FDE68A"
          fillOpacity="0.25"
          stroke="#FDE68A"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Garment 2 (Folded / Hanging Drape) */}
        <path
          d="M28 40L26 45V52H31V45L28 40Z"
          stroke="#FDE68A"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Shopkeeper Inside Behind Counter (Right Side of Shop) */}
        <circle cx="42" cy="43" r="3.5" stroke="currentColor" strokeWidth="2.4" />
        <path
          d="M36 53C36 49.8 38.7 48 42 48C45.3 48 48 49.8 48 53"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* Shop Counter */}
        <path
          d="M33 53H52"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />

        {/* Customer Standing Outside Looking / Buying Clothes */}
        <circle cx="64" cy="39" r="4" stroke="#FDE68A" strokeWidth="2.5" />
        <path
          d="M59 62V50C59 47.2 61.2 45.5 64 45.5C66.8 45.5 69 47.2 69 50V62"
          stroke="#FDE68A"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Customer Reaching Toward Shop Display */}
        <path
          d="M59 50L53 47"
          stroke="#FDE68A"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
