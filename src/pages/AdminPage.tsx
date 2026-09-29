import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Users,
  Smartphone,
  RefreshCw,
  Terminal,
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Lock,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import type { WebhookLog } from '../types/index.ts';

export const AdminPage: React.FC = () => {
  const { userProfile, organization } = useAuth();
  const { accounts, metaStatus, refreshMetaStatus } = useWhatsAppAccounts();

  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [activeTab, setActiveTab] = useState<'logs' | 'config' | 'members'>('logs');
  const [copiedUrl, setCopiedUrl] = useState(false);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/meta/webhook/logs');
      if (res.ok) {
        const data = await res.json();
        setWebhookLogs(data.logs || []);
      }
    } catch (err) {
      console.warn('Failed to load webhook logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const copyWebhookUrl = () => {
    const url = metaStatus?.webhookUrl || `${window.location.origin}/api/meta/webhook`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center space-x-2">
            <span>Admin &amp; System Audit</span>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
              Role: {userProfile?.role || 'owner'}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Tenant configuration, real-time Meta Webhook delivery stream, and API status.
          </p>
        </div>

        <button
          onClick={() => {
            fetchLogs();
            refreshMetaStatus();
          }}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 space-x-6 text-xs font-medium">
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
            activeTab === 'logs'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Meta Webhook Logs ({webhookLogs.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
            activeTab === 'config'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Meta API Diagnostics</span>
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
            activeTab === 'members'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Tenant &amp; Workspace</span>
        </button>
      </div>

      {/* Tab: Webhook Logs */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between text-[11px] text-neutral-400 border-b border-neutral-800 pb-2">
              <span className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Meta Webhook Event Stream</span>
              </span>
              <span>Listening on: /api/meta/webhook</span>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 text-xs">
                No data yet. Incoming message events, delivery receipts, and status callbacks from Meta WhatsApp Cloud API will stream here in real time.
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {webhookLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg bg-neutral-800/60 border border-neutral-700/50 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span
                        className={`font-bold uppercase ${
                          log.status === 'success'
                            ? 'text-emerald-400'
                            : log.status === 'error'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {log.event}
                      </span>
                      <span className="text-neutral-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-neutral-300 text-xs">{log.details}</p>
                    <p className="text-[10px] text-neutral-500">Source: {log.origin}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Meta Config & Diagnostics */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">
              Server-Side Meta Configuration Diagnostics
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              In accordance with WhatsApp Business Platform security policies, sensitive access tokens, secrets, and private credentials are processed exclusively server-side and never exposed to the frontend.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 flex items-center justify-between">
                <div>
                  <p className="font-medium text-neutral-800 dark:text-neutral-200">META_APP_ID</p>
                  <p className="text-[11px] text-neutral-500">Only required for Facebook Embedded Signup popup</p>
                </div>
                {metaStatus?.appIdSet ? (
                  <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Configured</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
                    <AlertCircle className="w-4 h-4" />
                    <span>Optional (Not Set)</span>
                  </span>
                )}
              </div>

              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 flex items-center justify-between">
                <div>
                  <p className="font-medium text-neutral-800 dark:text-neutral-200">META_APP_SECRET</p>
                  <p className="text-[11px] text-neutral-500">Only required for Facebook Embedded Signup popup</p>
                </div>
                {metaStatus?.appSecretSet ? (
                  <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Configured</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
                    <AlertCircle className="w-4 h-4" />
                    <span>Optional (Not Set)</span>
                  </span>
                )}
              </div>

              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 flex items-center justify-between">
                <div>
                  <p className="font-medium text-neutral-800 dark:text-neutral-200">META_SYSTEM_USER_ACCESS_TOKEN</p>
                  <p className="text-[11px] text-neutral-500">Permanent Token for Cloud API sending</p>
                </div>
                {metaStatus?.systemTokenSet ? (
                  <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Configured</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 text-neutral-500 font-semibold text-[11px]">
                    <span>Optional (Passed in exchange)</span>
                  </span>
                )}
              </div>

              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 flex items-center justify-between">
                <div>
                  <p className="font-medium text-neutral-800 dark:text-neutral-200">META_GRAPH_VERSION</p>
                  <p className="text-[11px] text-neutral-500">Graph API Endpoint Version</p>
                </div>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                  {metaStatus?.graphVersion || 'v22.0'}
                </span>
              </div>
            </div>

            {/* Webhook endpoint helper */}
            <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
              <span className="font-semibold text-neutral-900 dark:text-white text-xs block">
                Meta Developer Portal Webhook Callback:
              </span>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={metaStatus?.webhookUrl || `${window.location.origin}/api/meta/webhook`}
                  className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-xs font-mono text-neutral-800 dark:text-neutral-200"
                />
                <button
                  onClick={copyWebhookUrl}
                  className="px-3.5 py-2 rounded-xl bg-neutral-800 dark:bg-neutral-700 hover:bg-neutral-900 text-white text-xs font-medium flex items-center space-x-1"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tenant & Workspace */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">Workspace Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Organization Name</span>
                <span className="font-medium text-neutral-900 dark:text-white">{organization?.name}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Organization ID</span>
                <span className="font-mono text-neutral-800 dark:text-neutral-200">{organization?.id}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Owner UID</span>
                <span className="font-mono text-neutral-800 dark:text-neutral-200">{organization?.ownerId}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Created Date</span>
                <span className="text-neutral-800 dark:text-neutral-200">
                  {organization?.createdAt ? new Date(organization.createdAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-white">Role-Based Access Control (RBAC)</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Multi-tenant isolation is strictly enforced at the Firestore Security Rules layer. Users in this workspace cannot access contacts, messages, or campaigns belonging to other organizations.
            </p>
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden text-xs">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 font-semibold border-b border-neutral-200 dark:border-neutral-800 flex justify-between">
                <span>Current User</span>
                <span>Role</span>
              </div>
              <div className="p-3 flex justify-between items-center">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">{userProfile?.displayName}</p>
                  <p className="text-[11px] text-neutral-500 font-mono">{userProfile?.email}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                  {userProfile?.role}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
