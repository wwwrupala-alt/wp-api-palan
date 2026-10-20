import React from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Key,
  ExternalLink,
  Smartphone,
  Zap,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { WhatsAppAccount, ConnectionHealthReport } from '../types/index.ts';

interface ConnectionHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: WhatsAppAccount | null;
  report: ConnectionHealthReport | null;
  loading: boolean;
  onRecheck: () => void;
  onOpenUpdateToken: (account: WhatsAppAccount) => void;
}

export const ConnectionHealthModal: React.FC<ConnectionHealthModalProps> = ({
  isOpen,
  onClose,
  account,
  report,
  loading,
  onRecheck,
  onOpenUpdateToken,
}) => {
  if (!isOpen || !account) return null;

  const status = report?.healthStatus || 'NO_TOKEN';
  const isHealthy = status === 'HEALTHY';
  const isExpiringSoon = status === 'EXPIRING_SOON';
  const isExpired = status === 'EXPIRED' || status === 'INVALID_TOKEN';
  const isInsufficient = status === 'INSUFFICIENT_PERMISSIONS';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/60">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isHealthy
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400'
                  : isExpiringSoon
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-950/80 dark:text-red-400'
              }`}
            >
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                  WhatsApp Connection Health
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-neutral-200/70 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                  {account.displayPhoneNumber}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Live Meta Access Token expiration &amp; permission diagnostics for {account.verifiedName || 'WhatsApp Account'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onRecheck}
              disabled={loading}
              className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
              title="Re-verify Health"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Inspecting Meta Access Token &amp; Live Scopes...
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                Calling Meta Graph API debug_token endpoint to verify expiration, scopes, and phone connectivity.
              </p>
            </div>
          ) : (
            <>
              {/* Overall Status Banner */}
              <div
                className={`p-4 rounded-2xl border flex items-start space-x-3.5 ${
                  isHealthy
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                    : isExpiringSoon
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                    : isInsufficient
                    ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/60 text-orange-900 dark:text-orange-200'
                    : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-200'
                }`}
              >
                {isHealthy ? (
                  <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : isExpiringSoon ? (
                  <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                ) : isInsufficient ? (
                  <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                )}

                <div className="flex-1 space-y-1">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <span className="font-bold text-sm tracking-tight">
                      {isHealthy && 'Connection Healthy & Active'}
                      {isExpiringSoon && 'Action Required: Token Near Expiry'}
                      {isInsufficient && 'Action Required: Missing WhatsApp Permissions'}
                      {isExpired && 'Critical: Access Token Expired (#190 / #200)'}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                        isHealthy
                          ? 'bg-emerald-200/80 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                          : isExpiringSoon
                          ? 'bg-amber-200/80 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                          : 'bg-red-200/80 text-red-800 dark:bg-red-900/60 dark:text-red-300'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed opacity-90">
                    {report?.statusSummary || 'Verified with Meta Cloud API.'}
                  </p>
                </div>
              </div>

              {/* 1. Token Expiration Diagnostics Card */}
              <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center space-x-1.5">
                    <Key className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Access Token Expiration &amp; Identity</span>
                  </span>
                  <span className="text-[11px] font-mono text-neutral-500">
                    Checked {report?.checkedAt ? new Date(report.checkedAt).toLocaleTimeString() : 'Just now'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-neutral-500 block">
                      Token Type
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <strong className="text-xs font-mono text-neutral-900 dark:text-white">
                        {report?.token?.tokenType || 'System User'}
                      </strong>
                      {report?.token?.isPermanent && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          PERMANENT
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-neutral-500">
                      {report?.token?.isPermanent
                        ? 'Never expires (Standard for BSPs)'
                        : 'Temporary User Access Token'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-neutral-500 block">
                      Expiration Time
                    </span>
                    <div>
                      {report?.token?.isPermanent ? (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Lifetime (Never Expires)</span>
                        </span>
                      ) : report?.token?.isExpired ? (
                        <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center space-x-1">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Expired</span>
                        </span>
                      ) : report?.token?.expiresAt ? (
                        <span
                          className={`text-xs font-bold ${
                            report.token.isNearExpiry
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-neutral-900 dark:text-white'
                          }`}
                        >
                          In {report.token.expiresInDays} days ({report.token.expiresInHours}h)
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-500">Not Available</span>
                      )}
                    </div>
                    <p className="text-[10px] text-neutral-500 truncate">
                      {report?.token?.expiresAt
                        ? new Date(report.token.expiresAt).toLocaleDateString()
                        : 'No expiry date'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-neutral-500 block">
                      Associated Meta App
                    </span>
                    <strong className="text-xs font-mono text-neutral-900 dark:text-white truncate block">
                      {report?.token?.application || 'Meta WhatsApp'}
                    </strong>
                    <p className="text-[10px] font-mono text-neutral-500 truncate">
                      App ID: {report?.token?.appId || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Permission Scopes Checklist Card */}
              <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center space-x-1.5">
                    <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>WhatsApp Permissions &amp; Scopes</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      report?.permissions?.hasSufficientPermissions
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                    }`}
                  >
                    {report?.permissions?.hasSufficientPermissions
                      ? 'All Required Scopes Active'
                      : 'Missing Required Scopes'}
                  </span>
                </div>

                <div className="space-y-2">
                  {/* whatsapp_business_messaging */}
                  {(() => {
                    const hasMessaging = (report?.permissions?.grantedScopes || []).includes('whatsapp_business_messaging');
                    return (
                      <div
                        className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                          hasMessaging
                            ? 'bg-white dark:bg-neutral-900 border-neutral-200/70 dark:border-neutral-700/50'
                            : 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900/50'
                        }`}
                      >
                        <div className="flex items-start space-x-2.5">
                          {hasMessaging ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-neutral-900 dark:text-white">
                                whatsapp_business_messaging
                              </span>
                              <span className="text-[10px] font-bold text-emerald-600 uppercase">
                                Required
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                              Allows sending broadcast campaigns, drip automation, and receiving/replying to chatbot messages.
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                            hasMessaging
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          }`}
                        >
                          {hasMessaging ? 'ACTIVE' : 'MISSING'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* whatsapp_business_management */}
                  {(() => {
                    const hasMgmt = (report?.permissions?.grantedScopes || []).includes('whatsapp_business_management');
                    return (
                      <div
                        className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                          hasMgmt
                            ? 'bg-white dark:bg-neutral-900 border-neutral-200/70 dark:border-neutral-700/50'
                            : 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900/50'
                        }`}
                      >
                        <div className="flex items-start space-x-2.5">
                          {hasMgmt ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-neutral-900 dark:text-white">
                                whatsapp_business_management
                              </span>
                              <span className="text-[10px] font-bold text-emerald-600 uppercase">
                                Required
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                              Enables creating and syncing Meta message templates, managing phone numbers, and inspecting limits.
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                            hasMgmt
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          }`}
                        >
                          {hasMgmt ? 'ACTIVE' : 'MISSING'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* business_management */}
                  {(() => {
                    const hasBiz = (report?.permissions?.grantedScopes || []).includes('business_management');
                    return (
                      <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700/50 flex items-start justify-between gap-3 text-xs">
                        <div className="flex items-start space-x-2.5">
                          {hasBiz ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <span className="w-4 h-4 rounded-full border border-neutral-300 dark:border-neutral-600 flex items-center justify-center shrink-0 mt-0.5 text-[9px] text-neutral-400">
                              -
                            </span>
                          )}
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-neutral-900 dark:text-white">
                                business_management
                              </span>
                              <span className="text-[10px] font-medium text-neutral-400">
                                Recommended
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                              Allows querying Meta Business Portfolios and managing client WABA assets.
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                            hasBiz
                              ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {hasBiz ? 'ACTIVE' : 'OPTIONAL'}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 3. Live Phone Connectivity Card */}
              {report?.phone && (
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/60 space-y-2.5">
                  <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center space-x-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Meta Cloud API Live Phone Reachability</span>
                  </span>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700/50">
                      <span className="text-[10px] text-neutral-500 block">Phone Reachability</span>
                      <strong className={`text-xs ${report.phone.reachable ? 'text-emerald-600' : 'text-red-600'}`}>
                        {report.phone.reachable ? 'Reachable' : 'Unreachable'}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700/50">
                      <span className="text-[10px] text-neutral-500 block">Verified Name</span>
                      <strong className="text-xs truncate block text-neutral-900 dark:text-white">
                        {report.phone.verifiedName || 'WhatsApp Account'}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700/50">
                      <span className="text-[10px] text-neutral-500 block">Quality Rating</span>
                      <strong className="text-xs text-emerald-600 dark:text-emerald-400">
                        {report.phone.qualityRating || 'GREEN'}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700/50">
                      <span className="text-[10px] text-neutral-500 block">Phone Status</span>
                      <strong className="text-xs text-neutral-900 dark:text-white font-mono">
                        {report.phone.status || 'CONNECTED'}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onClose();
                onOpenUpdateToken(account);
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs inline-flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Update / Replace Token</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
