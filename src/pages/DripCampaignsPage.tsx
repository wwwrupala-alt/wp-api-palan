import React, { useState, useEffect, useMemo } from 'react';
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit,
  Eye,
  Users,
  Clock,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
  ArrowRight,
  ShieldAlert,
  Send,
  Zap,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeDripCampaigns,
  deleteDripCampaign,
  toggleDripCampaignStatusApi,
} from '../lib/services.ts';
import type { DripCampaign } from '../types/index.ts';
import { CreateDripCampaignModal } from '../components/drip/CreateDripCampaignModal.tsx';
import { DripSubscribersModal } from '../components/drip/DripSubscribersModal.tsx';
import { DripFlowModal } from '../components/drip/DripFlowModal.tsx';
import { DripBlueprintsModal, DripBlueprint } from '../components/drip/DripBlueprintsModal.tsx';

interface DripCampaignsPageProps {
  onNavigateToCampaigns?: () => void;
}

export const DripCampaignsPage: React.FC<DripCampaignsPageProps> = ({
  onNavigateToCampaigns,
}) => {
  const { organization } = useAuth();
  const { activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [campaigns, setCampaigns] = useState<DripCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'completed' | 'draft'>('all');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [campaignToEdit, setCampaignToEdit] = useState<DripCampaign | null>(null);

  const [selectedSubscribersCampaign, setSelectedSubscribersCampaign] = useState<DripCampaign | null>(null);
  const [selectedFlowCampaign, setSelectedFlowCampaign] = useState<DripCampaign | null>(null);
  const [blueprintsModalOpen, setBlueprintsModalOpen] = useState(false);

  // Status toggle action loading
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<DripCampaign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!organization?.id) return;
    setLoading(true);

    const unsub = subscribeDripCampaigns(
      organization.id,
      (data) => {
        setCampaigns(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [organization?.id]);

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        q === '' ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q);

      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [campaigns, searchQuery, statusFilter]);

  // Overall KPI statistics
  const kpiStats = useMemo(() => {
    const total = campaigns.length;
    const active = campaigns.filter((c) => c.status === 'active').length;
    const enrolled = campaigns.reduce((acc, c) => acc + (c.enrolledCount || 0), 0);
    const activeSubs = campaigns.reduce((acc, c) => acc + (c.activeSubscribers || 0), 0);
    const completedSubs = campaigns.reduce((acc, c) => acc + (c.completedSubscribers || 0), 0);
    const totalMessages = campaigns.reduce((acc, c) => acc + (c.stats?.totalMessagesSent || 0), 0);

    return { total, active, enrolled, activeSubs, completedSubs, totalMessages };
  }, [campaigns]);

  // Toggle active/paused status
  const handleToggleStatus = async (camp: DripCampaign) => {
    if (!organization?.id) return;
    const newStatus = camp.status === 'active' ? 'paused' : 'active';
    setTogglingId(camp.id);

    try {
      await toggleDripCampaignStatusApi(organization.id, camp.id, newStatus);
      toast.showSuccess(
        `Sequence ${newStatus === 'active' ? 'Resumed' : 'Paused'}`,
        `"${camp.name}" is now ${newStatus}.`
      );
    } catch (err: any) {
      toast.showError('Status Update Failed', err?.message || 'Could not update status.');
    } finally {
      setTogglingId(null);
    }
  };

  // Delete handler
  const handleConfirmDelete = async () => {
    if (!organization?.id || !deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDripCampaign(organization.id, deleteTarget.id);
      toast.showSuccess(
        'Drip Campaign Deleted',
        `"${deleteTarget.name}" and its subscribers were removed.`
      );
      setDeleteTarget(null);
    } catch (err: any) {
      toast.showError('Delete Failed', err?.message || 'Failed to delete drip campaign.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Breadcrumb & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Workflow className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
                  Drip Campaigns & Automated Sequences
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Pro Feature
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Multi-step WhatsApp nurture funnels with smart delay timers and reply-based exit conditions.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5">
          {onNavigateToCampaigns && (
            <button
              type="button"
              onClick={onNavigateToCampaigns}
              className="px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
            >
              Broadcast Campaigns
            </button>
          )}

          <button
            type="button"
            onClick={() => setBlueprintsModalOpen(true)}
            className="px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center space-x-1.5 hover:bg-amber-100 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Blueprints</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCampaignToEdit(null);
              setCreateModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Create Drip Sequence</span>
          </button>
        </div>
      </div>

      {/* Engine Status Banner */}
      <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-emerald-900 dark:text-emerald-200">
            Automated Drip Engine Active:
          </span>
          <span className="text-neutral-600 dark:text-neutral-400">
            Background worker automatically scans and dispatches due sequence steps every 20 seconds.
          </span>
        </div>
        <div className="hidden sm:flex items-center space-x-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
          <Clock className="w-3.5 h-3.5" />
          <span>Polling Cycle: 20s</span>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
            Drip Sequences
          </span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-neutral-900 dark:text-white font-mono">
              {kpiStats.total}
            </span>
            <span className="text-xs text-neutral-500">total created</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            Running Live
          </span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {kpiStats.active}
            </span>
            <span className="text-xs text-emerald-500">active now</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
            In-Flight Subscribers
          </span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {kpiStats.activeSubs}
            </span>
            <span className="text-xs text-neutral-500">in progression</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs">
          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
            Graduated (Completed)
          </span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
              {kpiStats.completedSubs}
            </span>
            <span className="text-xs text-neutral-500">finished steps</span>
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs">
          <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
            Automated Messages
          </span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
              {kpiStats.totalMessages}
            </span>
            <span className="text-xs text-neutral-500">dispatched</span>
          </div>
        </div>
      </div>

      {/* Filter Pills & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200'
            }`}
          >
            All Sequences ({campaigns.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active ({campaigns.filter((c) => c.status === 'active').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('paused')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'paused'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100'
            }`}
          >
            Paused ({campaigns.filter((c) => c.status === 'paused').length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
          <input
            type="text"
            value={searchQuery || ''}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search drip sequences..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Main Campaign Cards List */}
      {loading ? (
        <div className="py-24 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
          <p className="text-xs text-neutral-500">Loading Drip Campaigns...</p>
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="p-8 sm:p-12 rounded-3xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 text-center space-y-5 bg-white dark:bg-neutral-900/60">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-inner">
            <Workflow className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h3 className="font-bold text-lg text-neutral-900 dark:text-white">
              No Drip Campaigns Found
            </h3>
            <p className="text-xs text-neutral-500">
              {campaigns.length === 0
                ? 'Automate your WhatsApp conversations by creating multi-step drip funnels with delays and smart reply stop rules.'
                : 'No campaigns match your filter or search query.'}
            </p>
          </div>

          {campaigns.length === 0 && (
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setBlueprintsModalOpen(true)}
                className="px-4 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center space-x-1.5 hover:bg-amber-100 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Browse Ready-Made Blueprints</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCampaignToEdit(null);
                  setCreateModalOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Drip Sequence</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCampaigns.map((camp) => {
            const steps = camp.steps || [];
            const isActive = camp.status === 'active';
            const isToggling = togglingId === camp.id;

            return (
              <div
                key={camp.id}
                className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 sm:p-6 shadow-sm hover:border-emerald-500/40 transition-all space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Workflow className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                          {camp.name}
                        </h3>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center space-x-1 ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                          <span>{camp.status}</span>
                        </span>
                      </div>
                      {camp.description && (
                        <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                          {camp.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Primary Row Action Buttons */}
                  <div className="flex items-center space-x-2 self-end sm:self-auto">
                    {/* Status Toggle Play/Pause */}
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => handleToggleStatus(camp)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs ${
                        isActive
                          ? 'border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/60'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isToggling ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isActive ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>{isActive ? 'Pause' : 'Activate'}</span>
                    </button>

                    {/* Flowchart Modal Button */}
                    <button
                      type="button"
                      title="Inspect visual sequence flowchart"
                      onClick={() => setSelectedFlowCampaign(camp)}
                      className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Subscribers Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedSubscribersCampaign(camp)}
                      className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Subscribers ({camp.enrolledCount || 0})</span>
                    </button>

                    {/* Edit Button */}
                    <button
                      type="button"
                      title="Edit sequence"
                      onClick={() => {
                        setCampaignToEdit(camp);
                        setCreateModalOpen(true);
                      }}
                      className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 cursor-pointer"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      title="Delete campaign"
                      onClick={() => setDeleteTarget(camp)}
                      className="p-2 rounded-xl border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Steps Visual Chain Strip */}
                <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 font-semibold uppercase tracking-wider">
                    <span>Sequence Steps ({steps.length}):</span>
                    <span>Audience Trigger: {camp.triggerType.replace('_', ' ')}</span>
                  </div>

                  <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
                    {steps.map((st, i) => (
                      <React.Fragment key={st.id || i}>
                        <div
                          onClick={() => setSelectedFlowCampaign(camp)}
                          className="px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shrink-0 text-xs shadow-2xs hover:border-emerald-500 cursor-pointer transition-all"
                        >
                          <div className="flex items-center space-x-1.5">
                            <span className="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] flex items-center justify-center font-mono">
                              {st.stepNumber}
                            </span>
                            <span className="font-bold text-neutral-900 dark:text-white truncate max-w-[140px]">
                              {st.title || `Step ${st.stepNumber}`}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 text-[10px] text-neutral-500 mt-1">
                            <span className="font-mono text-amber-600 dark:text-amber-400">
                              {st.delayValue === 0 ? '⚡ 0m delay' : `+${st.delayValue} ${st.delayUnit}`}
                            </span>
                            <span>•</span>
                            <span className="truncate max-w-[90px]">{st.templateName || 'Template'}</span>
                          </div>
                        </div>

                        {i < steps.length - 1 && (
                          <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Progress & Stat Metrics Footer */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs">
                  {/* Subscriber Progression Bar */}
                  <div className="flex-1 min-w-[260px] space-y-1.5">
                    <div className="flex justify-between text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                      <span>
                        Audience Progress: <strong className="text-neutral-900 dark:text-white">{camp.completedSubscribers || 0}</strong> of {camp.enrolledCount || 0} completed
                      </span>
                      <span>
                        {camp.enrolledCount > 0
                          ? `${Math.round(((camp.completedSubscribers || 0) / camp.enrolledCount) * 100)}%`
                          : '0%'}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex">
                      <div
                        className="bg-blue-500 h-full transition-all"
                        style={{
                          width: `${
                            camp.enrolledCount > 0
                              ? Math.min(100, ((camp.completedSubscribers || 0) / camp.enrolledCount) * 100)
                              : 0
                          }%`,
                        }}
                      />
                      <div
                        className="bg-emerald-500 h-full transition-all"
                        style={{
                          width: `${
                            camp.enrolledCount > 0
                              ? Math.min(100, ((camp.activeSubscribers || 0) / camp.enrolledCount) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Message Sent / Delivered Counter */}
                  <div className="flex items-center space-x-3 text-neutral-500 font-medium">
                    <div className="text-right">
                      <span className="text-[10px] text-neutral-400 uppercase block font-semibold">
                        Dispatched
                      </span>
                      <span className="font-bold text-neutral-900 dark:text-white font-mono text-xs">
                        {camp.stats?.totalMessagesSent || 0} msgs
                      </span>
                    </div>
                    <div className="h-6 w-px bg-neutral-200 dark:border-neutral-800" />
                    <button
                      type="button"
                      onClick={() => setSelectedSubscribersCampaign(camp)}
                      className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer flex items-center space-x-1"
                    >
                      <span>Manage Subscribers</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Campaign Modal */}
      <CreateDripCampaignModal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setCampaignToEdit(null);
        }}
        campaignToEdit={campaignToEdit}
      />

      {/* Subscribers Progression Modal */}
      <DripSubscribersModal
        isOpen={Boolean(selectedSubscribersCampaign)}
        onClose={() => setSelectedSubscribersCampaign(null)}
        campaign={selectedSubscribersCampaign}
      />

      {/* Visual Flowchart Modal */}
      <DripFlowModal
        isOpen={Boolean(selectedFlowCampaign)}
        onClose={() => setSelectedFlowCampaign(null)}
        campaign={selectedFlowCampaign}
        onEditCampaign={(camp) => {
          setCampaignToEdit(camp);
          setCreateModalOpen(true);
        }}
      />

      {/* Blueprint Library Modal */}
      <DripBlueprintsModal
        isOpen={blueprintsModalOpen}
        onClose={() => setBlueprintsModalOpen(false)}
        onSelectBlueprint={(bp: DripBlueprint) => {
          setCampaignToEdit(null);
          setCreateModalOpen(true);
          // pass blueprint via timeout or ref
          setTimeout(() => {
            // modal will be opened
          }, 50);
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                Delete Drip Campaign?
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Are you sure you want to delete "<strong>{deleteTarget.name}</strong>"? All subscriber
                progression states will be permanently deleted.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center space-x-1.5"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
