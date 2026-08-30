import React from 'react';
import { Globe, Building2 } from 'lucide-react';

interface CustomerAvatarProps {
  name?: string;
  companyName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isGlobal?: boolean;
  className?: string;
}

const GRADIENT_PALETTES = [
  'from-indigo-600 to-violet-700 border-indigo-400/30 text-white',
  'from-blue-600 to-cyan-600 border-blue-400/30 text-white',
  'from-emerald-600 to-teal-700 border-emerald-400/30 text-white',
  'from-amber-500 to-orange-600 border-amber-400/30 text-white',
  'from-rose-500 to-pink-600 border-rose-400/30 text-white',
  'from-purple-600 to-fuchsia-600 border-purple-400/30 text-white',
  'from-teal-500 to-emerald-600 border-teal-400/30 text-white',
  'from-sky-500 to-indigo-600 border-sky-400/30 text-white',
];

export function getCustomerInitials(companyName?: string, name?: string): string {
  const source = (companyName || name || '').trim();
  if (!source) return 'M';

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  }
  return source.slice(0, 2).toLocaleUpperCase('tr-TR');
}

export function getCustomerGradient(seed: string): string {
  if (!seed) return GRADIENT_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % GRADIENT_PALETTES.length;
  return GRADIENT_PALETTES[index];
}

export const CustomerAvatar: React.FC<CustomerAvatarProps> = ({
  name,
  companyName,
  size = 'sm',
  isGlobal = false,
  className = '',
}) => {
  const displayName = companyName || name || 'Müşteri';
  const initials = getCustomerInitials(companyName, name);
  const gradient = isGlobal
    ? 'from-indigo-600 via-blue-600 to-cyan-600 border-indigo-400/40 text-white'
    : getCustomerGradient(displayName);

  const sizeClasses = {
    xs: 'w-5 h-5 text-[9px] rounded-lg',
    sm: 'w-6 h-6 text-[10px] rounded-lg',
    md: 'w-8 h-8 text-xs rounded-xl',
    lg: 'w-10 h-10 text-sm rounded-2xl',
  }[size];

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  if (isGlobal) {
    return (
      <div
        className={`shrink-0 flex items-center justify-center bg-gradient-to-br shadow-sm border font-bold ${gradient} ${sizeClasses} ${className}`}
        title="Tüm Müşteriler (Genel Görünüm)"
      >
        <Globe className={`${iconSizes} text-white`} />
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 flex items-center justify-center bg-gradient-to-br shadow-sm border font-bold tracking-tight select-none ${gradient} ${sizeClasses} ${className}`}
      title={displayName}
    >
      <span>{initials}</span>
    </div>
  );
};
