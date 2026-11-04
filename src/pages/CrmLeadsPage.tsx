import React, { useState, useEffect, useMemo } from 'react';
import {
  Target,
  Send,
  Download,
  Filter,
  Search,
  MessageSquare,
  Phone,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronRight,
  TrendingUp,
  DollarSign,
  UserCheck,
  Tag,
  Calendar,
  AlertCircle,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit,
  X,
  FileText,
  MousePointerClick,
  MessagesSquare,
  ExternalLink,
  Loader2,
  RefreshCw,
  FolderPlus,
  Briefcase,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type {
  CrmLead,
  CrmLeadsSummary,
  LeadPipelineStage,
  LeadInteractionType,
} from '../types/index.ts';

interface CrmLeadsPageProps {
  onNavigateToCampaigns?: (prefilledAudience?: Array<{ name: string; phone: string }>) => void;
  onNavigateToInbox?: (phone?: string) => void;
}

const STAGE_CONFIG: Record<
  LeadPipelineStage,
  { label: string; color: string; bg: string; border: string; badgeBg: string }
> = {
  new: {
    label: 'New Lead',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50/70 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-800',
    badgeBg: 'bg-blue-600 text-white',
  },
  contacted: {
    label: 'Contacted',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50/70 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800',
    badgeBg: 'bg-amber-600 text-white',
  },
  qualified: {
    label: 'Qualified',
    color: 'text-purple-700 dark:text-purple-300',
    bg: 'bg-purple-50/70 dark:bg-purple-950/40',
    border: 'border-purple-200 dark:border-purple-800',
    badgeBg: 'bg-purple-600 text-white',
  },
  proposal: {
    label: 'Proposal Sent',
    color: 'text-indigo-700 dark:text-indigo-300',
    bg: 'bg-indigo-50/70 dark:bg-indigo-950/40',
    border: 'border-indigo-200 dark:border-indigo-800',
    badgeBg: 'bg-indigo-600 text-white',
  },
  won: {
    label: 'Won (Deal Closed)',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50/70 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
    badgeBg: 'bg-emerald-600 text-white',
  },
  lost: {
    label: 'Lost / Closed',
    color: 'text-neutral-600 dark:text-neutral-400',
    bg: 'bg-neutral-100/70 dark:bg-neutral-800/40',
    border: 'border-neutral-200 dark:border-neutral-700',
    badgeBg: 'bg-neutral-500 text-white',
  },
};

export const CrmLeadsPage: React.FC<CrmLeadsPageProps> = ({
  onNavigateToCampaigns,
  onNavigateToInbox,
}) => {
  const { organization, userProfile } = useAuth();
  const toast = useToast();
  const orgId = organization?.id || userProfile?.organizationId || 'org_lax_1';

  // Data states
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [summary, setSummary] = useState<CrmLeadsSummary>({
    totalLeads: 0,
    buttonClicksCount: 0,
    textRepliesCount: 0,
    wonCount: 0,
    totalPipelineValue: 0,
    campaignsCount: 0,
  });
  const [campaignsList, setCampaignsList] = useState<string[]>([]);
  const [availableButtons, setAvailableButtons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // View Mode: Table vs Visual Pipeline (Kanban)
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  // Filters
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [selectedInteraction, setSelectedInteraction] = useState<string>('all');
  const [selectedButton, setSelectedButton] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selection for bulk re-broadcast
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Copy helper state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal: Lead Details & Notes
  const [activeNotesLead, setActiveNotesLead] = useState<CrmLead | null>(null);
  const [newNoteInput, setNewNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Modal: Quick Deal Value / Stage Edit
  const [editingDealLead, setEditingDealLead] = useState<CrmLead | null>(null);
  const [editDealValueInput, setEditDealValueInput] = useState<number>(0);
  const [editStageInput, setEditStageInput] = useState<LeadPipelineStage>('new');
  const [editAgentInput, setEditAgentInput] = useState<string>('');
  const [savingDeal, setSavingDeal] = useState(false);

  // Modal: Reset All Leads / Fresh Start
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Fetch Leads
  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('orgId', orgId);
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      if (selectedInteraction !== 'all') params.append('interactionType', selectedInteraction);
      if (selectedButton !== 'all') params.append('buttonText', selectedButton);
      if (selectedStage !== 'all') params.append('stage', selectedStage);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/crm/leads?${params.toString()}`, {
        headers: { 'x-organization-id': orgId },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLeads(data.leads || []);
        setSummary(data.summary || {});
        setCampaignsList(data.campaignsList || []);
        setAvailableButtons(data.availableButtons || []);
      } else {
        throw new Error(data.error || 'Failed to fetch CRM leads');
      }
    } catch (err: any) {
      console.warn('Error fetching leads:', err);
      toast.showError('Load Error', err.message || 'Could not load CRM leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [selectedCampaign, selectedInteraction, selectedButton, selectedStage]);

  // Handle Search submit / debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLeads();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.showSuccess('Copied', `"${text}" copied to clipboard.`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Toggle selection
  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.size === leads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map((l) => l.id)));
    }
  };

  // Get active leads for retargeting (either selected leads, or all currently filtered leads!)
  const activeRetargetLeads = useMemo(() => {
    if (selectedLeadIds.size > 0) {
      return leads.filter((l) => selectedLeadIds.has(l.id));
    }
    return leads;
  }, [leads, selectedLeadIds]);

  // 1-CLICK DIRECT BROADCAST TO LEADS
  const handleDirectReBroadcast = () => {
    if (activeRetargetLeads.length === 0) {
      toast.showWarning('No Leads', 'There are no leads in the current view to broadcast to.');
      return;
    }

    const audienceList = activeRetargetLeads.map((l) => ({
      name: l.customerName || l.phone,
      phone: l.phone.replace(/[^0-9]/g, ''),
    }));

    // Save to session storage for seamless pre-population across tabs
    sessionStorage.setItem('prefill_broadcast_audience', JSON.stringify(audienceList));
    sessionStorage.setItem('prefill_broadcast_source_tag', `CRM: ${selectedCampaign !== 'all' ? selectedCampaign : 'Filtered Leads'} (${audienceList.length})`);

    toast.showSuccess(
      'Target Audience Loaded!',
      `${audienceList.length} customer(s) from campaign clicks/replies loaded. Opening Campaign wizard...`
    );

    if (onNavigateToCampaigns) {
      onNavigateToCampaigns(audienceList);
    } else {
      window.location.hash = '#campaigns';
    }
  };

  // EXPORT TO EXCEL / CSV
  const handleExportCsv = () => {
    if (activeRetargetLeads.length === 0) {
      toast.showWarning('No Data', 'No leads available to export.');
      return;
    }

    const headers = [
      'Customer Name',
      'Phone Number',
      'Email',
      'Source Campaign',
      'Interaction Type',
      'Button Clicked',
      'Reply Message',
      'Pipeline Stage',
      'Deal Value (INR)',
      'Assigned Agent',
      'Last Active Date',
    ];

    const rows = activeRetargetLeads.map((l) => [
      `"${(l.customerName || '').replace(/"/g, '""')}"`,
      `"${l.phone}"`,
      `"${l.email || ''}"`,
      `"${(l.campaignName || '').replace(/"/g, '""')}"`,
      `"${l.interactionType === 'button_click' ? 'Button Click' : 'Text Reply'}"`,
      `"${(l.buttonText || '').replace(/"/g, '""')}"`,
      `"${(l.replyText || '').replace(/"/g, '""')}"`,
      `"${STAGE_CONFIG[l.stage]?.label || l.stage}"`,
      l.dealValue || 0,
      `"${l.assignedAgentName || 'Unassigned'}"`,
      `"${new Date(l.lastInteractedAt).toLocaleString()}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Campaign_Leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.showSuccess('Export Complete', `${activeRetargetLeads.length} lead(s) exported to CSV.`);
  };

  // Quick Stage Update
  const handleQuickStageChange = async (leadId: string, newStage: LeadPipelineStage) => {
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({ stage: newStage }),
      });
      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, stage: newStage, updatedAt: new Date().toISOString() } : l))
        );
        toast.showSuccess('Stage Updated', `Lead moved to ${STAGE_CONFIG[newStage].label}.`);
      }
    } catch (err: any) {
      toast.showError('Update Failed', err.message);
    }
  };

  // Bulk Stage Update
  const handleBulkStageChange = async (newStage: LeadPipelineStage) => {
    if (selectedLeadIds.size === 0) {
      toast.showWarning('Select Leads', 'Please select at least 1 lead using the checkboxes.');
      return;
    }
    try {
      const ids = Array.from(selectedLeadIds);
      const res = await fetch('/api/crm/leads/bulk-stage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({ leadIds: ids, stage: newStage }),
      });
      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) => (selectedLeadIds.has(l.id) ? { ...l, stage: newStage } : l))
        );
        setSelectedLeadIds(new Set());
        toast.showSuccess('Bulk Updated', `${ids.length} lead(s) moved to ${STAGE_CONFIG[newStage].label}.`);
      }
    } catch (err: any) {
      toast.showError('Bulk Update Error', err.message);
    }
  };

  // Save Deal Details
  const handleSaveDealDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDealLead) return;
    setSavingDeal(true);
    try {
      const res = await fetch(`/api/crm/leads/${editingDealLead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({
          dealValue: Number(editDealValueInput) || 0,
          stage: editStageInput,
          assignedAgentName: editAgentInput.trim(),
        }),
      });
      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === editingDealLead.id
              ? {
                  ...l,
                  dealValue: Number(editDealValueInput) || 0,
                  stage: editStageInput,
                  assignedAgentName: editAgentInput.trim(),
                  updatedAt: new Date().toISOString(),
                }
              : l
          )
        );
        toast.showSuccess('Saved', 'Lead deal value and stage updated.');
        setEditingDealLead(null);
      }
    } catch (err: any) {
      toast.showError('Save Error', err.message);
    } finally {
      setSavingDeal(false);
    }
  };

  // Add Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNotesLead || !newNoteInput.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/crm/leads/${activeNotesLead.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({
          text: newNoteInput.trim(),
          authorName: userProfile?.displayName || 'Sales Agent',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === activeNotesLead.id
              ? {
                  ...l,
                  notes: [data.note, ...(l.notes || [])],
                }
              : l
          )
        );
        setActiveNotesLead((prev) =>
          prev ? { ...prev, notes: [data.note, ...(prev.notes || [])] } : null
        );
        setNewNoteInput('');
        toast.showSuccess('Note Added', 'Internal follow-up note recorded.');
      }
    } catch (err: any) {
      toast.showError('Note Error', err.message);
    } finally {
      setSavingNote(false);
    }
  };

  // RESET ALL LEADS & START FRESH (NO FAKE / DEMO DATA)
  const handleResetAllLeads = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/crm/leads/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({ organizationId: orgId, allOrgs: false }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLeads([]);
        setSummary({
          totalLeads: 0,
          buttonClicksCount: 0,
          textRepliesCount: 0,
          wonCount: 0,
          totalPipelineValue: 0,
          campaignsCount: 0,
        });
        setSelectedLeadIds(new Set());
        setShowResetModal(false);
        toast.showSuccess(
          'Fresh Start Activated!',
          'All CRM leads have been reset. Starting completely fresh with zero leads.'
        );
      } else {
        throw new Error(data.error || 'Failed to reset leads');
      }
    } catch (err: any) {
      toast.showError('Reset Error', err.message || 'Could not reset leads.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white flex items-center space-x-2">
                <span>Campaign Leads &amp; Smart Retargeting</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                  Interactive Leads
                </span>
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Real-time tracking of broadcast replies &amp; template button clicks with 1-click audience re-broadcast
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls: Reset, Refresh & View Toggle */}
        <div className="flex items-center space-x-2 flex-wrap gap-1.5">
          {/* Fresh Start / Reset Button */}
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            title="Reset All Leads & Start Fresh"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Reset / Fresh Start</span>
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={fetchLeads}
            disabled={loading}
            className="p-2 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors cursor-pointer"
            title="Refresh Leads Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-neutral-200/80 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs font-bold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Table View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center space-x-1.5 ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs font-bold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Sales Pipeline (Kanban)</span>
            </button>
          </div>
        </div>
      </div>

      {/* TOP STATS COUNTERS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Leads */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Total Interactive Leads</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-neutral-900 dark:text-white">
              {summary.totalLeads}
            </span>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              Across {summary.campaignsCount || campaignsList.length} Campaign(s)
            </span>
          </div>
        </div>

        {/* Card 2: Button Clicks */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Button Click Leads</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <MousePointerClick className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-neutral-900 dark:text-white">
              {summary.buttonClicksCount}
            </span>
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400">
              Quick Reply Actions
            </span>
          </div>
        </div>

        {/* Card 3: Inbound Text Replies */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Text Replies</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <MessagesSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-neutral-900 dark:text-white">
              {summary.textRepliesCount}
            </span>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              Direct Customer Replies
            </span>
          </div>
        </div>

        {/* Card 4: Total Pipeline Value */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Total Pipeline Value</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-neutral-900 dark:text-white">
              ₹{(summary.totalPipelineValue || 0).toLocaleString('en-IN')}
            </span>
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
              {summary.wonCount} Deals Won
            </span>
          </div>
        </div>
      </div>

      {/* 🚀 1-CLICK DIRECT RETARGETING BAR */}
      <div className="p-4 rounded-3xl bg-linear-to-r from-indigo-900 via-purple-900 to-indigo-950 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-indigo-700/50">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-1 rounded-lg bg-white/20 text-white">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </span>
            <h3 className="font-bold text-sm sm:text-base leading-tight">
              1-Click Smart Retargeting Broadcast
            </h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/20 text-white font-bold">
              {activeRetargetLeads.length} Lead{activeRetargetLeads.length !== 1 ? 's' : ''} Ready
            </span>
          </div>
          <p className="text-xs text-indigo-200 max-w-xl">
            {selectedLeadIds.size > 0
              ? `You have explicitly selected ${selectedLeadIds.size} lead(s). Click below to launch follow-up message to them.`
              : `All ${activeRetargetLeads.length} lead(s) currently filtered from replies & button clicks are ready for instant broadcast.`}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center space-x-2.5 flex-wrap gap-2">
          {/* Direct Re-broadcast Button */}
          <button
            type="button"
            onClick={handleDirectReBroadcast}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition-all hover:scale-102 flex items-center space-x-2 cursor-pointer"
          >
            <Send className="w-4 h-4 text-neutral-950" />
            <span>⚡ Direct Broadcast to These Leads</span>
          </button>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          {/* Reset All Leads in Toolbar */}
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="px-3 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 font-bold text-xs border border-rose-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            title="Reset All Leads & Start Fresh"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All</span>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROLS */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* 1. Campaign Filter */}
          <div>
            <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
              Source Campaign:
            </label>
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-medium"
            >
              <option value="all">All Campaigns (Combined)</option>
              {campaignsList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Interaction Type Filter */}
          <div>
            <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
              Interaction Type:
            </label>
            <select
              value={selectedInteraction}
              onChange={(e) => setSelectedInteraction(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-medium"
            >
              <option value="all">All (Buttons &amp; Text Replies)</option>
              <option value="button_click">🔘 Button Clicks Only</option>
              <option value="text_reply">💬 Text Replies Only</option>
            </select>
          </div>

          {/* 3. Specific Button Filter */}
          <div>
            <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
              Specific Button:
            </label>
            <select
              value={selectedButton}
              onChange={(e) => setSelectedButton(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-medium"
            >
              <option value="all">Any Button Clicked</option>
              {availableButtons.map((btn) => (
                <option key={btn} value={btn}>
                  {btn}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Pipeline Stage Filter */}
          <div>
            <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
              Pipeline Stage:
            </label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-medium"
            >
              <option value="all">All Stages</option>
              <option value="new">🆕 New Lead</option>
              <option value="contacted">📞 Contacted</option>
              <option value="qualified">🎯 Qualified</option>
              <option value="proposal">📝 Proposal Sent</option>
              <option value="won">🏆 Won (Closed)</option>
              <option value="lost">❌ Lost</option>
            </select>
          </div>

          {/* 5. Search Bar */}
          <div>
            <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
              Search Lead:
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Name, Phone, Keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Bulk Action Controls if items are selected */}
        {selectedLeadIds.size > 0 && (
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs flex-wrap gap-2 animate-fadeIn">
            <span className="font-bold text-indigo-700 dark:text-indigo-400 flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>{selectedLeadIds.size} Lead(s) Selected</span>
            </span>

            <div className="flex items-center space-x-2">
              <span className="text-neutral-500 text-[11px]">Move Selected to:</span>
              {(['contacted', 'qualified', 'proposal', 'won'] as LeadPipelineStage[]).map((stg) => (
                <button
                  key={stg}
                  type="button"
                  onClick={() => handleBulkStageChange(stg)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${STAGE_CONFIG[stg].bg} ${STAGE_CONFIG[stg].color} ${STAGE_CONFIG[stg].border}`}
                >
                  {STAGE_CONFIG[stg].label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedLeadIds(new Set())}
                className="text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline ml-2 cursor-pointer"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}
      </div>

      {/* VIEW 1: TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
              <p className="text-xs text-neutral-500 font-medium">Loading Campaign leads &amp; replies...</p>
            </div>
          ) : leads.length === 0 ? (
            <div className="p-12 text-center space-y-4 max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-sm border border-indigo-100 dark:border-indigo-900/50">
                <Target className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200 dark:border-emerald-800">
                  ✓ 100% Genuine Leads Mode (Zero Demo / Fake Data)
                </span>
                <h3 className="font-black text-neutral-900 dark:text-white text-base sm:text-lg">
                  Fresh Pipeline Ready — Zero Leads
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Aapka CRM pipeline bilkul clean aur fresh hai. Koi fake demo leads nahi hai. WhatsApp campaign launch karein; jaise hi customer Quick Reply button click karega ya reply message bhejega, real lead yahan instant display ho jayegi.
                </p>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateToCampaigns) {
                      onNavigateToCampaigns();
                    } else {
                      window.location.hash = '#campaigns';
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Launch WhatsApp Campaign</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.size > 0 && selectedLeadIds.size === leads.length}
                        onChange={toggleSelectAll}
                        className="rounded text-indigo-600 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">Lead Customer</th>
                    <th className="py-3 px-4">Source Campaign</th>
                    <th className="py-3 px-4">Interaction (Button / Reply)</th>
                    <th className="py-3 px-4">Pipeline Stage</th>
                    <th className="py-3 px-4">Deal Value</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {leads.map((lead) => {
                    const isSelected = selectedLeadIds.has(lead.id);
                    const stageMeta = STAGE_CONFIG[lead.stage] || STAGE_CONFIG.new;

                    return (
                      <tr
                        key={lead.id}
                        className={`hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30 transition-colors ${
                          isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectLead(lead.id)}
                            className="rounded text-indigo-600 cursor-pointer"
                          />
                        </td>

                        {/* Customer Info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-xs uppercase shrink-0">
                              {(lead.customerName || 'L').substring(0, 2)}
                            </div>
                            <div>
                              <p className="font-bold text-neutral-900 dark:text-white leading-tight">
                                {lead.customerName}
                              </p>
                              <div className="flex items-center space-x-1.5 font-mono text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                                <span>{lead.phone}</span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(lead.phone, `phone_${lead.id}`)}
                                  className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                                  title="Copy Phone"
                                >
                                  {copiedKey === `phone_${lead.id}` ? (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Source Campaign */}
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-neutral-800 dark:text-neutral-200 truncate max-w-[180px]">
                            {lead.campaignName || 'Direct WhatsApp Inbound'}
                          </p>
                          {lead.templateName && (
                            <span className="text-[10px] text-neutral-400 font-mono">
                              tpl: {lead.templateName}
                            </span>
                          )}
                        </td>

                        {/* Interaction Type: Button Click vs Text Reply */}
                        <td className="py-3.5 px-4 max-w-xs">
                          {lead.interactionType === 'button_click' ? (
                            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <MousePointerClick className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span className="font-bold truncate max-w-[180px]">
                                {lead.buttonText || 'Button Clicked'}
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                                <MessagesSquare className="w-3 h-3" />
                                <span>Text Reply</span>
                              </div>
                              <p className="text-[11px] text-neutral-700 dark:text-neutral-300 italic truncate max-w-[200px]">
                                &ldquo;{lead.replyText || 'Custom message'}&rdquo;
                              </p>
                            </div>
                          )}
                          <p className="text-[10px] text-neutral-400 mt-1">
                            {new Date(lead.lastInteractedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            &bull; {new Date(lead.lastInteractedAt).toLocaleDateString()}
                          </p>
                        </td>

                        {/* Pipeline Stage Select */}
                        <td className="py-3.5 px-4">
                          <select
                            value={lead.stage}
                            onChange={(e) => handleQuickStageChange(lead.id, e.target.value as LeadPipelineStage)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold border cursor-pointer ${stageMeta.bg} ${stageMeta.color} ${stageMeta.border}`}
                          >
                            <option value="new">🆕 New Lead</option>
                            <option value="contacted">📞 Contacted</option>
                            <option value="qualified">🎯 Qualified</option>
                            <option value="proposal">📝 Proposal</option>
                            <option value="won">🏆 Won Deal</option>
                            <option value="lost">❌ Lost</option>
                          </select>
                        </td>

                        {/* Deal Value */}
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDealLead(lead);
                              setEditDealValueInput(lead.dealValue || 0);
                              setEditStageInput(lead.stage);
                              setEditAgentInput(lead.assignedAgentName || '');
                            }}
                            className="font-mono font-bold text-xs text-neutral-900 dark:text-white hover:text-indigo-600 flex items-center space-x-1 cursor-pointer"
                            title="Click to edit deal value"
                          >
                            <span>₹{(lead.dealValue || 0).toLocaleString('en-IN')}</span>
                            <Edit className="w-3 h-3 text-neutral-400 hover:text-indigo-600" />
                          </button>
                          <span className="text-[10px] text-neutral-400">
                            {lead.assignedAgentName || 'Unassigned'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Live Chat in Inbox */}
                            <button
                              type="button"
                              onClick={() => {
                                if (onNavigateToInbox) {
                                  onNavigateToInbox(lead.phone);
                                } else {
                                  window.location.hash = '#inbox';
                                }
                              }}
                              className="p-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
                              title="Open Live Chat in Inbox"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>

                            {/* View Notes / Add Comment */}
                            <button
                              type="button"
                              onClick={() => setActiveNotesLead(lead)}
                              className="p-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors cursor-pointer relative"
                              title="Lead Notes & History"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {lead.notes && lead.notes.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-600"></span>
                              )}
                            </button>

                            {/* Edit Deal & Stage */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDealLead(lead);
                                setEditDealValueInput(lead.dealValue || 0);
                                setEditStageInput(lead.stage);
                                setEditAgentInput(lead.assignedAgentName || '');
                              }}
                              className="p-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors cursor-pointer"
                              title="Edit Deal Details"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: VISUAL SALES PIPELINE (KANBAN BOARD) */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 items-start">
          {(['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as LeadPipelineStage[]).map(
            (stageKey) => {
              const stageMeta = STAGE_CONFIG[stageKey];
              const stageLeads = leads.filter((l) => l.stage === stageKey);
              const stageTotalValue = stageLeads.reduce(
                (sum, l) => sum + (Number(l.dealValue) || 0),
                0
              );

              return (
                <div
                  key={stageKey}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 p-3 space-y-3 flex flex-col max-h-[80vh]"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
                    <div>
                      <h4 className="font-bold text-xs text-neutral-900 dark:text-white flex items-center space-x-1.5">
                        <span>{stageMeta.label}</span>
                      </h4>
                      <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                        ₹{stageTotalValue.toLocaleString('en-IN')}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stageMeta.badgeBg}`}>
                      {stageLeads.length}
                    </span>
                  </div>

                  {/* Cards List */}
                  <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
                    {stageLeads.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800 text-center text-[11px] text-neutral-400">
                        No leads in this stage
                      </div>
                    ) : (
                      stageLeads.map((lead) => (
                        <div
                          key={lead.id}
                          className="p-3 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-2xs hover:shadow-xs transition-all space-y-2"
                        >
                          {/* Top: Customer Name & Deal Value */}
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-bold text-xs text-neutral-900 dark:text-white leading-tight">
                                {lead.customerName}
                              </p>
                              <p className="text-[10px] font-mono text-neutral-400">
                                {lead.phone}
                              </p>
                            </div>
                            <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                              ₹{(lead.dealValue || 0).toLocaleString('en-IN')}
                            </span>
                          </div>

                          {/* Interaction Snippet */}
                          {lead.interactionType === 'button_click' ? (
                            <div className="px-2 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-[10px] font-bold text-purple-700 dark:text-purple-300 flex items-center space-x-1 truncate">
                              <MousePointerClick className="w-3 h-3 text-purple-600 shrink-0" />
                              <span className="truncate">{lead.buttonText}</span>
                            </div>
                          ) : (
                            <div className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[10px] text-emerald-700 dark:text-emerald-300 truncate italic">
                              &ldquo;{lead.replyText}&rdquo;
                            </div>
                          )}

                          <div className="text-[9px] text-neutral-400 truncate">
                            camp: {lead.campaignName}
                          </div>

                          {/* Move Stage Selector & Quick Actions */}
                          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-750 flex items-center justify-between">
                            <select
                              value={lead.stage}
                              onChange={(e) => handleQuickStageChange(lead.id, e.target.value as LeadPipelineStage)}
                              className="text-[10px] font-semibold py-0.5 px-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                            >
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="qualified">Qualified</option>
                              <option value="proposal">Proposal</option>
                              <option value="won">Won</option>
                              <option value="lost">Lost</option>
                            </select>

                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => setActiveNotesLead(lead)}
                                className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                                title="Notes"
                              >
                                <FileText className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onNavigateToInbox) onNavigateToInbox(lead.phone);
                                  else window.location.hash = '#inbox';
                                }}
                                className="p-1 rounded text-emerald-600 hover:text-emerald-700 cursor-pointer"
                                title="WhatsApp Chat"
                              >
                                <MessageSquare className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}

      {/* MODAL 1: LEAD NOTES & TIMELINE */}
      {activeNotesLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-white leading-tight">
                  Lead Notes: {activeNotesLead.customerName}
                </h3>
                <p className="text-[11px] text-neutral-500 font-mono">{activeNotesLead.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveNotesLead(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add note input */}
            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                required
                rows={2}
                placeholder="Write an internal follow-up comment (e.g. Called customer, requested quotation catalogue for 20 units)..."
                value={newNoteInput}
                onChange={(e) => setNewNoteInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingNote || !newNoteInput.trim()}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-50 cursor-pointer flex items-center space-x-1"
                >
                  {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Add Note</span>
                </button>
              </div>
            </form>

            {/* Notes history list */}
            <div className="overflow-y-auto space-y-2.5 flex-1 pr-1 border-t border-neutral-200 dark:border-neutral-800 pt-3">
              <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
                Activity &amp; Note History
              </label>
              {(!activeNotesLead.notes || activeNotesLead.notes.length === 0) ? (
                <p className="text-xs text-neutral-400 italic">No notes recorded yet.</p>
              ) : (
                activeNotesLead.notes.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-xs space-y-1"
                  >
                    <p className="text-neutral-800 dark:text-neutral-200 leading-relaxed whitespace-pre-line">
                      {n.text}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-medium pt-1">
                      <span>By {n.authorName}</span>
                      <span>{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT DEAL VALUE & STAGE */}
      {editingDealLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-white leading-tight">
                  Edit Lead &amp; Deal Value
                </h3>
                <p className="text-[11px] text-neutral-500">{editingDealLead.customerName} ({editingDealLead.phone})</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingDealLead(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDealDetails} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  Pipeline Stage
                </label>
                <select
                  value={editStageInput}
                  onChange={(e) => setEditStageInput(e.target.value as LeadPipelineStage)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-semibold"
                >
                  <option value="new">🆕 New Lead</option>
                  <option value="contacted">📞 Contacted</option>
                  <option value="qualified">🎯 Qualified</option>
                  <option value="proposal">📝 Proposal Sent</option>
                  <option value="won">🏆 Won (Deal Closed)</option>
                  <option value="lost">❌ Lost</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  Estimated Deal Value (INR ₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={editDealValueInput}
                  onChange={(e) => setEditDealValueInput(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono font-bold text-sm text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  Assigned Sales Agent / Executive
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={editAgentInput}
                  onChange={(e) => setEditAgentInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingDealLead(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDeal}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  {savingDeal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save Deal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET ALL LEADS & START FRESH */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-200 dark:border-rose-800">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-neutral-900 dark:text-white">
                  Reset All Leads &amp; Start Fresh?
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                  Fresh New Start (Zero Demo Leads)
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-300 space-y-2">
              <p className="leading-relaxed font-medium">
                Kya aap Campaign Leads &amp; CRM pipeline ko reset karke bilkul fresh start karna chahte hain?
              </p>
              <ul className="list-disc list-inside space-y-1 text-neutral-500 dark:text-neutral-400 text-[11px]">
                <li>Sabhi existing leads and notes delete ho jayenge.</li>
                <li>Koi fake ya demo data load nahi hoga (0 leads).</li>
                <li>Sirf genuine WhatsApp campaign replies ya button clicks par real leads banengi.</li>
              </ul>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetAllLeads}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-60"
              >
                {resetting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Resetting Leads...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Yes, Reset &amp; Start Fresh</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
