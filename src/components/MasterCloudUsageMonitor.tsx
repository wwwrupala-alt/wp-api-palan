import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Cloud,
  Server,
  Activity,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Search,
  Filter,
  DollarSign,
  Info,
  Clock,
  Layers,
  Users,
  MessageSquare,
  Sparkles,
  ArrowRight,
  HardDrive,
  Cpu,
  Zap,
} from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';

export const MasterCloudUsageMonitor: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'moderate' | 'high'>('all');

  const fetchCloudUsage = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/master/cloud-usage');
      const json = await res.json();
      if (json.success) {
        setData(json);
        setLastRefreshed(new Date().toLocaleTimeString());
      } else {
        toast.showError('Fetch Failed', json.error || 'Could not load cloud quota metrics.');
      }
    } catch (err: any) {
      toast.showError('Network Notice', err.message || 'Failed to connect to cloud metrics service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCloudUsage();
  }, []);

  const filteredTenants = useMemo(() => {
    if (!data?.tenants) return [];
    return data.tenants.filter((t: any) => {
      if (statusFilter !== 'all' && t.quotaHealth !== statusFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const m1 = (t.businessName || '').toLowerCase().includes(q);
        const m2 = (t.adminName || '').toLowerCase().includes(q);
        const m3 = (t.adminPhone || '').toLowerCase().includes(q);
        const m4 = (t.orgId || '').toLowerCase().includes(q);
        if (!m1 && !m2 && !m3 && !m4) return false;
      }
      return true;
    });
  }, [data?.tenants, searchTerm, statusFilter]);

  if (loading && !data) {
    return (
      <div className="py-24 text-center space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-600" />
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
          Calculating Real-time Cloud Quota & Database Usage across all Admins & Users...
        </p>
        <p className="text-xs text-neutral-400">
          Aggregating Firebase reads, writes, documents and Cloud Run statistics
        </p>
      </div>
    );
  }

  const fb = data?.firebaseUsage;
  const cr = data?.cloudRunUsage;
  const meta = data?.metaApiUsage;
  const advisor = data?.upgradeAdvisor;
  const summary = data?.summary;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Strip with Live Status & Next Reset */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-lg shadow-2xs shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                SaaS Cloud Resource &amp; Free-Tier Quota Monitor
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 uppercase tracking-wider">
                100% Free Tier Live
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Across all {summary?.totalAdmins || 0} Admins, {summary?.totalUsers || 0} Team Agents &amp; {summary?.totalOrganizations || 0} Organizations
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-500">Daily Reset:</span>
            <span className="font-bold text-neutral-800 dark:text-neutral-200">1:30 PM IST (Daily)</span>
          </div>

          <button
            type="button"
            onClick={fetchCloudUsage}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh Quotas'}</span>
          </button>
        </div>
      </div>

      {/* "FREE SE PAID ME KAB JANA HE?" - UPGRADE READINESS ADVISOR BANNER */}
      <div className={`p-5 rounded-3xl border shadow-sm transition-all ${
        advisor?.isUpgradeRequired
          ? 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
          : advisor?.isWarningZone
          ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
          : 'bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white dark:from-emerald-950/20 dark:via-neutral-900 dark:to-neutral-900 border-emerald-200/80 dark:border-emerald-800/60'
      }`}>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center space-x-2">
              <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                advisor?.isUpgradeRequired
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200'
                  : advisor?.isWarningZone
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
              }`}>
                {advisor?.isUpgradeRequired ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                )}
                <span>
                  {advisor?.isUpgradeRequired
                    ? 'Upgrade Recommended (Nearing Quota)'
                    : advisor?.isWarningZone
                    ? 'Moderate Load (Monitor Growth)'
                    : 'Free Tier Status: 100% Optimal & Safe'}
                </span>
              </span>
              <span className="text-[11px] text-neutral-400">
                Peak Resource Used: <strong className="font-mono text-neutral-800 dark:text-neutral-200">{advisor?.maxUtilizationPercent}%</strong>
              </span>
            </div>

            <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
              Upgrade Readiness Advisor: Free se Paid me kab jana hai?
            </h4>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              {advisor?.advice}
            </p>
          </div>

          {/* Cost Estimates Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full lg:w-auto shrink-0 text-xs">
            <div className="p-3 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-center space-y-0.5">
              <span className="text-[10px] text-neutral-400 font-semibold uppercase block">Current Cost</span>
              <p className="text-base font-black text-emerald-600 font-mono">₹0.00</p>
              <span className="text-[9px] text-neutral-400">100% Free Quota</span>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-center space-y-0.5">
              <span className="text-[10px] text-neutral-400 font-semibold uppercase block">If Traffic 2X</span>
              <p className="text-base font-black text-amber-600 font-mono">~₹35/mo</p>
              <span className="text-[9px] text-neutral-400">Blaze Pay-as-you-go</span>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-center space-y-0.5 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-neutral-400 font-semibold uppercase block">With 100+ Admins</span>
              <p className="text-base font-black text-purple-600 font-mono">~₹140/mo</p>
              <span className="text-[9px] text-neutral-400">50k+ daily msgs</span>
            </div>
          </div>
        </div>
      </div>

      {/* CORE 4 FREE-TIER QUOTA METRIC GAUGES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Firebase Daily Writes */}
        <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xs">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-xs text-neutral-900 dark:text-white">Firestore Writes</p>
                <p className="text-[10px] text-neutral-400">Daily Free Quota</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-blue-600">
              {fb?.dailyWrites?.percentage}%
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="font-bold text-neutral-900 dark:text-white">
                {fb?.dailyWrites?.used?.toLocaleString()} / {fb?.dailyWrites?.limit?.toLocaleString()}
              </span>
              <span className="text-neutral-400">
                {fb?.dailyWrites?.remaining?.toLocaleString()} left
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  fb?.dailyWrites?.percentage > 85
                    ? 'bg-red-500'
                    : fb?.dailyWrites?.percentage > 60
                    ? 'bg-amber-500'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, fb?.dailyWrites?.percentage || 0)}%` }}
              />
            </div>
          </div>

          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
            Counts new messages, drip steps &amp; status transitions. Resets daily.
          </p>
        </div>

        {/* Metric 2: Firebase Daily Reads */}
        <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-xs">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-xs text-neutral-900 dark:text-white">Firestore Reads</p>
                <p className="text-[10px] text-neutral-400">Daily Free Quota</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-600">
              {fb?.dailyReads?.percentage}%
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="font-bold text-neutral-900 dark:text-white">
                {fb?.dailyReads?.used?.toLocaleString()} / {fb?.dailyReads?.limit?.toLocaleString()}
              </span>
              <span className="text-neutral-400">
                {fb?.dailyReads?.remaining?.toLocaleString()} left
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  fb?.dailyReads?.percentage > 85
                    ? 'bg-red-500'
                    : fb?.dailyReads?.percentage > 60
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, fb?.dailyReads?.percentage || 0)}%` }}
              />
            </div>
          </div>

          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
            50,000 document reads/day free for dashboards, inbox &amp; analytics.
          </p>
        </div>

        {/* Metric 3: Total DB Storage */}
        <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold text-xs">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-xs text-neutral-900 dark:text-white">Database Storage</p>
                <p className="text-[10px] text-neutral-400">Permanent 1 GB Free</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-purple-600">
              {fb?.storage?.percentage}%
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="font-bold text-neutral-900 dark:text-white">
                {fb?.storage?.usedMB} MB / {fb?.storage?.limitMB} MB
              </span>
              <span className="text-neutral-400">
                {fb?.storage?.remainingMB} MB free
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-500"
                style={{ width: `${Math.min(100, fb?.storage?.percentage || 0)}%` }}
              />
            </div>
          </div>

          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
            Can store ~{((fb?.storage?.estimatedMessagesCapacity || 0) / 100000).toFixed(1)} Lakh more messages before filling 1 GB.
          </p>
        </div>

        {/* Metric 4: Cloud Run Server Requests */}
        <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-xs">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-xs text-neutral-900 dark:text-white">Cloud Run Server</p>
                <p className="text-[10px] text-neutral-400">20 Lakh Req/Mo Free</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-amber-600">
              {cr?.monthlyRequests?.percentage}%
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="font-bold text-neutral-900 dark:text-white">
                ~{(cr?.monthlyRequests?.used / 1000).toFixed(0)}k / 2,000k
              </span>
              <span className="text-neutral-400">
                Region: asia-east1
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500"
                style={{ width: `${Math.min(100, cr?.monthlyRequests?.percentage || 0)}%` }}
              />
            </div>
          </div>

          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
            Node.js RAM: {cr?.nodeMemoryMB?.heapUsed} MB heap &bull; 24x7 High Availability.
          </p>
        </div>
      </div>

      {/* PER-ADMIN / PER-TENANT RESOURCE CONSUMPTION TABLE */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-bold text-base text-neutral-900 dark:text-white flex items-center space-x-2">
              <span>Admin Tenant Resource Consumption</span>
              <span className="text-xs font-normal text-neutral-400">
                ({filteredTenants.length} Tenants)
              </span>
            </h4>
            <p className="text-xs text-neutral-500 mt-0.5">
              Har Admin aur unke Users ka alag-alag database aur WhatsApp traffic breakdown.
            </p>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search business or phone..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center space-x-1 p-0.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white dark:bg-neutral-900 text-amber-600 shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('safe')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'safe'
                    ? 'bg-white dark:bg-neutral-900 text-emerald-600 shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                Safe
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('moderate')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'moderate'
                    ? 'bg-white dark:bg-neutral-900 text-amber-600 shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                Moderate
              </button>
            </div>
          </div>
        </div>

        {/* Table (Shows ~10 entries in box view with internal scroll) */}
        <div className="overflow-x-auto max-h-[550px] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xs divide-y divide-neutral-200 dark:divide-neutral-800">
          <table className="w-full text-left border-collapse text-xs relative">
            <thead className="sticky top-0 z-10 bg-neutral-100 dark:bg-neutral-800 shadow-xs">
              <tr className="border-b border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800">Admin Business</th>
                <th className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800">Contact Phone</th>
                <th className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800">Team Agents</th>
                <th className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800">Connected WA</th>
                <th className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800">Campaigns &amp; Drips</th>
                <th className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800">Total Messages</th>
                <th className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800">Est. Daily Writes</th>
                <th className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800">Storage Share</th>
                <th className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800 text-right">Quota Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-neutral-400">
                    No admin tenant matches your search criteria.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t: any) => (
                  <tr key={t.orgId} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <span className="font-bold text-neutral-900 dark:text-white block">
                          {t.businessName}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          Org ID: {t.orgId} &bull; {t.adminName}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                      {t.adminPhone}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px]">
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {t.userCount} Agents
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {t.whatsAppCount} Number{t.whatsAppCount !== 1 ? 's' : ''}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-[11px] text-neutral-600 dark:text-neutral-300">
                      <span>{t.campaignCount} Broadcasts &bull; {t.dripCount} Drips</span>
                      {t.dripSubscribersCount > 0 && (
                        <p className="text-[10px] text-amber-600 font-mono">
                          {t.dripSubscribersCount} subscribers enrolled
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <span className="font-bold font-mono text-neutral-900 dark:text-white block">
                          {t.totalMessages} sent
                        </span>
                        <span className="text-[10px] text-emerald-600 font-semibold">
                          {t.totalDelivered} delivered ({t.totalMessages > 0 ? Math.round((t.totalDelivered / t.totalMessages) * 100) : 100}%)
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                      ~{t.estimatedDailyWrites} / day
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                      {t.estimatedStorageKB < 1024
                        ? `${t.estimatedStorageKB} KB`
                        : `${(t.estimatedStorageKB / 1024).toFixed(1)} MB`}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        t.quotaHealth === 'high'
                          ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800'
                          : t.quotaHealth === 'moderate'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          t.quotaHealth === 'high' ? 'bg-red-500' : t.quotaHealth === 'moderate' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                        <span className="capitalize">{t.quotaHealth}</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer / Scroll Guidance */}
        <div className="flex flex-wrap items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 px-1 pt-1">
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Showing <strong>{Math.min(10, filteredTenants.length)}</strong> entries in view of <strong>{filteredTenants.length}</strong> total tenants
            </span>
          </div>
          {filteredTenants.length > 10 ? (
            <div className="flex items-center space-x-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800">
              <span>Scroll inside box &darr; to view remaining {filteredTenants.length - 10} entries</span>
            </div>
          ) : (
            <span className="text-[11px] text-neutral-400">All filtered entries currently in view</span>
          )}
        </div>
      </div>

      {/* PRACTICAL GUIDELINES FOR THE SAAS OWNER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-3xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700 space-y-2">
          <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>1. Free Capacity Ceiling</span>
          </div>
          <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed text-[11px]">
            Aapka system <strong>30 se 50 Admins</strong> aur unke <strong>150+ team agents</strong> ko bina ₹1 kharch kiye 24x7 sambhal sakta hai.
          </p>
        </div>

        <div className="p-4 rounded-3xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700 space-y-2">
          <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 font-bold">
            <Zap className="w-4 h-4" />
            <span>2. Kab Paid (Blaze) Plan Chahiye?</span>
          </div>
          <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed text-[11px]">
            Jab daily messages <strong>15,000 cross</strong> karne lagein ya writes <strong>18,000/day</strong> ho jayein, tab Firebase me Blaze plan on karke ₹100 ka budget alert laga lein.
          </p>
        </div>

        <div className="p-4 rounded-3xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700 space-y-2">
          <div className="flex items-center space-x-2 text-purple-600 dark:text-purple-400 font-bold">
            <DollarSign className="w-4 h-4" />
            <span>3. Paid Upgrade Ka Real Kharcha</span>
          </div>
          <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed text-[11px]">
            Firebase Blaze plan me bhi 20k writes aur 50k reads free hi rehte hain. Extra load ka kharcha mahine ka sirf <strong>₹30 se ₹100</strong> aayega.
          </p>
        </div>
      </div>
    </div>
  );
};
