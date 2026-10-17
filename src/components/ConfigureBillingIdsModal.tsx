import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Copy, Check, Shield, CreditCard, Sparkles } from 'lucide-react';
import { WhatsAppAccount } from '../types/index.ts';
import { buildMetaBillingHubUrl } from '../utils/metaBilling.ts';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface ConfigureBillingIdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: WhatsAppAccount | null;
}

export const ConfigureBillingIdsModal: React.FC<ConfigureBillingIdsModalProps> = ({
  isOpen,
  onClose,
  account,
}) => {
  const { updateAccountBillingInfo } = useWhatsAppAccounts();
  const toast = useToast();

  const [portfolioId, setPortfolioId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (account) {
      setPortfolioId(account.businessPortfolioId || account.businessId || '');
      setPaymentAccountId(account.paymentAccountId || account.primaryFundingId || '');
      setWabaId(account.wabaId || '');
    }
  }, [account]);

  if (!isOpen || !account) return null;

  const currentGeneratedUrl = buildMetaBillingHubUrl({
    wabaId: wabaId || account.wabaId,
    businessPortfolioId: portfolioId,
    paymentAccountId: paymentAccountId,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wabaId.trim()) {
      toast.showError('Required', 'WABA ID is required');
      return;
    }

    setSaving(true);
    try {
      const res = await updateAccountBillingInfo(account.id, {
        businessPortfolioId: portfolioId.trim(),
        paymentAccountId: paymentAccountId.trim(),
        wabaId: wabaId.trim(),
      });

      if (res.success) {
        toast.showSuccess('Billing Details Saved', 'Your Meta Portfolio ID & Billing Link updated successfully.');
        onClose();
      } else {
        toast.showError('Save Failed', res.error || 'Failed to save billing IDs');
      }
    } catch (err: any) {
      toast.showError('Error', err?.message || 'Unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(currentGeneratedUrl);
    setCopied(true);
    toast.showSuccess('Copied', 'Direct Meta Billing Hub URL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-neutral-900 w-full max-w-lg rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Meta Billing IDs &amp; Link
              </h2>
              <p className="text-xs text-neutral-500">
                {account.verifiedName} ({account.displayPhoneNumber})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/60 text-xs text-neutral-600 dark:text-neutral-300">
            <p>
              Har customer ka apna <strong>Meta Business Portfolio ID</strong> aur <strong>WABA ID</strong> alag hota hai. Yaha aap IDs set kar sakte hain taaki 1-click button seedha aapka official Meta Billing Hub open kare.
            </p>
          </div>

          {/* WABA ID (asset_id) */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              WhatsApp Business Account ID (asset_id / WABA ID) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="e.g. 1828506441915068"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          {/* Business Portfolio ID (business_id) */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
              <span>Meta Business Portfolio ID (business_id)</span>
              <span className="text-[10px] text-neutral-400 font-normal">Customer Business ID</span>
            </label>
            <input
              type="text"
              value={portfolioId}
              onChange={(e) => setPortfolioId(e.target.value)}
              placeholder="e.g. 317148804460282"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Payment Account ID (payment_account_id) */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
              <span>Payment Account ID (payment_account_id - optional)</span>
              <span className="text-[10px] text-neutral-400 font-normal">Optional primary funding ID</span>
            </label>
            <input
              type="text"
              value={paymentAccountId}
              onChange={(e) => setPaymentAccountId(e.target.value)}
              placeholder="e.g. 2084063795550080"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Generated Customer Link Preview */}
          <div className="pt-2">
            <span className="block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
              Generated Meta Billing URL:
            </span>
            <div className="p-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 truncate select-all">
                {currentGeneratedUrl}
              </span>
              <div className="flex items-center space-x-1 shrink-0">
                <button
                  type="button"
                  onClick={copyUrl}
                  className="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 cursor-pointer transition-colors"
                  title="Copy direct billing URL"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={currentGeneratedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
                  title="Open and test billing URL in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save IDs'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
