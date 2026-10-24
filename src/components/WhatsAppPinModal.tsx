import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, KeyRound, X, CheckCircle2 } from 'lucide-react';

interface WhatsAppPinModalProps {
  isOpen: boolean;
  onSuccess: (isMasterSession?: boolean) => void;
  onClose: () => void;
}

export const WhatsAppPinModal: React.FC<WhatsAppPinModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1646') {
      // Master Persistent PIN: Remains unlocked for whole session until user logs out
      sessionStorage.setItem('wa_numbers_master_unlocked', 'true');
      sessionStorage.setItem('wa_numbers_unlocked', 'true');
      setError('');
      onSuccess(true);
    } else if (pin === '4616') {
      // Standard PIN: Unlocks for this visit only; navigating away requires entering PIN again
      sessionStorage.removeItem('wa_numbers_master_unlocked');
      sessionStorage.setItem('wa_numbers_unlocked', 'true');
      setError('');
      onSuccess(false);
    } else {
      setError('Incorrect Security PIN. Please try again.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-900 dark:text-white text-base">
                Security PIN Required
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Enter 4-digit PIN to access WhatsApp Numbers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5 text-center">
              Enter 4-Digit PIN
            </label>
            <div className="relative">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoFocus
                value={pin}
                onChange={(e) => {
                  setError('');
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                }}
                placeholder="••••"
                className="w-full px-4 py-3 text-center tracking-[0.5em] text-2xl font-bold rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex space-x-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pin.length < 4}
              className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1.5 shadow-sm shadow-emerald-600/20"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Unlock Access</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
