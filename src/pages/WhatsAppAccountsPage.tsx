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
  ShieldAlert,
  Copy,
  Check,
  HelpCircle,
  Zap,
  Key,
  CreditCard,
  Wallet,
  Building2,
  DollarSign,
  Settings,
  Activity,
  Clock,
  Sparkles,
  Lock,
} from 'lucide-react';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { WhatsAppAccount, ConnectionHealthReport } from '../types/index.ts';
import { parseMessagingLimitTier } from '../lib/metaLimits.ts';
import { UpdateAccountTokenModal } from '../components/UpdateAccountTokenModal.tsx';
import { ConfigureBillingIdsModal } from '../components/ConfigureBillingIdsModal.tsx';
import { ConnectionHealthModal } from '../components/ConnectionHealthModal.tsx';
import { ReleaseAccountModal } from '../components/ReleaseAccountModal.tsx';
import { buildMetaBillingHubUrl } from '../utils/metaBilling.ts';

interface WhatsAppAccountsPageProps {
  onOpenConnectModal: () => void;
  onLock?: () => void;
}

export const WhatsAppAccountsPage: React.FC<WhatsAppAccountsPageProps> = ({
  onOpenConnectModal,
  onLock,
}) => {
  const {
    accounts,
    metaStatus,
    disconnectAccount,
    reconnectAccount,
    deleteAccount,
    refreshMetaStatus,
    syncAccountWithMeta,
    verifyConnectionHealth,
    disconnectAndReleaseAccount,
  } = useWhatsAppAccounts();
  const toast = useToast();

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [tokenModalAccount, setTokenModalAccount] = useState<WhatsAppAccount | null>(null);
  const [configureBillingAccount, setConfigureBillingAccount] = useState<WhatsAppAccount | null>(null);
  const [releaseModalAccount, setReleaseModalAccount] = useState<WhatsAppAccount | null>(null);
  const [healthModalAccount, setHealthModalAccount] = useState<WhatsAppAccount | null>(null);
  const [healthModalReport, setHealthModalReport] = useState<ConnectionHealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [healthReportsMap, setHealthReportsMap] = useState<Record<string, ConnectionHealthReport>>({});

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
        const msg = `Meta details for ${acc.verifiedName || acc.displayPhoneNumber} updated and saved successfully.`;
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
    const targetAcc = accounts.find((a) => a.id === accId);
    const phoneDisplay = targetAcc?.displayPhoneNumber || targetAcc?.name || 'this WhatsApp account';

    if (
      !window.confirm(
        `Are you sure you want to completely delete ${phoneDisplay} from this workspace?\n\n` +
          `⚠️ Storage Auto-Purge & Cascade Cleanup:\n` +
          `• All campaigns created with this number will be deleted from storage.\n` +
          `• All recipient tracking & delivery history will be permanently purged.\n` +
          `• Associated media files will be wiped from disk storage.\n\n` +
          `Do you want to proceed?`
      )
    )
      return;

    setActionLoading(accId);
    try {
      const res = await deleteAccount(accId, { phoneNumberId: targetAcc?.phoneNumberId });
      const summaryMsg = res.deletedCampaignsCount
        ? `Deleted account along with ${res.deletedCampaignsCount} campaigns, ${res.deletedRecipientsCount || 0} tracking records, and media files.`
        : 'WhatsApp account and related storage data cleared.';
      toast.showSuccess('Account & Data Purged', summaryMsg);
    } catch (err) {
      toast.showError('Delete Failed', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnectAndRelease = async (acc: WhatsAppAccount) => {
    const confirmMsg = `Are you sure you want to disconnect and release ${acc.displayPhoneNumber || 'this number'}?\n\nThis secure action will:\n• Deregister the phone number from Meta Cloud API\n• Revoke the Meta token\n• Clear linked webhook and configuration state\n• Update account status to 'disconnected'\n\nThis ensures no 'partner/linked device' errors persist when reconnecting.`;
    if (!window.confirm(confirmMsg)) return;

    setActionLoading(`release_${acc.id}`);
    try {
      const res = await disconnectAndReleaseAccount({
        accountId: acc.id,
        phoneNumberId: acc.phoneNumberId,
        wabaId: acc.wabaId,
        customToken: acc.customToken,
      });

      if (res.success) {
        toast.showSuccess(
          'Disconnected and Released',
          `${acc.displayPhoneNumber} has been cleanly deregistered and released from Meta Cloud API.`
        );
        refreshMetaStatus();
      } else {
        toast.showError('Disconnect and Release Notice', res.error || 'Failed to complete release on Meta');
      }
    } catch (err: any) {
      toast.showError('Operation Failed', err?.message || 'Error executing disconnect and release');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyHealth = async (acc: WhatsAppAccount) => {
    setHealthModalAccount(acc);
    setHealthLoading(true);
    try {
      const report = await verifyConnectionHealth({
        accountId: acc.id,
        phoneNumberId: acc.phoneNumberId,
        wabaId: acc.wabaId,
        customToken: acc.customToken,
      });
      setHealthModalReport(report);
      setHealthReportsMap((prev) => ({ ...prev, [acc.id]: report }));
      if (report.healthStatus === 'HEALTHY') {
        toast.showSuccess(
          'Token Healthy',
          report.token?.isPermanent
            ? 'Permanent System User Token active & valid.'
            : report.statusSummary
        );
      } else if (report.healthStatus === 'EXPIRING_SOON') {
        toast.showWarning('Token Expiring Soon', report.statusSummary);
      } else if (report.healthStatus === 'INSUFFICIENT_PERMISSIONS') {
        toast.showWarning('Missing Permissions', report.statusSummary);
      } else {
        toast.showError('Token Health Alert', report.statusSummary);
      }
    } catch (err) {
      toast.showError('Health Check Failed', err);
    } finally {
      setHealthLoading(false);
    }
  };

  const handleVerifyAllAccounts = async () => {
    if (accounts.length === 0) return;
    setVerifyingAll(true);
    let expiredCount = 0;
    let warningCount = 0;
    const newMap = { ...healthReportsMap };

    for (const acc of accounts) {
      try {
        const report = await verifyConnectionHealth({
          accountId: acc.id,
          phoneNumberId: acc.phoneNumberId,
          wabaId: acc.wabaId,
          customToken: acc.customToken,
        });
        newMap[acc.id] = report;
        if (
          report.healthStatus === 'EXPIRED' ||
          report.healthStatus === 'INVALID_TOKEN' ||
          report.healthStatus === 'NO_TOKEN'
        ) {
          expiredCount++;
        } else if (
          report.healthStatus === 'EXPIRING_SOON' ||
          report.healthStatus === 'INSUFFICIENT_PERMISSIONS'
        ) {
          warningCount++;
        }
      } catch (err) {
        console.warn('Health check failed for account', acc.id, err);
      }
    }

    setHealthReportsMap(newMap);
    setVerifyingAll(false);

    if (expiredCount > 0) {
      toast.showError('Token Alert', `${expiredCount} account(s) have expired or invalid tokens.`);
    } else if (warningCount > 0) {
      toast.showWarning('Token Warning', `${warningCount} account(s) near expiry or missing permissions.`);
    } else {
      toast.showSuccess('All Tokens Healthy', 'All connected WhatsApp accounts passed connection health verification.');
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

        <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
          {onLock && (
            <button
              type="button"
              onClick={onLock}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium text-xs sm:text-sm shadow-2xs transition-colors cursor-pointer"
              title="Lock WhatsApp Numbers access with PIN"
            >
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              <span>Lock Section</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleVerifyAllAccounts}
            disabled={verifyingAll || accounts.length === 0}
            className="inline-flex items-center space-x-2 px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-medium text-xs sm:text-sm shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Check live Meta Access Token expiration & scopes across all accounts"
          >
            <Activity
              className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${
                verifyingAll ? 'animate-spin' : ''
              }`}
            />
            <span>{verifyingAll ? 'Verifying Tokens...' : 'Verify Connection Health'}</span>
          </button>

          <button
            onClick={onOpenConnectModal}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Connect WhatsApp</span>
          </button>
        </div>
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

                {/* Meta Business Portfolio Verification Status */}
                {(() => {
                  const isVerified =
                    acc.businessVerificationStatus === 'VERIFIED' ||
                    ['TIER_1K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED'].includes(acc.messagingLimitTier || '');
                  const verificationUrl = acc.businessPortfolioId
                    ? `https://business.facebook.com/settings/security?business_id=${encodeURIComponent(acc.businessPortfolioId)}`
                    : 'https://business.facebook.com/settings/security';
                  return (
                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                        isVerified
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/50'
                          : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/50'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        {isVerified ? (
                          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200 text-[11px]">
                              Business Portfolio:
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                                isVerified
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {isVerified ? 'VERIFIED (Official)' : 'UNVERIFIED (250 limit)'}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-500 truncate mt-0.5">
                            {isVerified
                              ? 'Meta Business Verification active. Eligible for high-volume broadcast tiers.'
                              : 'Standard Unverified limit. Complete verification on Meta to unlock 1,000+ daily limit.'}
                          </p>
                        </div>
                      </div>

                      <a
                        href={verificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center space-x-1 shrink-0"
                        title="Open Meta Security Center to verify Business Portfolio"
                      >
                        <span>{isVerified ? 'Security Center' : 'Verify on Meta'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  );
                })()}

                {/* Live Meta Access Token & Connection Health Card */}
                {(() => {
                  const report = healthReportsMap[acc.id] || (acc.tokenHealth as ConnectionHealthReport | undefined);
                  const status = report?.healthStatus;
                  const isHealthy = status === 'HEALTHY';
                  const isExpiringSoon = status === 'EXPIRING_SOON';
                  const isInsufficient = status === 'INSUFFICIENT_PERMISSIONS';
                  const isExpired = status === 'EXPIRED' || status === 'INVALID_TOKEN' || status === 'NO_TOKEN';
                  const isPhoneErr = status === 'PHONE_ERROR';
                  const hasChecked = Boolean(status);
                  const isThisAccountChecking = healthLoading && healthModalAccount?.id === acc.id;

                  return (
                    <div
                      className={`p-3.5 rounded-xl border space-y-2 transition-all ${
                        !hasChecked
                          ? 'bg-neutral-50/70 dark:bg-neutral-800/40 border-neutral-200/70 dark:border-neutral-700/50'
                          : isHealthy
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60'
                          : isExpiringSoon
                          ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-300 dark:border-amber-700/60'
                          : isInsufficient
                          ? 'bg-orange-50/70 dark:bg-orange-950/25 border-orange-300 dark:border-orange-700/60'
                          : 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          {isHealthy ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : isExpiringSoon ? (
                            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          ) : isInsufficient ? (
                            <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                          ) : isExpired ? (
                            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                          ) : (
                            <Activity className="w-4 h-4 text-neutral-500 shrink-0" />
                          )}
                          <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                            Meta Token &amp; Connection Health
                          </span>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight ${
                            !hasChecked
                              ? 'bg-neutral-200/70 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                              : isHealthy
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : isExpiringSoon
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : isInsufficient
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          }`}
                        >
                          {!hasChecked && 'Not Checked'}
                          {isHealthy && (report?.token?.isPermanent ? 'Healthy (Permanent)' : 'Healthy')}
                          {isExpiringSoon && `Near Expiry (${report?.token?.expiresInDays ? `${report.token.expiresInDays}d` : 'Soon'})`}
                          {isInsufficient && 'Missing Permissions'}
                          {isExpired && 'Expired (#190)'}
                          {isPhoneErr && 'Phone Error'}
                        </span>
                      </div>

                      <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                        {report?.statusSummary || 'Click "Verify Health" to inspect Meta Access Token expiration, permissions, and phone connectivity.'}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-neutral-200/50 dark:border-neutral-700/50 text-[11px]">
                        <span className="text-[10px] text-neutral-500">
                          {report?.token?.expiresAt
                            ? `Expires: ${new Date(report.token.expiresAt).toLocaleDateString()}`
                            : report?.token?.isPermanent
                            ? 'Type: Permanent System User Token'
                            : report?.checkedAt
                            ? `Checked: ${new Date(report.checkedAt).toLocaleTimeString()}`
                            : 'Live Meta Graph Inspection'}
                        </span>

                        <div className="flex items-center space-x-2">
                          {!isHealthy && hasChecked && (
                            <button
                              type="button"
                              onClick={() => setTokenModalAccount(acc)}
                              className="text-amber-700 dark:text-amber-400 hover:underline font-semibold flex items-center space-x-1 cursor-pointer text-[11px]"
                            >
                              <Key className="w-3 h-3" />
                              <span>Update Token</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleVerifyHealth(acc)}
                            disabled={isThisAccountChecking}
                            className="text-emerald-700 dark:text-emerald-400 hover:underline font-semibold flex items-center space-x-1 cursor-pointer text-[11px]"
                          >
                            <Activity className={`w-3 h-3 ${isThisAccountChecking ? 'animate-spin' : ''}`} />
                            <span>{hasChecked ? 'Re-verify' : 'Verify Health'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Daily Messaging Limit & Tier Card */}
                {(() => {
                  const isVerified =
                    acc.businessVerificationStatus === 'VERIFIED' ||
                    ['TIER_1K', 'TIER_2K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED'].includes(acc.messagingLimitTier || '');
                  const limitInfo = parseMessagingLimitTier(acc.messagingLimitTier, isVerified);
                  return (
                    <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200/80 dark:border-neutral-700/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <Zap className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                            Daily Messaging Limit (24h)
                          </span>
                        </div>
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-tight bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                          title="Daily messaging limit assigned automatically by Meta Cloud API"
                        >
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

                {/* 1 Button: Customer's Own Real Meta Billing Hub Link */}
                {(() => {
                  const portfolioId = acc.businessPortfolioId || acc.businessId;
                  const billingHubUrl = buildMetaBillingHubUrl({
                    wabaId: acc.wabaId,
                    businessPortfolioId: acc.businessPortfolioId,
                    businessId: acc.businessId,
                    paymentAccountId: acc.paymentAccountId,
                    primaryFundingId: acc.primaryFundingId,
                  });

                  return (
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-neutral-50/60 dark:from-emerald-950/25 dark:via-teal-950/20 dark:to-neutral-900 border border-emerald-200/80 dark:border-emerald-800/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-1.5 font-bold text-neutral-900 dark:text-white">
                          <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Meta WhatsApp Payment &amp; Billing</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfigureBillingAccount(acc)}
                          className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline flex items-center space-x-1 cursor-pointer"
                          title="View / Configure Customer Portfolio ID or Payment Account ID"
                        >
                          <Settings className="w-3 h-3" />
                          <span>Edit IDs</span>
                        </button>
                      </div>

                      {/* 1 Direct Button to Customer's Own Meta Billing Hub */}
                      <div className="flex items-center gap-2">
                        <a
                          href={billingHubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs inline-flex items-center justify-center space-x-2 shadow-2xs transition-colors cursor-pointer"
                          title="Open official Meta Billing Hub to add payment method (UPI / Card) or prepaid recharge"
                        >
                          <CreditCard className="w-3.5 h-3.5 shrink-0" />
                          <span>Add Payment / Funds on Meta</span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(billingHubUrl);
                            toast.showSuccess('Link Copied', 'Direct Meta Billing Hub URL copied to clipboard');
                          }}
                          className="p-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-neutral-800 hover:bg-emerald-50 dark:hover:bg-neutral-700 text-emerald-700 dark:text-emerald-300 transition-colors cursor-pointer shrink-0"
                          title="Copy direct billing link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400 pt-0.5">
                        <span className="truncate">
                          Portfolio ID: <strong className="font-mono text-neutral-700 dark:text-neutral-300">{portfolioId || 'Auto / Linked'}</strong>
                        </span>
                        <span className="truncate ml-2">
                          WABA: <strong className="font-mono text-neutral-700 dark:text-neutral-300">{acc.wabaId}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Actions */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                    {/* New Disconnect and Release Button (Meta token revocation, deregistration, webhook clear & firestore status update) */}
                    <button
                      onClick={() => handleDisconnectAndRelease(acc)}
                      disabled={actionLoading === `release_${acc.id}`}
                      className="px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800/80 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                      title="Securely revokes Meta token, deregisters number from Cloud API, clears linked webhooks, and updates status to disconnected"
                    >
                      <PowerOff
                        className={`w-3.5 h-3.5 text-rose-600 dark:text-rose-400 ${
                          actionLoading === `release_${acc.id}` ? 'animate-spin' : ''
                        }`}
                      />
                      <span>
                        {actionLoading === `release_${acc.id}` ? 'Releasing...' : 'Disconnect and Release'}
                      </span>
                    </button>

                    {!isConn && (
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
                      title="Fetch latest verified business name and IDs from Meta Graph API and update records"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          actionLoading === `sync_${acc.id}` ? 'animate-spin' : ''
                        }`}
                      />
                      <span>Sync with Meta</span>
                    </button>

                    <button
                      onClick={() => setConfigureBillingAccount(acc)}
                      className="px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
                      title="View & Configure Business Portfolio ID, WABA ID & Meta Billing Hub Link"
                    >
                      <Settings className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Billing IDs</span>
                    </button>

                    <button
                      onClick={() => handleVerifyHealth(acc)}
                      disabled={healthLoading && healthModalAccount?.id === acc.id}
                      className="px-3 py-1.5 rounded-lg border border-teal-200 dark:border-teal-800/80 bg-teal-50/50 dark:bg-teal-950/30 hover:bg-teal-100/60 dark:hover:bg-teal-950/60 text-teal-800 dark:text-teal-300 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
                      title="Verify Meta Access Token expiration & scopes health"
                    >
                      <Activity
                        className={`w-3.5 h-3.5 text-teal-600 dark:text-teal-400 ${
                          healthLoading && healthModalAccount?.id === acc.id ? 'animate-spin' : ''
                        }`}
                      />
                      <span>Verify Health</span>
                    </button>

                    <button
                      onClick={() => setTokenModalAccount(acc)}
                      className="px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100/60 dark:hover:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
                      title="Update Access Token or fix Meta permission #200"
                    >
                      <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Update Token</span>
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

      {/* Update Token & Fix Permission #200 Modal */}
      <UpdateAccountTokenModal
        isOpen={Boolean(tokenModalAccount)}
        onClose={() => setTokenModalAccount(null)}
        account={tokenModalAccount}
        onSuccess={refreshMetaStatus}
      />

      {/* Meta Billing & Portfolio IDs Configuration Modal */}
      <ConfigureBillingIdsModal
        isOpen={Boolean(configureBillingAccount)}
        onClose={() => setConfigureBillingAccount(null)}
        account={configureBillingAccount}
      />

      {/* Meta Access Token Connection Health & Expiration Diagnostics Modal */}
      <ConnectionHealthModal
        isOpen={Boolean(healthModalAccount)}
        onClose={() => {
          setHealthModalAccount(null);
          setHealthModalReport(null);
        }}
        account={healthModalAccount}
        report={healthModalReport}
        loading={healthLoading}
        onRecheck={() => {
          if (healthModalAccount) {
            handleVerifyHealth(healthModalAccount);
          }
        }}
        onOpenUpdateToken={(acc) => {
          setHealthModalAccount(null);
          setTokenModalAccount(acc);
        }}
      />

      {/* Meta Cloud API Clean Release & Deregistration Modal */}
      <ReleaseAccountModal
        isOpen={Boolean(releaseModalAccount)}
        onClose={() => setReleaseModalAccount(null)}
        account={releaseModalAccount}
        onSuccess={() => {
          refreshMetaStatus();
        }}
      />
    </div>
  );
};
