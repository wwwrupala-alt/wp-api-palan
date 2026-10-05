import React, { useState } from 'react';
import {
  Smartphone,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PowerOff,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Copy,
  Check,
  HelpCircle,
  Zap,
} from 'lucide-react';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { WhatsAppAccount } from '../types/index.ts';
import { parseMessagingLimitTier } from '../lib/metaLimits.ts';

interface WhatsAppAccountsPageProps {
  onOpenConnectModal: () => void;
}

export const WhatsAppAccountsPage: React.FC<WhatsAppAccountsPageProps> = ({
  onOpenConnectModal,
}) => {
  const {
    accounts,
    metaStatus,
    disconnectAccount,
    reconnectAccount,
    deleteAccount,
    refreshMetaStatus,
    syncAccountWithMeta,
  } = useWhatsAppAccounts();
  const toast = useToast();

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const copyToClipboard = (text: string, isUrl: boolean) => {
    navigator.clipboard.writeText(text);
    if (isUrl) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
      toast.showInfo('Copied to Clipboard', 'Webhook URL has been copied.');
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
      toast.showInfo('Copied to Clipboard', 'Verify Token has been copied.');
    }
  };

  const handleSync = async (acc: WhatsAppAccount) => {
    setActionLoading(`sync_${acc.id}`);
    setSyncNotice(null);
    try {
      const res = await syncAccountWithMeta(acc);
      if (res.success) {
        const msg = `Meta details for ${acc.verifiedName || acc.displayPhoneNumber} updated and stored in Firestore.`;
        setSyncNotice(msg);
        toast.showSuccess('Synced with Meta Graph API', msg);
        setTimeout(() => setSyncNotice(null), 3500);
      } else {
        const errMsg = res.error || 'Could not fetch details from Meta Graph API.';
        setSyncNotice(`Sync notice: ${errMsg}`);
        toast.showError('Meta Sync Failed', res.error);
        setTimeout(() => setSyncNotice(null), 4000);
      }
    } catch (err) {
      toast.showError('Meta Sync Failed', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (accId: string) => {
    setActionLoading(accId);
    try {
      await disconnectAccount(accId);
      toast.showWarning('Account Disconnected', 'WhatsApp account status set to disconnected.');
    } catch (err) {
      toast.showError('Disconnect Failed', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconnect = async (accId: string) => {
    setActionLoading(accId);
    try {
      await reconnectAccount(accId);
      toast.showSuccess('Account Reconnected', 'WhatsApp account is active again.');
    } catch (err) {
      toast.showError('Reconnect Failed', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (accId: string) => {
    if (!window.confirm('Are you sure you want to remove this WhatsApp account from this workspace?')) return;
    setActionLoading(accId);
    try {
      await deleteAccount(accId);
      toast.showSuccess('Account Removed', 'WhatsApp account deleted from workspace.');
    } catch (err) {
      toast.showError('Delete Failed', err);
    } finally {
      setActionLoading(null);
    }
  };

  const webhookUrl = metaStatus?.webhookUrl || `${window.location.origin}/api/meta/webhook`;
  const webhookVerifyToken = 'cloudwaba_verify_token_secure';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            WhatsApp Accounts
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Manage your Meta WhatsApp Business Platform accounts and phone numbers.
          </p>
        </div>

        <button
          onClick={onOpenConnectModal}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Connect WhatsApp</span>
        </button>
      </div>

      {syncNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* Account List */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
            <Smartphone className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              No WhatsApp account connected yet.
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Click &quot;Connect WhatsApp&quot; to authorize via Meta Embedded Signup or enter your Cloud API phone number.
            </p>
          </div>
          <button
            onClick={onOpenConnectModal}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
          >
            <Smartphone className="w-4 h-4" />
            <span>Connect WhatsApp</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc) => {
            const isConn = acc.connectionStatus === 'connected';
            return (
              <div
                key={acc.id}
                className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        isConn
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
                        {acc.verifiedName || 'WhatsApp Account'}
                      </h3>
                      <p className="font-mono text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                        {acc.displayPhoneNumber}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-1">
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md ${
                        isConn
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {acc.connectionStatus}
                    </span>
                    {acc.qualityRating && (
                      <span className="text-[10px] text-neutral-500">
                        Quality: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{acc.qualityRating}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 py-3 border-y border-neutral-100 dark:border-neutral-800 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-neutral-400 block mb-0.5">Phone Number ID</span>
                    <div className="flex items-center space-x-1.5 font-mono text-neutral-800 dark:text-neutral-200">
                      <span className="truncate select-all">{acc.phoneNumberId}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(acc.phoneNumberId);
                          toast.showSuccess('Copied', 'Phone Number ID copied to clipboard');
                        }}
                        className="text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors p-0.5 cursor-pointer shrink-0"
                        title="Copy Phone Number ID"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-neutral-400 block mb-0.5">WABA ID</span>
                    <div className="flex items-center space-x-1.5 font-mono text-neutral-800 dark:text-neutral-200">
                      <span className="truncate select-all">{acc.wabaId}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(acc.wabaId);
                          toast.showSuccess('Copied', 'WABA ID copied to clipboard');
                        }}
                        className="text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors p-0.5 cursor-pointer shrink-0"
                        title="Copy WABA ID"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-neutral-400 block">Webhook Status</span>
                    <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{acc.webhookStatus}</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-neutral-400 block">Connected At</span>
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {new Date(acc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Daily Messaging Limit & Tier Card */}
                {(() => {
                  const limitInfo = parseMessagingLimitTier(acc.messagingLimitTier);
                  return (
                    <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <Zap className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                            Daily Messaging Limit (24h)
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-tight bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          {acc.messagingLimitLabel || limitInfo.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        {limitInfo.description}
                      </p>
                      <div className="flex items-center justify-between pt-1 border-t border-neutral-200/50 dark:border-neutral-700/50 text-[10px] text-neutral-500 dark:text-neutral-400">
                        <span>Speed: <strong className="text-neutral-700 dark:text-neutral-200">{acc.throughputLevel || 'Standard (80 msg/s)'}</strong></span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Customer replies: Unlimited</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Actions */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2">
                    {isConn ? (
                      <button
                        onClick={() => handleDisconnect(acc.id)}
                        disabled={actionLoading === acc.id}
                        className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        <PowerOff className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Disconnect</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReconnect(acc.id)}
                        disabled={actionLoading === acc.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reconnect</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleSync(acc)}
                      disabled={actionLoading === `sync_${acc.id}`}
                      className="px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
                      title="Fetch latest verified business name and IDs from Meta Graph API and update Firestore"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          actionLoading === `sync_${acc.id}` ? 'animate-spin' : ''
                        }`}
                      />
                      <span>Sync with Meta</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleDelete(acc.id)}
                    title="Delete Account"
                    className="p-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Meta Webhook & Developer Configuration Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">
              Official Meta Webhook &amp; App Configuration
            </h3>
          </div>
          <button
            onClick={refreshMetaStatus}
            className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center space-x-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh Server Status</span>
          </button>
        </div>

        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Configure these values in the Meta Developer App Dashboard under{' '}
          <strong className="text-neutral-800 dark:text-neutral-200">WhatsApp &gt; Configuration &gt; Webhook</strong>.
          Meta will send real-time message status updates (sent, delivered, read) and incoming customer messages to this endpoint.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {/* Webhook Callback URL */}
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
              Webhook Callback URL
            </span>
            <div className="flex items-center justify-between font-mono text-xs text-neutral-900 dark:text-white break-all">
              <span className="truncate pr-2">{webhookUrl}</span>
              <button
                onClick={() => copyToClipboard(webhookUrl, true)}
                className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Webhook Verify Token */}
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
              Verify Token
            </span>
            <div className="flex items-center justify-between font-mono text-xs text-neutral-900 dark:text-white break-all">
              <span>{webhookVerifyToken}</span>
              <button
                onClick={() => copyToClipboard(webhookVerifyToken, false)}
                className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500"
              >
                {copiedToken ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
