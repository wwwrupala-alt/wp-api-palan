import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2, Share2, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar' | 'login-banner' | 'compact';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running inside installed standalone app, suppress prompt
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      setInstalling(true);
      try {
        await install();
      } finally {
        setInstalling(false);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // In Chromium when beforeinstallprompt hasn't fired yet or is already available via browser menu
      alert('To install WABACLOUD:\n1. Tap the three dots (⋮) in Chrome\n2. Select "Install app" or "Add to Home Screen"');
    }
  };

  // If neither installable via prompt nor iOS, but user is on mobile browser, we can still show a helpful banner
  const isMobile = typeof window !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  if (!isInstallable && !isIOS && !isMobile) {
    return null;
  }

  return (
    <>
      {variant === 'login-banner' ? (
        <div className={`p-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3 ${className}`}>
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Download className="w-4 h-4" />
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                Install WABACLOUD App
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                Quick 1-tap home screen access
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            disabled={installing}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors shrink-0 cursor-pointer flex items-center space-x-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
        </div>
      ) : variant === 'sidebar' ? (
        <div className={`mx-3 mb-2 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-750 flex flex-col space-y-2 ${className}`}>
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-neutral-900 dark:text-white leading-tight">Install WABACLOUD</p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">Native app experience</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            disabled={installing}
            className="w-full py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isIOS ? 'Install on iOS' : 'Install App'}</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={installing}
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer ${className}`}
          title="Install WABACLOUD Progressive Web App"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      )}

      {/* iOS Safari Step-by-Step Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                <Smartphone className="w-4 h-4" />
                <span>Install on iPhone / iPad</span>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-600 dark:text-neutral-300">
              <p>Apple Safari me direct install button support nahi hota, isliye 2 asaan steps follow karein:</p>
              
              <div className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/70 border border-neutral-200 dark:border-neutral-700">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">1</span>
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-white">Share button tap karein</p>
                  <p className="text-[11px] text-neutral-500 flex items-center gap-1 mt-0.5">
                    Safari ke bottom bar me <Share2 className="w-3 h-3 text-blue-500 inline" /> icon dabayein.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/70 border border-neutral-200 dark:border-neutral-700">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">2</span>
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-white">Add to Home Screen select karein</p>
                  <p className="text-[11px] text-neutral-500 flex items-center gap-1 mt-0.5">
                    Menu ko scroll karke <PlusSquare className="w-3 h-3 text-emerald-500 inline" /> <strong>Add to Home Screen</strong> dabayein.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
            >
              Samajh Gaya (Close)
            </button>
          </div>
        </div>
      )}
    </>
  );
};
