import React, { useState } from 'react';
import {
  X,
  PowerOff,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  ExternalLink,
  Layers,
  Sparkles,
  Zap,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { WhatsAppAccount } from '../types/index.ts';

interface ReleaseAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: WhatsAppAccount | null;
  onSuccess?: () => void;
}

export const ReleaseAccountModal: React.FC<ReleaseAccountModalProps> = ({
  isOpen,
  onClose,
  account,
  onSuccess,
}) => {
  const { disconnectAndReleaseAccount, deregisterAccount, disconnectAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [releaseMode, setReleaseMode] = useState<'clean_deregister' | 'soft_disconnect'>('clean_deregister');
  const [loading, setLoading] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    released: boolean;
    metaNotice?: string;
  } | null>(null);

  if (!isOpen || !account) return null;

  const handleExecuteRelease = async () => {
    setLoading(true);
    try {
      if (releaseMode === 'clean_deregister') {
        const res = await disconnectAndReleaseAccount({
          accountId: account.id,
          phoneNumberId: account.phoneNumberId,
          wabaId: account.wabaId,
          customToken: account.customToken,
        });

        if (res.success) {
          setSuccessResult({
            released: true,
            metaNotice: res.message || 'Meta Cloud API se phone number successfully deregister aur unbind ho gaya.',
          });
          toast.showSuccess(
            'Number Released from Meta',
            `${account.displayPhoneNumber} Meta Cloud API se release aur deregister ho gaya hai.`
          );
          if (onSuccess) onSuccess();
        } else {
          toast.showError('Release Notice', res.error || 'Failed to deregister number from Meta');
        }
      } else {
        await disconnectAccount(account.id);
        setSuccessResult({
          released: true,
          metaNotice: 'Workspace me number disconnect aur pause kar diya gaya hai.',
        });
        toast.showWarning(
          'Account Disconnected',
          `${account.displayPhoneNumber} workspace me disconnect kar diya gaya hai.`
        );
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      toast.showError('Operation Failed', err?.message || 'Error executing disconnect/release');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSuccessResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 flex items-center justify-center">
              <PowerOff className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                  Release &amp; Disconnect Number
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold bg-neutral-200/80 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
                  {account.displayPhoneNumber}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {account.verifiedName || 'WhatsApp Account'} &bull; Phone ID: {account.phoneNumberId}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {successResult ? (
            /* Success & Reconnection Guidance */
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 space-y-2">
                <div className="flex items-center space-x-2.5 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Number Successfully Released &amp; Unlinked!</span>
                </div>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  {successResult.metaNotice ||
                    'Aapka number Meta Cloud API se successfully deregister ho chuka hai aur 2-Step PIN lock clear ho gaya hai.'}
                </p>
              </div>

              {/* Step-by-Step Coexistence Reconnect Guide */}
              <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="flex items-center space-x-2 font-bold text-xs text-neutral-900 dark:text-white">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Ab Coexistence Mode me bina kisi Error ke Dobara Kaise Connect Karein:</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <div>
                      <strong className="text-neutral-900 dark:text-white block font-semibold">
                        Apne Mobile me WhatsApp Business App Check Karein:
                      </strong>
                      <p className="text-neutral-600 dark:text-neutral-300 text-[11px] mt-0.5">
                        Physical phone par WhatsApp Business App open karein. Number ab poori tarah free hai. Agar pehle partner session atka hua tha, to ab physical app smoothly chalegi.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <div>
                      <strong className="text-neutral-900 dark:text-white block font-semibold">
                        &quot;Connect WhatsApp&quot; &gt; &quot;Coexistence Mode&quot; Chunein:
                      </strong>
                      <p className="text-neutral-600 dark:text-neutral-300 text-[11px] mt-0.5">
                        Dashboard par <strong>&quot;Connect WhatsApp&quot;</strong> button par click karein. Upar <strong>&quot;📱 Coexistence Mode&quot;</strong> card select karein.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <strong className="text-neutral-900 dark:text-white block font-semibold">
                        Meta Embedded Signup me Authorize Karein:
                      </strong>
                      <p className="text-neutral-600 dark:text-neutral-300 text-[11px] mt-0.5">
                        Meta popup me login karke apna number chunein. Ab koi bhi <em>&quot;Partner solution already registered&quot;</em> ya <em>&quot;Device limit&quot;</em> error nahi aayega! Number mobile app aur Cloud API dono me ek sath chalega.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Close &amp; Return to Accounts
                </button>
              </div>
            </div>
          ) : (
            /* Option Selection Form */
            <div className="space-y-4">
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                Jab aap kisi number ko Cloud API se disconnect karte hain, to Meta par uska 2-Step PIN lock aur partner link bana rehta hai. 
                Neeche diye gaye option se aap number ko **Meta se 100% clean release** kar sakte hain taaki Coexistence mode me koi error na aaye:
              </p>

              <div className="space-y-3">
                {/* Option 1: Full Clean Release & Deregister (Recommended) */}
                <label
                  onClick={() => setReleaseMode('clean_deregister')}
                  className={`p-4 rounded-2xl border-2 flex items-start space-x-3.5 cursor-pointer transition-all ${
                    releaseMode === 'clean_deregister'
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="releaseMode"
                    checked={releaseMode === 'clean_deregister'}
                    onChange={() => setReleaseMode('clean_deregister')}
                    className="mt-1 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-xs text-neutral-900 dark:text-white">
                        Full Clean Release &amp; Deregister from Meta
                      </span>
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                      Meta Cloud API endpoint (<code>/deregister</code>) call karke 2-Step PIN lock aur partner bindings ko completely reset karta hai. Iske baad dobara Coexistence mode connect karte waqt <strong>&quot;Partner solution error&quot;</strong> ya <strong>&quot;Linked device limit&quot;</strong> ka koi error nahi aayega.
                    </p>
                  </div>
                </label>

                {/* Option 2: Soft Disconnect Only */}
                <label
                  onClick={() => setReleaseMode('soft_disconnect')}
                  className={`p-4 rounded-2xl border-2 flex items-start space-x-3.5 cursor-pointer transition-all ${
                    releaseMode === 'soft_disconnect'
                      ? 'border-neutral-500 bg-neutral-50 dark:bg-neutral-800/40'
                      : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="releaseMode"
                    checked={releaseMode === 'soft_disconnect'}
                    onChange={() => setReleaseMode('soft_disconnect')}
                    className="mt-1 text-neutral-600 focus:ring-neutral-500"
                  />
                  <div className="flex-1 space-y-1">
                    <span className="font-bold text-xs text-neutral-900 dark:text-white block">
                      Soft Disconnect (Pause in Workspace Only)
                    </span>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      Sirf is dashboard par messages aur chatbot pause honge. Meta par registration aur PIN lock bana rahega.
                    </p>
                  </div>
                </label>
              </div>

              {/* Warning Notice */}
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-start space-x-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold text-[11px]">Note for Coexistence Mode Users:</span>
                  <p className="text-[11px] leading-relaxed">
                    Clean Release karne ke baad aapka number Meta Cloud API se free ho jayega. Uske baad jab aap dobara Embedded Signup karenge to Meta use fresh Coexistence mode me register karega jisse mobile app aur Cloud API dono smoothly synchronize rahenge.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleExecuteRelease}
                  disabled={loading}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Releasing on Meta...</span>
                    </>
                  ) : (
                    <>
                      <PowerOff className="w-4 h-4" />
                      <span>
                        {releaseMode === 'clean_deregister'
                          ? 'Deregister & Clean Release Number'
                          : 'Disconnect Number'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
