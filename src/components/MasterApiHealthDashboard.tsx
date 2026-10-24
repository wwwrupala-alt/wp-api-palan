import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Zap,
  Server,
  Database,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Clock,
  ArrowUpRight,
  Send,
  MessageSquare,
  FileCode,
  Copy,
  Check,
  Play,
  RotateCcw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Terminal,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';

interface WebhookLogItem {
  id: string;
  timestamp: string;
  event: string;
  origin: string;
  details: string;
  status: 'success' | 'warning' | 'error';
  rawPayload?: any;
  latencyMs?: number;
}

interface ApiHealthData {
  success: boolean;
  timestamp: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  webhookObservability: {
    totalDeliveries: number;
    successCount: number;
    errorCount: number;
    warningCount: number;
    successRate: number;
    failureRate: number;
    averageLatencyMs: number;
    lastEventTimestamp: string | null;
    byCategory: {
      statusUpdates: number;
      incomingMessages: number;
      templateUpdates: number;
      authExchanges: number;
    };
    logs: WebhookLogItem[];
  };
  metaIntegration: {
    appIdConfigured: boolean;
    appIdMasked: string;
    appIdRaw: string;
    configIdConfigured: boolean;
    configIdMasked: string;
    appSecretConfigured: boolean;
    systemTokenConfigured: boolean;
    systemTokenScopes: string[];
    hasManagementScope: boolean;
    hasMessagingScope: boolean;
    graphVersion: string;
    webhookUrl: string;
    webhookVerifyToken: string;
    connectivityStatus: 'CONNECTED' | 'ERROR' | 'UNREACHABLE' | 'CONFIGURED_NO_TOKEN' | 'UNCONFIGURED';
    metaLatencyMs: number | null;
    metaErrorMessage: string | null;
  };
  infrastructure: {
    schedulers: {
      campaignScheduler: string;
      dripScheduler: string;
    };
    firestore: string;
    tenantsCount: number;
    totalWhatsAppAccounts: number;
    connectedWhatsAppAccounts: number;
    overallStatus: 'HEALTHY' | 'DEGRADED';
  };
}

export const MasterApiHealthDashboard: React.FC = () => {
  const toast = useToast();
  const [data, setData] = useState<ApiHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(15); // seconds, 0 = off
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'success' | 'error' | 'warning'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHealth = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/api-health');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.showError('Health Check Failed', 'Could not retrieve live API health.');
      }
    } catch (err: any) {
      if (!silent) toast.showError('Connection Error', err?.message || 'Server connection failed.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  // Handle auto-refresh interval
  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    if (autoRefreshInterval > 0) {
      autoRefreshTimerRef.current = setInterval(() => {
        fetchHealth(true);
      }, autoRefreshInterval * 1000);
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefreshInterval]);

  const handleSimulatePing = async () => {
    setPinging(true);
    try {
      const res = await fetch('/api/admin/api-health/ping-webhook', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.showSuccess(
          'Webhook Ping Verified',
          `Inbound webhook test received in ${json.latencyMs}ms. Event logged in observability stream.`
        );
        await fetchHealth(true);
      } else {
        toast.showError('Ping Failed', json.message || 'Webhook ping failed.');
      }
    } catch (err: any) {
      toast.showError('Ping Error', err?.message || 'Network error.');
    } finally {
      setPinging(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Clear all in-memory webhook logs and reset metrics counters?')) return;
    setClearing(true);
    try {
      const res = await fetch('/api/admin/api-health/clear-logs', { method: 'POST' });
      if (res.ok) {
        toast.showSuccess('Logs Cleared', 'Webhook observability stream reset.');
        await fetchHealth(true);
      }
    } catch (err: any) {
      toast.showError('Clear Error', err?.message);
    } finally {
      setClearing(false);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const obs = data?.webhookObservability;
  const meta = data?.metaIntegration;
  const infra = data?.infrastructure;

  const filteredLogs = (obs?.logs || []).filter((log) => {
    if (filterStatus !== 'ALL' && log.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchEvent = log.event.toLowerCase().includes(q);
      const matchOrigin = log.origin.toLowerCase().includes(q);
      const matchDetails = log.details.toLowerCase().includes(q);
      const matchId = log.id.toLowerCase().includes(q);
      if (!matchEvent && !matchOrigin && !matchDetails && !matchId) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Observability Bar */}
      <div className="p-5 rounded-3xl bg-neutral-900 text-white border border-neutral-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="relative">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white shadow-md ${
              infra?.overallStatus === 'HEALTHY'
                ? 'bg-emerald-600/30 border border-emerald-500/40 text-emerald-400'
                : 'bg-amber-600/30 border border-amber-500/40 text-amber-400'
            }`}>
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-neutral-900 ${
              infra?.overallStatus === 'HEALTHY' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
            }`} />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h3 className="text-base font-bold tracking-tight text-white flex items-center space-x-2">
                <span>Real-Time API Health &amp; Observability</span>
              </h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                infra?.overallStatus === 'HEALTHY'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                  : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
              }`}>
                {infra?.overallStatus || 'MONITORING'}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5 flex items-center space-x-2">
              <span>Uptime: <strong className="text-neutral-200 font-mono">{data?.uptime?.formatted || '...'}</strong></span>
              <span>&bull;</span>
              <span>Latency: <strong className="text-neutral-200 font-mono">{obs?.averageLatencyMs || 16}ms</strong></span>
              <span>&bull;</span>
              <span>Active WhatsApp Accounts: <strong className="text-neutral-200 font-mono">{infra?.connectedWhatsAppAccounts || 0} / {infra?.totalWhatsAppAccounts || 0}</strong></span>
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Auto Refresh Select */}
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-neutral-800/80 border border-neutral-700 text-xs text-neutral-300">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span>Poll:</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="bg-transparent text-white font-medium focus:outline-hidden cursor-pointer"
            >
              <option value={5} className="bg-neutral-900">5s</option>
              <option value={15} className="bg-neutral-900">15s</option>
              <option value={30} className="bg-neutral-900">30s</option>
              <option value={0} className="bg-neutral-900">Paused</option>
            </select>
          </div>

          {/* Simulate Ping Button */}
          <button
            type="button"
            onClick={handleSimulatePing}
            disabled={pinging}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Simulate inbound Meta WhatsApp webhook delivery"
          >
            {pinging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{pinging ? 'Pinging...' : 'Ping Webhook'}</span>
          </button>

          {/* Refresh All */}
          <button
            type="button"
            onClick={() => fetchHealth(false)}
            disabled={refreshing}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 4 Core Health Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: WEBHOOK SUCCESS RATE */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Webhook Delivery Success
            </span>
            <div className={`p-1.5 rounded-lg ${
              (obs?.successRate ?? 100) >= 95
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'
                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600'
            }`}>
              <Radio className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold font-mono tracking-tight text-neutral-900 dark:text-white">
              {obs?.successRate ?? 100}%
            </span>
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
              {obs?.totalDeliveries || 0} Total Deliveries
            </span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex">
              <div
                style={{ width: `${obs?.successRate ?? 100}%` }}
                className="h-full bg-emerald-500 transition-all duration-500"
              />
              <div
                style={{ width: `${obs?.failureRate ?? 0}%` }}
                className="h-full bg-rose-500 transition-all duration-500"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {obs?.successCount || 0} Success
              </span>
              <span className={`${(obs?.errorCount || 0) > 0 ? 'text-rose-600 font-bold' : 'text-neutral-400'}`}>
                {obs?.errorCount || 0} Failed
              </span>
            </div>
          </div>
        </div>

        {/* CARD 2: META CLOUD API STATUS */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Meta Cloud API Integration
            </span>
            <div className={`p-1.5 rounded-lg ${
              meta?.connectivityStatus === 'CONNECTED'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'
                : meta?.connectivityStatus === 'CONFIGURED_NO_TOKEN'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600'
                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600'
            }`}>
              <Zap className="w-4 h-4" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                meta?.connectivityStatus === 'CONNECTED'
                  ? 'bg-emerald-500 animate-pulse'
                  : meta?.connectivityStatus === 'CONFIGURED_NO_TOKEN'
                  ? 'bg-blue-500'
                  : 'bg-amber-500'
              }`} />
              <span className="text-lg font-bold text-neutral-900 dark:text-white">
                {meta?.connectivityStatus === 'CONNECTED'
                  ? 'Live & Connected'
                  : meta?.connectivityStatus === 'CONFIGURED_NO_TOKEN'
                  ? 'Embedded Flow Active'
                  : 'Attention Needed'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 font-mono">
              Graph Version: <strong className="text-neutral-700 dark:text-neutral-300">{meta?.graphVersion || 'v22.0'}</strong>
              {meta?.metaLatencyMs && ` (${meta.metaLatencyMs}ms)`}
            </p>
          </div>

          <div className="pt-1 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[11px]">
            <span className="text-neutral-500">App ID:</span>
            <span className="font-mono font-medium text-neutral-700 dark:text-neutral-300">
              {meta?.appIdMasked || 'Not set'}
            </span>
          </div>
        </div>

        {/* CARD 3: TOKEN PERMISSIONS HEALTH */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Token Permissions Health
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 dark:text-neutral-300">Messaging Scope:</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                meta?.hasMessagingScope
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600'
              }`}>
                {meta?.hasMessagingScope ? 'Active' : 'Missing'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 dark:text-neutral-300">Templates Scope:</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                meta?.hasManagementScope
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
              }`}>
                {meta?.hasManagementScope ? 'Active' : 'Notice (No Mgmt)'}
              </span>
            </div>
          </div>

          <p className="text-[10px] text-neutral-400 leading-tight pt-1 border-t border-neutral-100 dark:border-neutral-800">
            {meta?.hasManagementScope
              ? 'Full WhatsApp management authorized.'
              : 'Add "whatsapp_business_management" in Meta Console for template sync.'}
          </p>
        </div>

        {/* CARD 4: INFRASTRUCTURE & SCHEDULERS */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Platform Infrastructure
            </span>
            <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-600">
              <Server className="w-4 h-4" />
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600 dark:text-neutral-300">Primary Database:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>HEALTHY</span>
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-600 dark:text-neutral-300">Campaign Engine:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                {infra?.schedulers?.campaignScheduler || 'RUNNING'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-600 dark:text-neutral-300">Drip Engine:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                {infra?.schedulers?.dripScheduler || 'RUNNING'}
              </span>
            </div>
          </div>

          <div className="pt-1 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
            <span>RAM Heap: {data?.memory?.heapUsedMb || 0} MB</span>
            <span>RSS: {data?.memory?.rssMb || 0} MB</span>
          </div>
        </div>
      </div>

      {/* Observability Breakdown by Webhook Categories */}
      <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>Webhook Event Categories &amp; Throughput</span>
            </h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Live distribution of incoming events delivered from Meta WhatsApp Cloud API to this server.
            </p>
          </div>
          <span className="text-[11px] font-mono text-neutral-500">
            Last Event:{' '}
            {obs?.lastEventTimestamp
              ? new Date(obs.lastEventTimestamp).toLocaleTimeString()
              : 'Awaiting webhook traffic'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 space-y-1">
            <span className="text-[11px] text-neutral-500 uppercase tracking-wider font-semibold">
              Status Updates
            </span>
            <p className="text-2xl font-bold font-mono text-neutral-900 dark:text-white">
              {obs?.byCategory?.statusUpdates || 0}
            </p>
            <p className="text-[10px] text-neutral-400">Sent, Delivered, Read, Failed</p>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 space-y-1">
            <span className="text-[11px] text-neutral-500 uppercase tracking-wider font-semibold">
              Inbound Messages
            </span>
            <p className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
              {obs?.byCategory?.incomingMessages || 0}
            </p>
            <p className="text-[10px] text-neutral-400">Customer replies &amp; media</p>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 space-y-1">
            <span className="text-[11px] text-neutral-500 uppercase tracking-wider font-semibold">
              Template Status
            </span>
            <p className="text-2xl font-bold font-mono text-teal-600 dark:text-teal-400">
              {obs?.byCategory?.templateUpdates || 0}
            </p>
            <p className="text-[10px] text-neutral-400">Approved, Rejected reviews</p>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 space-y-1">
            <span className="text-[11px] text-neutral-500 uppercase tracking-wider font-semibold">
              Auth Exchanges
            </span>
            <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {obs?.byCategory?.authExchanges || 0}
            </p>
            <p className="text-[10px] text-neutral-400">Embedded Signup &amp; OBO</p>
          </div>
        </div>
      </div>

      {/* Live Webhook Events Stream & Observability Log Feed */}
      <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-emerald-600" />
              <span>Live Webhook Deliveries Stream ({filteredLogs.length})</span>
            </h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              High-fidelity inspection stream showing every inbound webhook delivery from Meta.
            </p>
          </div>

          {/* Search, Filter & Clear */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search event, phone, trace ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center rounded-xl border border-neutral-200 dark:border-neutral-700 p-0.5 bg-neutral-50 dark:bg-neutral-800 text-[11px] font-medium">
              {(['ALL', 'success', 'error', 'warning'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 rounded-lg capitalize transition-colors cursor-pointer ${
                    filterStatus === st
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleClearLogs}
              disabled={clearing}
              className="p-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-rose-600 transition-colors cursor-pointer"
              title="Clear webhook logs stream"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Log items feed */}
        {filteredLogs.length === 0 ? (
          <div className="py-12 px-4 text-center rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-dashed border-neutral-200 dark:border-neutral-700 space-y-2">
            <Radio className="w-8 h-8 text-neutral-400 mx-auto" />
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              No webhook events match current filter.
            </p>
            <p className="text-[11px] text-neutral-400">
              Click &quot;Ping Webhook&quot; above to simulate an immediate verified delivery test.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden font-mono text-xs">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div key={log.id} className="bg-white dark:bg-neutral-900 hover:bg-neutral-50/70 dark:hover:bg-neutral-800/50 transition-colors">
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-3.5 flex items-start justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-start space-x-2.5">
                      <span className={`mt-0.5 inline-block w-2 h-2 rounded-full shrink-0 ${
                        log.status === 'success'
                          ? 'bg-emerald-500'
                          : log.status === 'error'
                          ? 'bg-rose-500'
                          : 'bg-amber-500'
                      }`} />
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-bold text-neutral-900 dark:text-white">
                            {log.event}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-sans">
                            {log.origin}
                          </span>
                          {log.latencyMs && (
                            <span className="text-[10px] text-neutral-400">
                              {log.latencyMs}ms
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-600 dark:text-neutral-300 font-sans break-all">
                          {log.details}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0 text-[11px] text-neutral-400">
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  {/* Expanded JSON payload */}
                  {isExpanded && (
                    <div className="p-3.5 bg-neutral-950 text-neutral-200 border-t border-neutral-800 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <span>Payload Inspection (Trace: {log.id})</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(JSON.stringify(log.rawPayload || log, null, 2), log.id)}
                          className="flex items-center space-x-1 text-purple-400 hover:underline cursor-pointer"
                        >
                          {copiedId === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedId === log.id ? 'Copied' : 'Copy JSON'}</span>
                        </button>
                      </div>
                      <pre className="text-[11px] overflow-x-auto p-2.5 rounded-lg bg-neutral-900/90 text-emerald-400 border border-neutral-800">
                        {JSON.stringify(log.rawPayload || { event: log.event, origin: log.origin, details: log.details, status: log.status }, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
