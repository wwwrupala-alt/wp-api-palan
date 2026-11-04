import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  CreditCard,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Sliders,
  DollarSign,
  Search,
  Filter,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  RotateCcw,
  Trash2,
  Clock,
  Settings2,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  fetchWalletInfo,
  rechargeWalletApi,
  updatePricingApi,
  resetWalletApi,
  clearWalletTransactionsApi,
  deleteWalletTransactionApi,
  updateWalletAutoDeleteApi,
  purgeWalletOldTransactionsApi,
} from '../lib/services.ts';
import { CategoryPricing, WalletAccount, WalletTransaction } from '../types/index.ts';

export const WalletPage: React.FC = () => {
  const { userProfile, organization, isMasterAdmin, isAdmin } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [pricing, setPricing] = useState<CategoryPricing>({
    marketingRate: 0.88,
    utilityRate: 0.115,
    authenticationRate: 0.115,
    serviceRate: 0.0,
    currency: 'INR',
  });
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  // Recharge Modal State
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState<string>('1000');
  const [rechargeNote, setRechargeNote] = useState<string>('Meta Prepaid Recharge');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [isRecharging, setIsRecharging] = useState(false);

  // Reset & Reconcile Modal State (00 Fresh State)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetMode, setResetMode] = useState<'zero' | 'custom'>('zero');
  const [customBalanceInput, setCustomBalanceInput] = useState<string>('0');
  const [resetReason, setResetReason] = useState<string>('Reconciliation with Meta Business Portfolio balance');
  const [resetCounters, setResetCounters] = useState<boolean>(true);
  const [resetClearHistory, setResetClearHistory] = useState<boolean>(true); // Reset entries below
  const [isResetting, setIsResetting] = useState(false);

  // Auto-Delete Feature State (Auto-Delete older than X days)
  const [isAutoDeleteModalOpen, setIsAutoDeleteModalOpen] = useState(false);
  const [autoDeleteDays, setAutoDeleteDays] = useState<number>(30);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState<boolean>(true);
  const [isSavingAutoDelete, setIsSavingAutoDelete] = useState(false);
  const [isPurgingNow, setIsPurgingNow] = useState(false);

  // Clear History Modal State
  const [isClearHistoryModalOpen, setIsClearHistoryModalOpen] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  // Single transaction delete
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);

  // Master Admin Pricing Edit State
  const [editMarketing, setEditMarketing] = useState<string>('0.88');
  const [editUtility, setEditUtility] = useState<string>('0.115');
  const [editAuth, setEditAuth] = useState<string>('0.115');
  const [editService, setEditService] = useState<string>('0.00');
  const [isSavingPricing, setIsSavingPricing] = useState(false);

  // Filter & Pagination for Transactions
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const currentOrgId = organization?.id || 'org_master_platform';

  const loadWalletData = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      const data = await fetchWalletInfo(currentOrgId, userProfile?.uid);
      if (data.account) {
        setAccount(data.account);
        setAutoDeleteDays(typeof data.account.autoDeleteDays === 'number' ? data.account.autoDeleteDays : 30);
        setAutoDeleteEnabled(data.account.autoDeleteEnabled !== false);
      }
      if (data.pricing) {
        setPricing(data.pricing);
        setEditMarketing(String(data.pricing.marketingRate ?? 0.88));
        setEditUtility(String(data.pricing.utilityRate ?? 0.115));
        setEditAuth(String(data.pricing.authenticationRate ?? 0.115));
        setEditService(String(data.pricing.serviceRate ?? 0.0));
      }
      if (data.transactions) setTransactions(data.transactions);
    } catch (err: any) {
      toast.showError('Wallet Error', err?.message || 'Could not load wallet data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, [currentOrgId, userProfile?.uid]);

  const handleRechargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(rechargeAmount);
    if (!num || num <= 0) {
      toast.showWarning('Invalid Amount', 'Please enter a valid recharge amount.');
      return;
    }

    setIsRecharging(true);
    try {
      const res = await rechargeWalletApi({
        organizationId: currentOrgId,
        userId: userProfile?.uid,
        amount: num,
        note: rechargeNote.trim() || 'Prepaid Wallet Funds Added',
        paymentReference: paymentRef.trim() || undefined,
      });

      toast.showSuccess('Funds Added!', `₹${num.toFixed(2)} credited to your wallet balance.`);
      setIsRechargeModalOpen(false);
      setPaymentRef('');
      if (res.account) setAccount(res.account);
      if (res.transaction) setTransactions((prev) => [res.transaction, ...prev]);
    } catch (err: any) {
      toast.showError('Recharge Error', err?.message || 'Could not add funds to wallet.');
    } finally {
      setIsRecharging(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBalance = resetMode === 'zero' ? 0 : Number(customBalanceInput);
    if (isNaN(targetBalance) || targetBalance < 0) {
      toast.showWarning('Invalid Balance', 'Please enter a valid non-negative balance.');
      return;
    }

    setIsResetting(true);
    try {
      const res = await resetWalletApi({
        organizationId: currentOrgId,
        userId: userProfile?.uid,
        newBalance: targetBalance,
        reason: resetReason.trim() || 'Meta Business Portfolio Balance Reconciliation',
        resetCounters,
        clearHistory: resetClearHistory,
      });

      toast.showSuccess(
        'Wallet Reset Completed!',
        targetBalance === 0
          ? `Wallet balance ₹0.00 reset ho gaya hai${resetClearHistory ? ' aur niche ki sabhi entries clear kar di gayi hain.' : '.'}`
          : `Wallet balance ₹${targetBalance.toFixed(2)} set kiya gaya.`
      );
      setIsResetModalOpen(false);
      if (res.account) setAccount(res.account);
      if (resetClearHistory) {
        setTransactions(res.transaction ? [res.transaction] : []);
      } else if (res.transaction) {
        setTransactions((prev) => [res.transaction, ...prev]);
      }
    } catch (err: any) {
      toast.showError('Reset Error', err?.message || 'Could not reset wallet balance.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleClearAllHistory = async () => {
    setIsClearingHistory(true);
    try {
      const res = await clearWalletTransactionsApi(currentOrgId);
      toast.showSuccess('Entries Cleared', `${res.clearedCount || 0} transaction records clear ho gayi hain.`);
      setTransactions([]);
      setIsClearHistoryModalOpen(false);
    } catch (err: any) {
      toast.showError('Clear Error', err?.message || 'Could not clear transaction entries.');
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handleDeleteSingleTx = async (txId: string) => {
    setDeletingTxId(txId);
    try {
      await deleteWalletTransactionApi(currentOrgId, txId);
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
      toast.showSuccess('Deleted', 'Transaction entry delete ho gayi.');
    } catch (err: any) {
      toast.showError('Delete Error', err?.message || 'Could not delete transaction entry.');
    } finally {
      setDeletingTxId(null);
    }
  };

  const handleSaveAutoDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAutoDelete(true);
    try {
      const res = await updateWalletAutoDeleteApi({
        organizationId: currentOrgId,
        autoDeleteDays: Number(autoDeleteDays),
        autoDeleteEnabled,
      });
      if (res.account) setAccount(res.account);
      toast.showSuccess(
        'Auto-Delete Settings Saved',
        autoDeleteEnabled
          ? `Entries ab ${autoDeleteDays} days purani hone par automatically delete hongi.`
          : 'Auto-delete feature disable ho gaya.'
      );
      setIsAutoDeleteModalOpen(false);
      loadWalletData();
    } catch (err: any) {
      toast.showError('Settings Error', err?.message || 'Could not update auto-delete settings.');
    } finally {
      setIsSavingAutoDelete(false);
    }
  };

  const handlePurgeNow = async () => {
    setIsPurgingNow(true);
    try {
      const res = await purgeWalletOldTransactionsApi(currentOrgId, autoDeleteDays);
      toast.showSuccess('Auto-Clean Done', `${res.deletedCount || 0} purani entries delete kar di gayi hain.`);
      loadWalletData();
    } catch (err: any) {
      toast.showError('Clean Error', err?.message || 'Could not purge old records.');
    } finally {
      setIsPurgingNow(false);
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterAdmin) return;

    setIsSavingPricing(true);
    try {
      const m = Number(editMarketing);
      const u = Number(editUtility);
      const a = Number(editAuth);
      const s = Number(editService);

      const res = await updatePricingApi({
        marketingRate: isNaN(m) ? 0.88 : m,
        utilityRate: isNaN(u) ? 0.115 : u,
        authenticationRate: isNaN(a) ? 0.115 : a,
        serviceRate: isNaN(s) ? 0 : s,
        currency: 'INR',
        updatedBy: userProfile?.displayName || 'Master Admin',
      });

      toast.showSuccess('Pricing Updated', 'Global WhatsApp conversation rates saved successfully.');
      if (res.pricing) setPricing(res.pricing);
    } catch (err: any) {
      toast.showError('Update Failed', err?.message || 'Could not update pricing.');
    } finally {
      setIsSavingPricing(false);
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = t.description?.toLowerCase().includes(q);
        const matchCat = t.category?.toLowerCase().includes(q);
        const matchCamp = t.campaignName?.toLowerCase().includes(q);
        const matchRef = t.paymentReference?.toLowerCase().includes(q);
        if (!matchDesc && !matchCat && !matchCamp && !matchRef) return false;
      }
      return true;
    });
  }, [transactions, filterType, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  const balance = account?.balance ?? 0;
  const isLowBalance = balance <= (account?.lowBalanceThreshold ?? 100);
  const isDepleted = balance <= 0;

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center space-x-2">
                <span>Prepaid Wallet &amp; Live Meta Balance</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Real-Time
                </span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Automatic campaign consumption tracking based on Meta conversation category rates.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <a
            href="https://business.facebook.com/billing_hub/payment_methods"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer"
            title="Open Meta Official Billing Hub"
          >
            <CreditCard className="w-3.5 h-3.5 text-neutral-500" />
            <span>Meta Billing Hub</span>
            <ExternalLink className="w-3 h-3 text-neutral-400 ml-0.5" />
          </a>

          <button
            type="button"
            onClick={loadWalletData}
            disabled={loading}
            className="p-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 cursor-pointer shadow-2xs transition-colors disabled:opacity-50"
            title="Refresh balance"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setResetMode('zero');
              setCustomBalanceInput('0');
              setIsResetModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800/80 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            title="Reset wallet to ₹0.00 fresh to reconcile with Meta Business Portfolio"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
            <span>Reset Balance (00)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRechargeModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Funds / Recharge</span>
          </button>
        </div>
      </div>

      {/* Low Balance Warning Banner */}
      {isLowBalance && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-start sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 animate-fadeIn">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="font-bold">
                {isDepleted ? 'Prepaid Wallet Depleted (₹0 Balance)' : 'Low Balance Alert!'}
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                Aapka bacha hua balance ₹{balance.toFixed(2)} hai. Meta campaigns smoothly send hone ke liye kripya wallet me funds add karein.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsRechargeModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
          >
            Recharge Now
          </button>
        </div>
      )}

      {/* Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Current Balance */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-white dark:from-emerald-950/40 dark:via-neutral-900 dark:to-neutral-900 border border-emerald-200 dark:border-emerald-800/60 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Current Live Balance
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                isDepleted
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400 border border-rose-300'
                  : isLowBalance
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300'
              }`}
            >
              {isDepleted ? 'Depleted' : isLowBalance ? 'Low' : 'Healthy'}
            </span>
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-neutral-900 dark:text-white">
              ₹{balance.toFixed(2)}
            </div>
            <div className="flex items-center justify-between mt-1 pt-0.5">
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Available for Broadcasts &amp; Drips
              </p>
              <button
                type="button"
                onClick={() => {
                  setResetMode('zero');
                  setCustomBalanceInput('0');
                  setIsResetModalOpen(true);
                }}
                className="inline-flex items-center space-x-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-1 shrink-0"
                title="Reset or reconcile with Meta Business Portfolio"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset (00)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Total Recharged */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Total Recharged
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-neutral-900 dark:text-white">
              ₹{(account?.totalRecharged ?? 0).toFixed(2)}
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
              Lifetime funds added
            </p>
          </div>
        </div>

        {/* Card 3: Total Spent */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Total Messages Spent
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-neutral-900 dark:text-white">
              ₹{(account?.totalSpent ?? 0).toFixed(2)}
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
              Automatically deducted on message dispatch
            </p>
          </div>
        </div>

        {/* Card 4: Active Category Rates */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Active Category Rates
            </span>
            <span className="text-[10px] text-neutral-400 font-mono">per msg</span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Marketing:</span>
              <span className="font-bold font-mono text-purple-600 dark:text-purple-400">
                ₹{Number(pricing.marketingRate).toFixed(3)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Utility:</span>
              <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                ₹{Number(pricing.utilityRate).toFixed(3)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Auth / Service:</span>
              <span className="font-bold font-mono text-neutral-700 dark:text-neutral-300">
                ₹{Number(pricing.authenticationRate).toFixed(3)} / ₹{Number(pricing.serviceRate).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MASTER ADMIN ONLY: Category Pricing Administration Panel */}
      {isMasterAdmin && (
        <div className="p-4 sm:p-5 rounded-2xl border border-amber-300/80 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-amber-200/80 dark:border-amber-900/60">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                👑
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                  <span>Master Category Pricing Control (Global Platform Rates)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 font-extrabold">
                    Master Only
                  </span>
                </h3>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-0.5">
                  Sirf Master Admin ke paas yahan rates badalne ka permission hai. Yahan set kiye gaye rates sabhi Admins aur Users ke messages par automatically deduct honge.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSavePricing} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Marketing Rate (₹ per msg)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-bold">₹</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={editMarketing}
                    onChange={(e) => setEditMarketing(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono font-bold text-neutral-900 dark:text-white"
                  />
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">Default Meta: ₹0.88</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Utility Rate (₹ per msg)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-bold">₹</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={editUtility}
                    onChange={(e) => setEditUtility(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono font-bold text-neutral-900 dark:text-white"
                  />
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">Default Meta: ₹0.115</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Authentication Rate (₹ per msg)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-bold">₹</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={editAuth}
                    onChange={(e) => setEditAuth(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono font-bold text-neutral-900 dark:text-white"
                  />
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">Default Meta: ₹0.115</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Service / User Reply Rate (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-bold">₹</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={editService}
                    onChange={(e) => setEditService(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono font-bold text-neutral-900 dark:text-white"
                  />
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">Default: ₹0.00 (Customer Window)</p>
              </div>
            </div>

            <div className="flex justify-end items-center space-x-2 pt-2">
              <button
                type="submit"
                disabled={isSavingPricing}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{isSavingPricing ? 'Saving Rates...' : 'Update Global Platform Pricing'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transactions & Deductions History Section */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Wallet Transactions &amp; Campaign Deductions</span>
              <span className="text-xs text-neutral-400 font-normal">
                ({filteredTransactions.length} items)
              </span>
            </h3>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Recharge entries and automatic per-message campaign deduction audit trail.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Auto-Delete Settings Badge & Button */}
            <button
              type="button"
              onClick={() => setIsAutoDeleteModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer shadow-2xs"
              title="Configure Auto-Delete Retention Settings for Transaction Entries"
            >
              <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>
                Auto-Delete: {account?.autoDeleteEnabled !== false ? `${account?.autoDeleteDays || 30} Days` : 'Off'}
              </span>
              <Settings2 className="w-3 h-3 text-blue-500 ml-0.5" />
            </button>

            {/* Clear All Entries / Reset History Button */}
            <button
              type="button"
              onClick={() => setIsClearHistoryModalOpen(true)}
              disabled={transactions.length === 0}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer shadow-2xs disabled:opacity-40"
              title="Clear all transaction entries from audit log"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Clear History</span>
            </button>

            {/* Filter buttons */}
            <div className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setFilterType('all');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType('credit');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterType === 'credit'
                    ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Recharges
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType('debit');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterType === 'debit'
                    ? 'bg-white dark:bg-neutral-700 text-purple-600 dark:text-purple-400 shadow-2xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Deductions
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search transaction..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Category / Reason</th>
                <th className="py-3 px-4 text-center">Msg Count &amp; Rate</th>
                <th className="py-3 px-4 text-right">Amount (₹)</th>
                <th className="py-3 px-4 text-right">Balance After</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-400">
                    <div className="space-y-1">
                      <Wallet className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mx-auto" />
                      <p className="font-semibold text-xs text-neutral-600 dark:text-neutral-400">
                        No transactions recorded yet
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        Funds recharge karein ya campaign send karein to record audit entries.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((tx) => {
                  const isCredit = tx.type === 'credit';
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-neutral-600 dark:text-neutral-300 font-mono text-[11px]">
                        {tx.createdAt
                          ? new Date(tx.createdAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })
                          : '-'}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isCredit
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                          }`}
                        >
                          {isCredit ? (
                            <>
                              <ArrowDownRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Recharge</span>
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                              <span>Deduction</span>
                            </>
                          )}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-neutral-900 dark:text-white">
                            {tx.description}
                          </p>
                          <div className="flex items-center space-x-2 text-[10px] text-neutral-400">
                            <span className="font-mono uppercase font-bold text-neutral-500">
                              {tx.category}
                            </span>
                            {tx.paymentReference && (
                              <span className="font-mono">Ref: {tx.paymentReference}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap text-neutral-600 dark:text-neutral-400 font-mono text-[11px]">
                        {tx.messageCount ? (
                          <span>
                            <strong>{tx.messageCount}</strong> @ ₹{(tx.ratePerMessage ?? 0).toFixed(3)}
                          </span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-xs">
                        <span className={isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-purple-600 dark:text-purple-400'}>
                          {isCredit ? '+' : '-'}₹{tx.amount.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-semibold text-xs text-neutral-700 dark:text-neutral-300">
                        ₹{tx.balanceAfter.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDeleteSingleTx(tx.id)}
                          disabled={deletingTxId === tx.id}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-40"
                          title="Delete this entry"
                        >
                          <Trash2 className={`w-3.5 h-3.5 ${deletingTxId === tx.id ? 'animate-spin' : ''}`} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredTransactions.length > 0 && (
          <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500 bg-neutral-50/40 dark:bg-neutral-800/20">
            <div>
              Showing {Math.min((currentPage - 1) * pageSize + 1, filteredTransactions.length)} to{' '}
              {Math.min(currentPage * pageSize, filteredTransactions.length)} of{' '}
              {filteredTransactions.length} transactions
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recharge Modal */}
      {isRechargeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center space-x-3 text-emerald-600 dark:text-emerald-400">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  Add Prepaid Funds / Recharge
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Update your wallet balance after recharging on Meta
                </p>
              </div>
            </div>

            <form onSubmit={handleRechargeSubmit} className="space-y-4 text-xs">
              {/* Quick preset chips */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Quick Amount Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['500', '1000', '2000', '5000', '10000'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setRechargeAmount(amt)}
                      className={`px-3 py-1.5 rounded-xl border font-mono font-bold text-xs transition-colors cursor-pointer ${
                        rechargeAmount === amt
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                          : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      +₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount input */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Recharge Amount (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={rechargeAmount}
                    onChange={(e) => setRechargeAmount(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-mono font-bold text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Note / Reference */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Recharge Note / Description
                </label>
                <input
                  type="text"
                  value={rechargeNote}
                  onChange={(e) => setRechargeNote(e.target.value)}
                  placeholder="e.g. Meta UPI Recharge / Card Auto-Debit"
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Payment Reference ID (Optional)
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. UPI Ref / Bank Tx ID / Meta Receipt ID"
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
                />
              </div>

              {/* Helper notice */}
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-1 text-[11px] text-neutral-600 dark:text-neutral-300">
                <div className="flex items-center space-x-1.5 font-bold text-neutral-800 dark:text-neutral-200">
                  <Info className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Meta Official Billing Reminder:</span>
                </div>
                <p>
                  Agar aapne abhi tak Meta me payment add nahi kiya hai, toh aap pehle Meta me funds recharge kar lein:
                </p>
                <a
                  href="https://business.facebook.com/billing_hub/payment_methods"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                >
                  <span>Open Meta Billing Hub to Pay</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRechargeModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecharging}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isRecharging ? 'Crediting...' : 'Confirm Recharge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset & Reconcile Modal (00 Fresh State) */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  Reset Wallet &amp; Reconcile Meta Balance
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Sync your system balance with Meta Business Portfolio
                </p>
              </div>
            </div>

            <form onSubmit={handleResetSubmit} className="space-y-4 text-xs">
              {/* Notice Banner explaining why */}
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 space-y-1.5 text-[11px]">
                <div className="flex items-center space-x-1.5 font-bold">
                  <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Kyun zaroori hai? (Reconciliation Purpose)</span>
                </div>
                <p>
                  Agar Meta Business Portfolio me WhatsApp number ka balance aur CloudWABA ka balance alag dikh raha ho, toh aap yahan se balance ko <strong>₹0.00 (Fresh Zero)</strong> karke naya recharge daal sakte hain, ya directly Meta wala exact balance yahan set kar sakte hain taaki dono 100% same match ho jayein.
                </p>
              </div>

              {/* Mode Selection */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                  Select Reset Action:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResetMode('zero')}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                      resetMode === 'zero'
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 ring-2 ring-rose-400/20'
                        : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Fresh Reset to 00</span>
                      <span className="text-xs font-mono font-extrabold text-rose-600">₹0.00</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      Balance 0 ho jayega. Uske baad "Add Funds" se naya recharge daal kar Meta se match karein.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResetMode('custom')}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                      resetMode === 'custom'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-400/20'
                        : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Set Exact Meta Balance</span>
                      <span className="text-xs font-mono font-bold text-emerald-600">Direct Value</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      Meta Business Portfolio me jo exact balance abhi dikh raha hai, wahi direct yahan type karein.
                    </p>
                  </button>
                </div>
              </div>

              {/* Custom Balance Input if mode === 'custom' */}
              {resetMode === 'custom' && (
                <div className="animate-fadeIn">
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Meta Business Portfolio Live Balance (₹) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-sm">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={customBalanceInput}
                      onChange={(e) => setCustomBalanceInput(e.target.value)}
                      placeholder="e.g. 450.50"
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-mono font-bold text-neutral-900 dark:text-white"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Ye balance direct aapke wallet account aur linked WhatsApp numbers par set ho jayega.
                  </p>
                </div>
              )}

              {/* Reset Counters Checkbox */}
              <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/40">
                <label className="flex items-start space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetCounters}
                    onChange={(e) => setResetCounters(e.target.checked)}
                    className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <span className="font-bold text-neutral-800 dark:text-neutral-200 block text-[11px]">
                      Lifetime Recharged &amp; Spent counters reset karein (100% Fresh Start)
                    </span>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block mt-0.5">
                      Check rakhne par Total Spent 0 ho jayega aur Total Recharged naye balance se start hoga.
                    </span>
                  </div>
                </label>
              </div>

              {/* Reset Entries / Deductions Checkbox (Recommended) */}
              <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-900/80 bg-rose-50/70 dark:bg-rose-950/40">
                <label className="flex items-start space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetClearHistory}
                    onChange={(e) => setResetClearHistory(e.target.checked)}
                    className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-rose-900 dark:text-rose-200 block text-[11px] flex items-center space-x-1.5">
                      <span>Niche ki sabhi Transaction Entries bhi reset/clear karein</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200 font-extrabold uppercase">
                        Recommended
                      </span>
                    </span>
                    <span className="text-[10px] text-rose-700 dark:text-rose-300 block mt-0.5">
                      Purani reconciliation aur campaign deduction entries table se hat jayengi aur list 100% fresh 00 ho jayegi.
                    </span>
                  </div>
                </label>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Reason / Audit Note
                </label>
                <input
                  type="text"
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="e.g. Reconciliation with Meta Business Portfolio balance"
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                />
              </div>

              {/* Balance Transition Summary */}
              <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[11px] flex items-center justify-between font-mono">
                <div>
                  <span className="text-neutral-500 block text-[10px]">Current System Balance</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">₹{balance.toFixed(2)}</span>
                </div>
                <div className="text-neutral-400">➔</div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">New Reconciled Balance</span>
                  <span className={`font-bold ${resetMode === 'zero' ? 'text-rose-600' : 'text-emerald-600'}`}>
                    ₹{resetMode === 'zero' ? '0.00' : Number(customBalanceInput || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className={`px-5 py-2 rounded-xl text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center space-x-1.5 ${
                    resetMode === 'zero'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                  <span>
                    {isResetting
                      ? 'Resetting...'
                      : resetMode === 'zero'
                      ? 'Confirm Reset to ₹0.00'
                      : 'Confirm Reconcile Balance'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auto-Delete Retention Settings Modal */}
      {isAutoDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center space-x-3 text-blue-600 dark:text-blue-400">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  Auto-Delete Retention Settings
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Transactions &amp; Deductions Auto-Cleanup Policy
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveAutoDelete} className="space-y-4 text-xs">
              {/* Info Notice */}
              <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-blue-900 dark:text-blue-200 space-y-1 text-[11px]">
                <div className="flex items-center space-x-1.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Auto-Delete Kaise Kaam Karta Hai?</span>
                </div>
                <p>
                  Jab aap broadcasts send karte hain, toh har message ka audit record yahan banta hai. Auto-delete enable hone par puraani entries automatically background me delete ho jaati hain bina aapka Live Balance affect kiye.
                </p>
              </div>

              {/* Enable Toggle */}
              <div className="p-3.5 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-800/40 flex items-center justify-between">
                <div>
                  <span className="font-bold text-neutral-900 dark:text-white block text-xs">
                    Enable Automatic Cleanup
                  </span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Purani entries ko automatically schedule par delete karein
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoDeleteEnabled}
                    onChange={(e) => setAutoDeleteEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-hidden rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Retention Duration Selector */}
              {autoDeleteEnabled && (
                <div className="space-y-2 animate-fadeIn">
                  <label className="block text-[11px] font-bold text-neutral-700 dark:text-neutral-300">
                    Auto-Delete Retention Period (Kitne din purani entries delete karein):
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { days: 7, label: '7 Days', desc: 'Ultra Lean' },
                      { days: 15, label: '15 Days', desc: 'Fast cleanup' },
                      { days: 30, label: '30 Days', desc: 'Default / Rec.' },
                      { days: 60, label: '60 Days', desc: '2 Months' },
                      { days: 90, label: '90 Days', desc: 'Quarterly' },
                      { days: 180, label: '180 Days', desc: 'Half-yearly' },
                    ].map((opt) => (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => setAutoDeleteDays(opt.days)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          autoDeleteDays === opt.days
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20 font-bold'
                            : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        <div className="font-bold text-xs">{opt.label}</div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Purge Now Trigger */}
              <div className="p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-neutral-800 dark:text-neutral-200 block text-[11px]">
                    Instant Cleanup
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {autoDeleteDays} days se purani entries ko abhi delete karein
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handlePurgeNow}
                  disabled={isPurgingNow}
                  className="px-3 py-1.5 rounded-xl bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center space-x-1"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${isPurgingNow ? 'animate-spin' : ''}`} />
                  <span>{isPurgingNow ? 'Cleaning...' : 'Clean Now'}</span>
                </button>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAutoDeleteModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAutoDelete}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingAutoDelete ? 'Saving...' : 'Save Auto-Delete Policy'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clear All History Modal */}
      {isClearHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  Clear All Transaction Entries?
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Reset only audit log history ({transactions.length} entries)
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 text-[11px] space-y-1">
                <p className="font-bold">Dhyan dein:</p>
                <p>
                  Niche dikh rahi sabhi <strong>{transactions.length} entries</strong> permanently delete ho jayengi.
                </p>
                <p className="text-neutral-600 dark:text-neutral-300 mt-1">
                  Aapka Live Balance (<strong>₹{balance.toFixed(2)}</strong>) bilkul safe rahega aur change nahi hoga.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsClearHistoryModalOpen(false)}
                  disabled={isClearingHistory}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearAllHistory}
                  disabled={isClearingHistory}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${isClearingHistory ? 'animate-spin' : ''}`} />
                  <span>{isClearingHistory ? 'Clearing...' : 'Yes, Clear All Entries'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
