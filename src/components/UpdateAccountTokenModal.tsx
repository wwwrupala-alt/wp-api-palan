import React, { useState } from 'react';
import {
  X,
  Key,
  Shield,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  HelpCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { WhatsAppAccount } from '../types/index.ts';

interface UpdateAccountTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: WhatsAppAccount | null;
  onSuccess?: () => void;
}

export const UpdateAccountTokenModal: React.FC<UpdateAccountTokenModalProps> = ({
  isOpen,
  onClose,
  account,
  onSuccess,
}) => {
  const { updateAccountToken, testMetaCredentials } = useWhatsAppAccounts();
  const toast = useToast();

  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{
    tested: boolean;
    success: boolean;
    phoneValid: boolean;
    wabaValid: boolean;
    templatesAccessible: boolean;
    errors: string[];
    resolutionHint?: string;
    detectedWabaId?: string;
  } | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  if (!isOpen || !account) return null;

  const handleTestToken = async () => {
    if (!tokenInput.trim()) {
      toast.showWarning('Token Required', 'Please enter a Meta Access Token to test.');
      return;
    }

    setTesting(true);
    setDiagnostics(null);
    try {
      const res = await testMetaCredentials({
        phoneNumberId: account.phoneNumberId,
        wabaId: account.wabaId,
        customToken: tokenInput.trim(),
      });

      const diag = res.diagnostics || {};
      setDiagnostics({
        tested: true,
        success: Boolean(res.success),
        phoneValid: Boolean(diag.phoneNumberValid),
        wabaValid: Boolean(diag.wabaValid),
        templatesAccessible: Boolean(diag.templatesAccessible),
        errors: diag.errors || (res.error ? [res.error] : []),
        resolutionHint: diag.resolutionHint || '',
        detectedWabaId: diag.detectedWabaId || '',
      });

      if (res.success && diag.templatesAccessible) {
        toast.showSuccess('Token Verified', 'Token has full access to this Phone and WABA message templates!');
      } else if (diag.phoneNumberValid && !diag.wabaValid) {
        toast.showWarning('WABA Access Issue', 'Phone verified, but WABA needs Asset Assignment in Meta Business Suite.');
      } else {
        toast.showWarning('Verification Warning', 'Check diagnostics below for details.');
      }
    } catch (err: any) {
      setDiagnostics({
        tested: true,
        success: false,
        phoneValid: false,
        wabaValid: false,
        templatesAccessible: false,
        errors: [err?.message || 'Failed to verify token with Meta Graph API.'],
      });
      toast.showError('Test Failed', err);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      toast.showWarning('Token Required', 'Please enter a Meta Access Token.');
      return;
    }

    setSaving(true);
    try {
      const res = await updateAccountToken(account.id, tokenInput.trim());
      if (res.success) {
        toast.showSuccess(
          'Access Token Updated',
          `Token updated for ${account.verifiedName || account.displayPhoneNumber}. Templates & campaigns will now use this token.`
        );
        if (onSuccess) onSuccess();
        onClose();
      } else {
        toast.showError('Update Failed', res.error || 'Failed to update token.');
      }
    } catch (err: any) {
      toast.showError('Update Failed', err);
    } finally {
      setSaving(false);
    }
  };

  const hasExistingCustomToken = Boolean(account.customToken);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-xl bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                Update Account Access Token
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Fix Meta permission (#200) &amp; set permanent system user token for {account.displayPhoneNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Account Identifiers summary */}
          <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Phone Number</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">{account.displayPhoneNumber}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">WABA ID</span>
              <span className="font-mono text-neutral-800 dark:text-neutral-200 truncate block">{account.wabaId}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Phone Number ID</span>
              <span className="font-mono text-neutral-800 dark:text-neutral-200 truncate block">{account.phoneNumberId}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Current Token Status</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>{hasExistingCustomToken ? 'Dedicated Token Active' : 'Default Server Token'}</span>
              </span>
            </div>
          </div>

          {/* Explanation Alert for Error #200 */}
          <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 text-xs space-y-2">
            <div className="flex items-center space-x-2 text-amber-800 dark:text-amber-300 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Kyu aata hai: &quot;(#200) You do not have permission to access this field&quot;?</span>
            </div>
            <p className="text-amber-700/90 dark:text-amber-300/80 text-[11.5px] leading-relaxed">
              Jab Meta Embedded Signup se user connect hota hai, to Meta us client ka WABA aapke Meta Business Portfolio me add karta hai. Agar aapke Meta App me <strong>Advanced Access</strong> nahi hai, ya System User ko us WABA ka <strong>Full Control</strong> asset assign nahi hua hai, to Meta templates read karne se mana kar deta hai.
            </p>
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="text-[11px] font-bold text-amber-800 dark:text-amber-200 underline flex items-center space-x-1 cursor-pointer pt-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showGuide ? 'Hide Step-by-Step Meta Setup Guide' : 'View Meta Business Manager Step-by-Step Fix Guide'}</span>
            </button>
          </div>

          {/* Guide Dropdown */}
          {showGuide && (
            <div className="p-4 rounded-2xl bg-neutral-100/80 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-xs space-y-3 animate-fadeIn">
              <h4 className="font-bold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>2 Tarike Is Issue Ko Solve Karne Ke:</span>
              </h4>

              <div className="space-y-2 text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
                  <strong className="text-emerald-700 dark:text-emerald-400 block mb-0.5">
                    Tarika 1: Permanent System User Token lagayein (100% Reliable):
                  </strong>
                  <ol className="list-decimal list-inside space-y-1 ml-1 text-neutral-600 dark:text-neutral-400">
                    <li>Meta Business Suite (<code>business.facebook.com</code>) &gt; Settings &gt; Users &gt; <strong>System Users</strong> me jayein.</li>
                    <li>System User select karein &gt; <strong>Add Assets</strong> &gt; WhatsApp Accounts &gt; is WABA ko select karein &gt; <strong>Full Control (Manage WhatsApp business account)</strong> ON karein.</li>
                    <li><strong>Generate New Token</strong> par click karein &gt; Scopes me <code>whatsapp_business_management</code> aur <code>whatsapp_business_messaging</code> select karein.</li>
                    <li>Token copy karke niche box me paste karein aur Save karein.</li>
                  </ol>
                </div>

                <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
                  <strong className="text-emerald-700 dark:text-emerald-400 block mb-0.5">
                    Tarika 2: Meta Developer App Permissions:
                  </strong>
                  <p className="text-neutral-600 dark:text-neutral-400">
                    Agar aapka app abhi Development Mode me hai, toh <code>developers.facebook.com</code> &gt; Roles &gt; Testers me jakar client ke Facebook profile ko tester invite karein. Production SaaS ke liye App Review me dono permissions ka <strong>Advanced Access</strong> approve karwayein.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSaveToken} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  New Meta Access Token (System User Permanent Token)
                </label>
                <a
                  href="https://business.facebook.com/settings/system-users"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
                >
                  <span>Open Meta System Users</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    setDiagnostics(null);
                  }}
                  placeholder="Paste EAAB... Permanent Access Token"
                  className="w-full pr-20 pl-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xs flex items-center space-x-1 cursor-pointer"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span className="text-[10px]">{showToken ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <p className="text-[10.5px] text-neutral-500 dark:text-neutral-400 mt-1">
                Must include <code>whatsapp_business_management</code> and <code>whatsapp_business_messaging</code> permissions.
              </p>
            </div>

            {/* Diagnostics Output */}
            {diagnostics && diagnostics.tested && (
              <div
                className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                  diagnostics.success && diagnostics.templatesAccessible
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}
              >
                <div className="flex items-center space-x-2 font-semibold">
                  {diagnostics.success && diagnostics.templatesAccessible ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>
                    {diagnostics.success && diagnostics.templatesAccessible
                      ? 'Token is 100% Valid and Authorized!'
                      : 'Permission or Token Verification Issue Detected'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-neutral-200/50 dark:border-neutral-700/50">
                  <div>
                    <span className="text-[10px] opacity-75 block">Phone Number ID</span>
                    <span className="font-semibold">{diagnostics.phoneValid ? '✅ Verified' : '❌ Failed'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] opacity-75 block">WABA Access</span>
                    <span className="font-semibold">{diagnostics.wabaValid ? '✅ Verified' : '❌ Failed'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] opacity-75 block">Templates (#200)</span>
                    <span className="font-semibold">{diagnostics.templatesAccessible ? '✅ Accessible' : '❌ Blocked #200'}</span>
                  </div>
                </div>

                {diagnostics.errors.length > 0 && (
                  <div className="text-[10.5px] space-y-1 pt-1">
                    {diagnostics.errors.map((err, i) => (
                      <p key={i} className="font-mono">{err}</p>
                    ))}
                  </div>
                )}

                {diagnostics.resolutionHint && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-[11px] leading-relaxed">
                    <strong className="block mb-0.5">💡 Solution / સમાધાન:</strong>
                    {diagnostics.resolutionHint}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleTestToken}
                disabled={testing || !tokenInput.trim()}
                className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>Test Permissions</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !tokenInput.trim()}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                  <span>Save &amp; Apply Token</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
