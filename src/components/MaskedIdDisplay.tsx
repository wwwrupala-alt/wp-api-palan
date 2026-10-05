import React from 'react';

interface MaskedIdDisplayProps {
  value?: string | null;
  label?: string;
  className?: string;
  badgeClassName?: string;
  digitsToShow?: number; // default 1 (first & last digit)
}

/**
 * Masks sensitive IDs strictly for privacy:
 * Only first digit and last digit are visible, middle is completely hidden with bullets.
 * NO reveal/show or copy options for strict privacy.
 */
export function maskId(id?: string | null, digits: number = 1): string {
  if (!id) return '-';
  const str = String(id).trim();
  if (str.length <= digits * 2) return str;
  const first = str.slice(0, digits);
  const last = str.slice(-digits);
  return `${first}••••••••${last}`;
}

export const MaskedIdDisplay: React.FC<MaskedIdDisplayProps> = ({
  value,
  label,
  className = '',
  badgeClassName = '',
  digitsToShow = 1,
}) => {
  if (!value) {
    return <span className="text-neutral-400 font-mono text-xs">-</span>;
  }

  const cleanValue = String(value).trim();
  const masked = maskId(cleanValue, digitsToShow);

  return (
    <div
      className={`inline-flex items-center font-mono text-xs ${className}`}
      title={label ? `${label} (Protected)` : 'Protected ID'}
    >
      <span
        className={`tracking-tight select-none ${
          badgeClassName || 'text-neutral-800 dark:text-neutral-200'
        }`}
      >
        {masked}
      </span>
    </div>
  );
};
