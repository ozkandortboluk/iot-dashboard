import React from 'react';

interface NexusNodeLogoProps {
  variant?: 'full' | 'mark' | 'stacked' | 'compact';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showDomain?: boolean;
  animated?: boolean;
  className?: string;
  theme?: 'dark' | 'light' | 'auto';
}

export const NexusNodeLogo: React.FC<NexusNodeLogoProps> = ({
  variant = 'full',
  size = 'md',
  showDomain = false,
  animated = true,
  className = '',
  theme = 'auto',
}) => {
  // Dimensions
  const getIconSize = () => {
    switch (size) {
      case 'xs':
        return 'w-6 h-6';
      case 'sm':
        return 'w-8 h-8';
      case 'md':
        return 'w-10 h-10';
      case 'lg':
        return 'w-14 h-14';
      case 'xl':
        return 'w-20 h-20';
      default:
        return 'w-10 h-10';
    }
  };

  const getTitleSize = () => {
    switch (size) {
      case 'xs':
        return 'text-xs';
      case 'sm':
        return 'text-sm';
      case 'md':
        return 'text-base';
      case 'lg':
        return 'text-xl';
      case 'xl':
        return 'text-2xl sm:text-3xl';
      default:
        return 'text-base';
    }
  };

  const getDomainSize = () => {
    switch (size) {
      case 'xs':
        return 'text-[9px]';
      case 'sm':
        return 'text-[10px]';
      case 'md':
        return 'text-[11px]';
      case 'lg':
        return 'text-xs';
      case 'xl':
        return 'text-sm';
      default:
        return 'text-[11px]';
    }
  };

  const [imgError, setImgError] = React.useState(false);

  // SVG Mark Icon Component
  const MarkIcon = (
    <div className={`relative shrink-0 flex items-center justify-center ${getIconSize()}`}>
      {/* Outer Pulse Waves if animated */}
      {animated && (
        <>
          <span className="absolute inset-0 rounded-2xl bg-cyan-500/20 animate-ping opacity-40 pointer-events-none" />
          <span className="absolute -inset-1 rounded-2xl bg-indigo-500/15 blur-sm animate-pulse pointer-events-none" />
        </>
      )}

      {!imgError ? (
        <img
          src="/logos/logo-mark-transparent.png"
          alt="NexusNode IoT Logo"
          className="w-full h-full object-contain drop-shadow-md transition-transform duration-300 hover:scale-105"
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-md transition-transform duration-300 hover:scale-105"
        >
          <defs>
            <linearGradient id="nnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="45%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <linearGradient id="nnPlateGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>
            <filter id="nnGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Backplate */}
          <rect width="64" height="64" rx="15" fill="url(#nnPlateGrad)" />
          <rect
            width="64"
            height="64"
            rx="15"
            stroke="url(#nnGrad)"
            strokeWidth="1.75"
            strokeOpacity="0.6"
          />

          {/* Outer Hexagon Mesh */}
          <polygon
            points="32,9 51,20 51,44 32,55 13,44 13,20"
            fill="none"
            stroke="url(#nnGrad)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeOpacity="0.85"
          />

          {/* Connecting circuit lines */}
          <line x1="32" y1="32" x2="32" y2="9" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="2 2" strokeOpacity="0.9" />
          <line x1="32" y1="32" x2="51" y2="20" stroke="#818cf8" strokeWidth="1.5" strokeOpacity="0.85" />
          <line x1="32" y1="32" x2="51" y2="44" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.85" />
          <line x1="32" y1="32" x2="32" y2="55" stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="2 2" strokeOpacity="0.9" />
          <line x1="32" y1="32" x2="13" y2="44" stroke="#818cf8" strokeWidth="1.5" strokeOpacity="0.85" />
          <line x1="32" y1="32" x2="13" y2="20" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.85" />

          {/* Peripheral Nodes */}
          <circle cx="32" cy="9" r="3.2" fill="#06b6d4" filter="url(#nnGlow)" />
          <circle cx="51" cy="20" r="3.2" fill="#6366f1" filter="url(#nnGlow)" />
          <circle cx="51" cy="44" r="3.2" fill="#10b981" filter="url(#nnGlow)" />
          <circle cx="32" cy="55" r="3.2" fill="#06b6d4" filter="url(#nnGlow)" />
          <circle cx="13" cy="44" r="3.2" fill="#6366f1" filter="url(#nnGlow)" />
          <circle cx="13" cy="20" r="3.2" fill="#10b981" filter="url(#nnGlow)" />

          {/* Central Core Pulse Orb */}
          <circle cx="32" cy="32" r="7.5" fill="url(#nnGrad)" filter="url(#nnGlow)" />
          <circle cx="32" cy="32" r="3.2" fill="#ffffff" />
        </svg>
      )}
    </div>
  );

  if (variant === 'mark') {
    return <div className={`inline-flex items-center ${className}`}>{MarkIcon}</div>;
  }

  const textColor =
    theme === 'dark'
      ? 'text-white'
      : theme === 'light'
      ? 'text-slate-900'
      : 'text-slate-900 dark:text-white';

  const subtextColor =
    theme === 'dark'
      ? 'text-slate-400'
      : theme === 'light'
      ? 'text-slate-500'
      : 'text-slate-500 dark:text-slate-400';

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center text-center gap-3 ${className}`}>
        {MarkIcon}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5 font-extrabold tracking-tight">
            <span className={textColor}>Nexus</span>
            <span className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Node
            </span>
            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-mono border border-indigo-500/30 uppercase tracking-wider">
              IoT
            </span>
          </div>
          {showDomain && (
            <p className={`font-mono font-medium tracking-tight mt-0.5 ${getDomainSize()} ${subtextColor}`}>
              nexusnodeiot.com.tr
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {MarkIcon}
      <div className="flex flex-col justify-center min-w-0">
        <div className={`flex items-center gap-1.5 font-black tracking-tight leading-none ${getTitleSize()}`}>
          <span className={textColor}>Nexus</span>
          <span className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            Node
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-[9px] font-bold tracking-widest shadow-sm shadow-indigo-500/20">
            IoT
          </span>
        </div>
        {showDomain ? (
          <span className={`font-mono font-medium tracking-tight mt-1 truncate ${getDomainSize()} ${subtextColor}`}>
            nexusnodeiot.com.tr
          </span>
        ) : (
          <span className={`text-[10px] font-medium tracking-wider uppercase mt-1 truncate ${subtextColor}`}>
            Endüstriyel Telemetri Bulutu
          </span>
        )}
      </div>
    </div>
  );
};
