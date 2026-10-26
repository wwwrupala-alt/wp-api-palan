import React, { useState } from 'react';
import {
  X,
  CreditCard,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Wallet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Plus,
  ArrowRight,
  TrendingDown,
  Info,
  Building2,
  FileText,
  DollarSign,
  Smartphone,
  Copy,
  Check,
} from 'lucide-react';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { WhatsAppAccount } from '../types/index.ts';

interface AccountBillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: WhatsAppAccount | null;
}

export const AccountBillingModal: React.FC<AccountBillingModalProps> = ({
  isOpen,
  onClose,
  account,
}) => {
  const { syncAccountWithMeta, logAccountRecharge, setPaymentMethodStatus } = useWhatsAppAccounts();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'payment' | 'verification' | 'rates'>('payment');
  const [rechargeAmount, setRechargeAmount] = useState<string>('1000');
  const [rechargeNote, setRechargeNote] = useState<string>('Meta Business Manager Recharge');
  const [isLoggingRecharge, setIsLoggingRecharge] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleTogglePaymentStatus = async (status: 'LINKED' | 'NOT_SET') => {
    if (!account) return;
    setIsUpdatingStatus(true);
    try {
      const res = await setPaymentMethodStatus(account.id, status);
      if (res.success) {
        toast.showSuccess(
          status === 'LINKED' ? 'Payment Method Status: ACTIVE' : 'Payment Status Reset',
          status === 'LINKED'
            ? 'Account marked as Payment Linked. You can now send campaigns.'
            : 'Payment status set to Action Required.'
        );
      } else {
        toast.showError('Update Failed', res.error || 'Failed to update payment status');
      }
    } catch (err: any) {
      toast.showError('Error', err?.message || 'Something went wrong');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (!isOpen || !account) return null;

  const isVerified =
    account.businessVerificationStatus === 'VERIFIED' ||
    ['TIER_1K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED'].includes(account.messagingLimitTier || '');

  const hasPaymentMethod =
    account.paymentMethodStatus === 'LINKED' ||
    Boolean(account.primaryFundingId) ||
    Boolean(account.prepaidBalance && account.prepaidBalance.amount > 0);

  const currency = account.currency || 'INR';
  const currencySymbol = currency === 'INR' ? '₹' : '$';

  const wabaPaymentUrl = `https://business.facebook.com/wa/manage/payment_methods/?waba_id=${encodeURIComponent(
    account.wabaId
  )}`;
  const metaBillingHubUrl = `https://business.facebook.com/billing_hub/payment_methods`;
  const metaInvoicesUrl = `https://business.facebook.com/billing_hub/accounts`;
  const metaVerificationUrl = account.businessPortfolioId
    ? `https://business.facebook.com/settings/security?business_id=${encodeURIComponent(
        account.businessPortfolioId
      )}`
    : `https://business.facebook.com/settings/security`;
  const metaWabaManagerUrl = `https://business.facebook.com/wa/manage/home/?waba_id=${encodeURIComponent(
    account.wabaId
  )}`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(label);
    toast.showSuccess('Copied to Clipboard', `${label} copied.`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSyncMeta = async () => {
    setIsSyncing(true);
    try {
      const res = await syncAccountWithMeta(account);
      if (res.success) {
        toast.showSuccess('Synced with Meta', 'Fetched latest Business Verification and Payment status.');
      } else {
        toast.showError('Sync Notice', res.error || 'Could not refresh Meta status.');
      }
    } catch (err: any) {
      toast.showError('Sync Failed', err?.message || 'Failed to sync with Meta.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(rechargeAmount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.showWarning('Invalid Amount', 'Please enter a valid recharge amount.');
      return;
    }

    if (!logAccountRecharge) {
      toast.showError('Error', 'Recharge logger not available.');
      return;
    }

    setIsLoggingRecharge(true);
    try {
      const res = await logAccountRecharge(account.id, parsed, currency, rechargeNote);
      if (res.success) {
        toast.showSuccess(
          'Recharge Logged',
          `Added ${currencySymbol}${parsed.toLocaleString()} to ${account.displayPhoneNumber} balance ledger.`
        );
        setRechargeAmount('');
      } else {
        toast.showError('Save Failed', res.error || 'Could not log recharge.');
      }
    } catch (err: any) {
      toast.showError('Error', err?.message || 'Failed to log recharge.');
    } finally {
      setIsLoggingRecharge(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                  Meta WhatsApp Billing & Portfolio Hub
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Official Meta Direct
                </span>
              </div>
              <p className="text-xs text-neutral-500 font-mono mt-0.5">
                {account.displayPhoneNumber} &bull; {account.verifiedName}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleSyncMeta}
              disabled={isSyncing}
              title="Refresh status from Meta Graph API"
              className="p-2 rounded-xl text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-neutral-200 dark:border-neutral-800 px-5 bg-white dark:bg-neutral-900 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('payment')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center space-x-2 shrink-0 cursor-pointer ${
              activeTab === 'payment'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Payment Method & Balance</span>
          </button>

          <button
            onClick={() => setActiveTab('verification')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center space-x-2 shrink-0 cursor-pointer ${
              activeTab === 'verification'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Business Portfolio Verification</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                isVerified
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {isVerified ? 'VERIFIED' : 'UNVERIFIED'}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('rates')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center space-x-2 shrink-0 cursor-pointer ${
              activeTab === 'rates'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Meta Message Rates (INR)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* TAB 1: Payment Method & Balance */}
          {activeTab === 'payment' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Status Banner */}
              <div
                className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  hasPaymentMethod
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      hasPaymentMethod
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                        {hasPaymentMethod ? 'Payment Method is Linked' : 'No Payment Method Linked'}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          hasPaymentMethod
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                        }`}
                      >
                        {hasPaymentMethod ? 'ACTIVE' : 'ACTION REQUIRED'}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {hasPaymentMethod
                        ? `Meta will charge conversation fees to your linked Payment Method or Prepaid Balance in ${currency}.`
                        : 'Meta requires adding a payment method (Debit/Credit Card or Prepaid Balance) to send broadcast campaigns.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  <a
                    href={wabaPaymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center justify-center space-x-2 shadow-xs transition-colors shrink-0"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>💳 Add / Recharge on Meta</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  {!hasPaymentMethod ? (
                    <button
                      type="button"
                      onClick={() => handleTogglePaymentStatus('LINKED')}
                      disabled={isUpdatingStatus}
                      className="px-3.5 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 font-semibold text-xs inline-flex items-center justify-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      title="If you already linked a card or paid on Meta, click here to mark status as active"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
                      <span>{isUpdatingStatus ? 'Saving...' : 'Mene Pay Kar Diya (Mark Active)'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleTogglePaymentStatus('NOT_SET')}
                      disabled={isUpdatingStatus}
                      className="px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-medium text-xs inline-flex items-center justify-center transition-colors cursor-pointer"
                      title="Reset payment status back to Action Required"
                    >
                      <span>Reset Status</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Direct Links to Meta Billing Hub */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 block">
                  Official Direct Meta Payment Links
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <a
                    href={wabaPaymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/40 hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-neutral-800 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <ExternalLink className="w-3.5 h-3.5 text-neutral-400 group-hover:text-emerald-600 transition-colors" />
                    </div>
                    <h5 className="font-bold text-xs text-neutral-900 dark:text-white mt-2">
                      WhatsApp Payment Settings
                    </h5>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Add Card or link Meta Line of Credit for WABA {account.wabaId.slice(-6)}
                    </p>
                  </a>

                  <a
                    href={metaBillingHubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/40 hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-neutral-800 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Wallet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <ExternalLink className="w-3.5 h-3.5 text-neutral-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                    <h5 className="font-bold text-xs text-neutral-900 dark:text-white mt-2">
                      Meta Billing Hub
                    </h5>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      View all Business Payment Methods, Prepaid Wallet & Auto-Debit Cards
                    </p>
                  </a>

                  <a
                    href={metaInvoicesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/40 hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-neutral-800 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <ExternalLink className="w-3.5 h-3.5 text-neutral-400 group-hover:text-purple-600 transition-colors" />
                    </div>
                    <h5 className="font-bold text-xs text-neutral-900 dark:text-white mt-2">
                      Invoices & GST Receipts
                    </h5>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Download official Meta monthly tax invoices & GST payment receipts
                    </p>
                  </a>
                </div>
              </div>

              {/* Explainer: Payment Issue Troubleshooting & Live Balance Guide */}
              <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/60 space-y-3.5">
                <div className="flex items-center space-x-2 text-amber-950 dark:text-amber-200">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="font-bold text-xs sm:text-sm">
                    ⚠️ Payment Kar Diya Fir Bhi Meta / WhatsApp Manager Me "Payment Issue" Kyu Aa Raha Hai?
                  </span>
                </div>

                <div className="text-xs text-amber-950/90 dark:text-amber-200/90 space-y-2.5 leading-relaxed">
                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-neutral-900/60 border border-amber-200 dark:border-amber-900/40">
                    <p className="font-bold text-neutral-900 dark:text-white">
                      1. Ad Account vs WhatsApp Account (Sabse Badi Wajah):
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-0.5">
                      Meta me <strong>Facebook Ads (Ad Account)</strong> ka balance alag hota hai aur <strong>WhatsApp Business Account (WABA)</strong> ka payment method alag hota hai! Agar aapne Ads Manager me paise daale hain, toh wo WhatsApp API messages ke liye use nahi hote. Aapko WhatsApp Account ke payment method me card ya prepaid wallet link karna hota hai.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-neutral-900/60 border border-amber-200 dark:border-amber-900/40">
                    <p className="font-bold text-neutral-900 dark:text-white">
                      2. Bank Auto-Debit Decline / Pending Settlement:
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-0.5">
                      Meta conversations ka bill auto-debit karta hai. Indian debit/credit card par OTP ya RBI limits ki wajah se agar Meta ka ₹50 ya ₹100 ka auto-cut ek baar bhi fail ho jaye, toh Meta status ko <strong>"Payment Issue"</strong> me daal deta hai. Neeche <em>"Meta Billing Hub"</em> link par jakar <strong>"Pay Now"</strong> click karke pending bill settle karein.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-neutral-900/60 border border-amber-200 dark:border-amber-900/40">
                    <p className="font-bold text-neutral-900 dark:text-white">
                      3. Bank Clearing Delay (1 se 4 Ghante):
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-0.5">
                      Agar aapne abhi payment kiya hai, toh Meta ke servers par update hone aur bank settlement complete hone me aamtaur par 1 se 4 ghante ka samay lag sakta hai.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-neutral-900/60 border border-amber-200 dark:border-amber-900/40">
                    <p className="font-bold text-neutral-900 dark:text-white">
                      4. App Me Status Sync Karna:
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-0.5">
                      Agar aapne Meta WhatsApp Manager me card/wallet link kar diya hai, toh upar <strong>"Mene Pay Kar Diya (Mark Active)"</strong> button dabayein ya <strong>"Sync with Meta"</strong> karein taaki app me status turant green active ho jaye.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={wabaPaymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition-colors"
                  >
                    <span>1. WhatsApp WABA Payment Settings</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={metaBillingHubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs transition-colors"
                  >
                    <span>2. Meta Billing Hub (Pay Pending Bill)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Local Balance & Recharge Tracker */}
              <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h5 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center space-x-1.5">
                      <Wallet className="w-4 h-4 text-emerald-600" />
                      <span>Workspace Balance & Recharge Tracker</span>
                    </h5>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Log your recent Meta recharges here to track estimated remaining funds inside the platform.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shrink-0">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">Logged Balance</span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      {currencySymbol}
                      {(account.prepaidBalance?.amount || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleAddRecharge} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                      Recharge Amount ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      value={rechargeAmount || ''}
                      onChange={(e) => setRechargeAmount(e.target.value)}
                      placeholder="e.g. 1000"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                      Note / Reference
                    </label>
                    <input
                      type="text"
                      value={rechargeNote || ''}
                      onChange={(e) => setRechargeNote(e.target.value)}
                      placeholder="e.g. Card Payment via Meta Hub"
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={isLoggingRecharge}
                      className="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{isLoggingRecharge ? 'Saving...' : 'Log Recharge'}</span>
                    </button>
                  </div>
                </form>

                {/* History */}
                {account.prepaidBalance?.rechargeHistory && account.prepaidBalance.rechargeHistory.length > 0 && (
                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700/60">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-2">
                      Recent Recharge Log
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {account.prepaidBalance.rechargeHistory.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-xs p-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 font-mono"
                        >
                          <div>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              +{currencySymbol}{item.amount.toLocaleString()}
                            </span>
                            <span className="text-neutral-500 font-sans ml-2 text-[11px]">
                              {item.note || 'Meta Recharge'}
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-sans">
                            {new Date(item.date).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Business Portfolio Verification */}
          {activeTab === 'verification' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Verification Card */}
              <div
                className={`p-5 rounded-2xl border space-y-4 ${
                  isVerified
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start space-x-3.5">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                        isVerified
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      {isVerified ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-base font-bold text-neutral-900 dark:text-white">
                          Business Portfolio Status: {isVerified ? 'VERIFIED' : 'UNVERIFIED'}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isVerified
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                          }`}
                        >
                          {isVerified ? 'Official Meta Verified' : 'Standard 250 Limit'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
                        {isVerified
                          ? 'Your Meta Business Portfolio is officially verified. Your WhatsApp account can send to 1,000, 10,000, or Unlimited unique customers per 24 hours.'
                          : 'Your Meta Business Portfolio is currently unverified. Meta restricts unverified accounts to 250 unique users per rolling 24 hours.'}
                      </p>
                    </div>
                  </div>

                  <a
                    href={metaVerificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs inline-flex items-center justify-center space-x-2 shadow-xs transition-colors shrink-0"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>{isVerified ? 'View Security Center' : 'Verify Business on Meta'}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Identifiers Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-neutral-200/60 dark:border-neutral-700/60 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                      Business Portfolio / Manager ID
                    </span>
                    <div className="flex items-center space-x-2 font-mono text-neutral-800 dark:text-neutral-200">
                      <span>{account.businessPortfolioId || account.businessId || 'WABA Owned'}</span>
                      {(account.businessPortfolioId || account.businessId) && (
                        <button
                          onClick={() => copyToClipboard(account.businessPortfolioId || account.businessId || '', 'Portfolio ID')}
                          className="text-neutral-400 hover:text-emerald-600 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                      WhatsApp Business Account (WABA)
                    </span>
                    <div className="flex items-center space-x-2 font-mono text-neutral-800 dark:text-neutral-200">
                      <span>{account.wabaId}</span>
                      <button
                        onClick={() => copyToClipboard(account.wabaId, 'WABA ID')}
                        className="text-neutral-400 hover:text-emerald-600 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* How to Verify Guide */}
              <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
                <h5 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Meta Business Portfolio Verify Kaise Karein? (Step-by-Step Guide)</span>
                </h5>

                <div className="space-y-3 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      1
                    </span>
                    <div>
                      <strong className="text-neutral-900 dark:text-white">Meta Security Center Open Karein:</strong>{' '}
                      Upar diye gaye &quot;Verify Business on Meta&quot; button par click karein ya{' '}
                      <code className="text-emerald-600 font-mono text-[11px]">business.facebook.com/settings/security</code>{' '}
                      par jayein.
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      2
                    </span>
                    <div>
                      <strong className="text-neutral-900 dark:text-white">Official Legal Documents Upload Karein:</strong>{' '}
                      Apne business ka GST Certificate, MSME Udyam Registration, ya Incorporation Certificate upload karein jisme business ka legal name aur address match ho.
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      3
                    </span>
                    <div>
                      <strong className="text-neutral-900 dark:text-white">Domain & Phone OTP Verification:</strong>{' '}
                      Website domain ya official business phone par aane wale OTP se verify karein.
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      4
                    </span>
                    <div>
                      <strong className="text-neutral-900 dark:text-white">Approval (24-48 Hours):</strong>{' '}
                      Meta verification approve hote hi aapka Daily Messaging Limit 250 se seedhe{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400">1,000 / 10,000 / Unlimited</strong> ho jayega!
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Rates Breakdown */}
          {activeTab === 'rates' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-blue-950 dark:text-blue-200 text-xs space-y-1">
                <h5 className="font-bold text-sm flex items-center space-x-1.5">
                  <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Meta Official WhatsApp Cloud API Pricing (India Rates)</span>
                </h5>
                <p className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">
                  Meta charges per delivered message template based on category. Customer replies within 24 hours are completely free.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Marketing Messages
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono">
                      ~₹0.88 - ₹0.90 / msg
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    Offers, promotions, discounts, product launches, newsletters, and festive greetings.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Utility Messages
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono">
                      ~₹0.11 / msg
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    Order confirmations, shipping updates, payment receipts, appointment reminders, and account alerts.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Authentication (OTP)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-mono">
                      ~₹0.11 / msg
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    One-time passwords (OTP) and login codes for two-factor verification.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Service (Incoming Customer Replies)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-mono">
                      FREE (₹0.00)
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    When a customer sends a message first, customer service replies within 24 hours are 100% free with no limit!
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-neutral-500 font-mono">
            WABA ID: <span className="font-semibold">{account.wabaId}</span>
          </div>

          <div className="flex items-center space-x-2">
            <a
              href={wabaPaymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center space-x-1.5 transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Go to Meta Billing Hub</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
