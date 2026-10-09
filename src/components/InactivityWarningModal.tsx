import React from 'react';
import { Clock, LogOut, CheckCircle } from 'lucide-react';

interface InactivityWarningModalProps {
  isOpen: boolean;
  secondsRemaining: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

export const InactivityWarningModal: React.FC<InactivityWarningModalProps> = ({
  isOpen,
  secondsRemaining,
  onStayLoggedIn,
  onLogout,
}) => {
  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-amber-300 dark:border-amber-700/60 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-scaleIn">
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
            <Clock className="w-7 h-7 animate-pulse" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              Inactivity Timeout Warning
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              You have been inactive for almost 3 hours. For security reasons, your session will automatically end soon.
            </p>
          </div>

          <div className="py-3 px-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 inline-block">
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
              Auto Logout In
            </p>
            <p className="text-2xl font-mono font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
              {formattedTime}
            </p>
          </div>

          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Click <strong>Stay Logged In</strong> to continue your session, or you will be automatically redirected to login.
          </p>

          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-neutral-500" />
              <span>Log Out Now</span>
            </button>
            <button
              type="button"
              onClick={onStayLoggedIn}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center space-x-1.5 cursor-pointer hover:scale-105"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Stay Logged In</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
