import React, { useState, useEffect, useMemo } from 'react';
import {
  Workflow,
  BarChart3,
  Send,
  CheckCircle2,
  CheckCheck,
  Check,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  Download,
  RefreshCw,
  Copy,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  X,
  FileSpreadsheet,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Smartphone,
  Eye,
  FileText,
  DollarSign,
  FastForward,
  Play,
  Layers,
  HelpCircle,
  Info,
  Calendar,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  subscribeDripCampaigns,
  subscribeDripSubscribers,
  subscribeTemplates,
  fetchDripCampaignAnalyticsApi,
  rescanDripCampaignApi,
  advanceDripSubscriberApi,
} from '../../lib/services.ts';
import {
  calculateMessageCharge,
  resolveTemplateCategory,
  META_INDIA_RATES,
} from '../../utils/metaPricing.ts';
import { MiniTemplatePhonePreview } from '../MiniTemplatePhonePreview.tsx';
import { DripStepCountdown } from './DripStepCountdown.tsx';
import type {
  DripCampaign,
  DripStep,
  DripSubscriber,
  DripSubscriberLog,
  Template,
} from '../../types/index.ts';

interface DripCampaignAnalyticsProps {
  initialDripCampaignId?: string;
  onNavigateToDrip?: () => void;
  onNavigateToBroadcastAnalytics?: () => void;
}

export const DripCampaignAnalytics: React.FC<DripCampaignAnalyticsProps> = ({
  initialDripCampaignId,
  onNavigateToDrip,
  onNavigateToBroadcastAnalytics,
}) => {
  const { organization } = useAuth();
  const { activeAccount, accounts } = useWhatsAppAccounts();
  const toast = useToast();

  const [campaigns, setCampaigns] = useState<DripCampaign[]>([]);
  const [selectedDripId, setSelectedDripId] = useState<string>(initialDripCampaignId || '');
  const [accountFilter, setAccountFilter] = useState<string>(activeAccount?.id || 'all');
  const [subscribers, setSubscribers] = useState<DripSubscriber[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [serverAnalytics, setServerAnalytics] = useState<any>(null);

  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingSubscribers, setLoadingSubscribers] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedTime, setLastRefreshedTime] = useState<string>('');

  // Step drill-down selector: 'all' | stepNumber (1, 2, 3...)
  const [selectedStepNumber, setSelectedStepNumber] = useState<number | 'all'>('all');

  // Filters & Search for subscribers list
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal for Subscriber Timeline / Journey
  const [selectedSubscriberForModal, setSelectedSubscriberForModal] = useState<DripSubscriber | null>(null);
  const [advancingSubId, setAdvancingSubId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Template preview toggle
  const [showPhonePreview, setShowPhonePreview] = useState(true);

  // Auto-sync account filter
  useEffect(() => {
    if (activeAccount?.id) {
      setAccountFilter(activeAccount.id);
    }
  }, [activeAccount?.id]);

  // Load Templates
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeTemplates(
      organization.id,
      (data) => setTemplates(data),
      (err) => console.warn('Error loading templates in drip analytics:', err)
    );
    return () => unsub();
  }, [organization?.id]);

  // Load Drip Campaigns
  useEffect(() => {
    if (!organization?.id) return;
    setLoadingCampaigns(true);
    const unsub = subscribeDripCampaigns(
      organization.id,
      (data) => {
        setCampaigns(data);
        setLoadingCampaigns(false);
      },
      (err) => {
        console.warn('Error loading drip campaigns:', err);
        setLoadingCampaigns(false);
      }
    );
    return () => unsub();
  }, [organization?.id]);

  // Scope drip campaigns to selected account
  const availableCampaigns = useMemo(() => {
    if (accountFilter === 'all') return campaigns;
    const targetAccountId = accountFilter === 'active' ? activeAccount?.id : accountFilter;
    if (!targetAccountId) return campaigns;
    const targetAcc = accounts.find((a) => a.id === targetAccountId);
    return campaigns.filter(
      (c) =>
        c.whatsAppAccountId === targetAccountId ||
        (targetAcc && (c as any).phoneNumberId === targetAcc.phoneNumberId)
    );
  }, [campaigns, accountFilter, activeAccount, accounts]);

  // Auto-select latest campaign
  useEffect(() => {
    setSelectedDripId((prev) => {
      if (availableCampaigns.length > 0) {
        if (!prev || !availableCampaigns.some((c) => c.id === prev)) {
          const match = initialDripCampaignId
            ? availableCampaigns.find((c) => c.id === initialDripCampaignId)
            : null;
          return match ? match.id : availableCampaigns[0].id;
        }
        return prev;
      }
      return '';
    });
  }, [availableCampaigns, initialDripCampaignId]);

  // Selected Drip Campaign Object
  const currentCampaign = useMemo(() => {
    return campaigns.find((c) => c.id === selectedDripId) || null;
  }, [campaigns, selectedDripId]);

  // Subscribe to real-time subscribers for current drip campaign
  useEffect(() => {
    if (!organization?.id || !selectedDripId) {
      setSubscribers([]);
      return;
    }

    setLoadingSubscribers(true);
    const unsub = subscribeDripSubscribers(
      organization.id,
      selectedDripId,
      (data) => {
        setSubscribers(data);
        setLoadingSubscribers(false);
      },
      () => setLoadingSubscribers(false)
    );

    // Also fetch server-side aggregated analytics
    fetchDripCampaignAnalyticsApi(organization.id, selectedDripId)
      .then((res: any) => {
        if (res?.success) {
          setServerAnalytics(res);
          setLastRefreshedTime(new Date().toLocaleTimeString());
        }
      })
      .catch((e) => console.warn('Fetch drip analytics notice:', e));

    return () => unsub();
  }, [organization?.id, selectedDripId]);

  // Steps in the sequence
  const steps: DripStep[] = useMemo(() => {
    return currentCampaign?.steps || [];
  }, [currentCampaign]);

  // Selected Step Object (if a single step is picked)
  const currentStep = useMemo<DripStep | null>(() => {
    if (selectedStepNumber === 'all') return null;
    return steps.find((s) => s.stepNumber === selectedStepNumber) || null;
  }, [steps, selectedStepNumber]);

  // Resolved template for the selected step
  const currentStepTemplate = useMemo<Template | null>(() => {
    if (!currentStep) return null;
    if (currentStep.template && currentStep.template.name) return currentStep.template;
    const match = templates.find(
      (t) =>
        t.id === currentStep.templateId ||
        t.metaTemplateId === currentStep.templateId ||
        t.name.toLowerCase() === (currentStep.templateName || '').toLowerCase()
    );
    return match || null;
  }, [currentStep, templates]);

  // Effective Template Fallback for preview
  const effectiveStepTemplate = useMemo<Template>(() => {
    if (currentStepTemplate && currentStepTemplate.components && currentStepTemplate.components.length > 0) {
      return currentStepTemplate;
    }
    return {
      id: currentStep?.templateId || 'tpl_drip',
      name: currentStep?.templateName || 'WhatsApp Drip Step',
      language: 'en_US',
      category: (currentStep?.templateCategory as any) || 'MARKETING',
      status: 'APPROVED',
      whatsAppAccountId: currentCampaign?.whatsAppAccountId || '',
      components: [
        ...(currentStep?.headerMediaUrl
          ? [
              {
                type: 'HEADER' as const,
                format: 'IMAGE' as const,
                example: { header_handle: [currentStep.headerMediaUrl] },
              },
            ]
          : []),
        {
          type: 'BODY' as const,
          text: `Hello {{1}},\nStep ${currentStep?.stepNumber || 1}: ${currentStep?.title || 'Automated update'}.\nThank you for choosing us!`,
          example: { body_text: [['Customer']] },
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [currentStepTemplate, currentStep, currentCampaign]);

  // Step-by-Step Metrics Calculation
  const stepMetricsList = useMemo(() => {
    if (!currentCampaign || steps.length === 0) return [];

    return steps.map((st, idx) => {
      const stepNum = st.stepNumber || idx + 1;
      let sent = 0;
      let delivered = 0;
      let read = 0;
      let failed = 0;
      let skipped = 0;

      // 1. Gather stats from subscriber histories
      for (const sub of subscribers) {
        const hist = (sub.stepHistory || []).find((h: DripSubscriberLog) => h.stepNumber === stepNum);
        if (hist) {
          sent++;
          if (hist.status === 'delivered') delivered++;
          else if (hist.status === 'read') {
            read++;
            delivered++;
          } else if (hist.status === 'failed') failed++;
          else if (hist.status === 'skipped') skipped++;
        }
      }

      // 2. Supplement with step.stats from campaign doc / serverAnalytics if higher
      const serverStep = serverAnalytics?.stepAnalytics?.find((sa: any) => sa.stepNumber === stepNum);
      if (serverStep?.stats) {
        if (serverStep.stats.sent > sent) sent = serverStep.stats.sent;
        if (serverStep.stats.delivered > delivered) delivered = serverStep.stats.delivered;
        if (serverStep.stats.read > read) read = serverStep.stats.read;
        if (serverStep.stats.failed > failed) failed = serverStep.stats.failed;
      }
      if (st.stats) {
        if ((st.stats.sent || 0) > sent) sent = st.stats.sent;
        if ((st.stats.delivered || 0) > delivered) delivered = st.stats.delivered;
        if ((st.stats.read || 0) > read) read = st.stats.read;
        if ((st.stats.failed || 0) > failed) failed = st.stats.failed;
      }

      // Waiting subscribers currently queued on this step
      const waiting = subscribers.filter(
        (s) => s.status === 'active' && s.currentStep === stepNum
      ).length;

      const deliveryRate = sent > 0 ? Number(((delivered / sent) * 100).toFixed(1)) : 0;
      const readRate = delivered > 0 ? Number(((read / delivered) * 100).toFixed(1)) : 0;
      const failureRate = sent > 0 ? Number(((failed / sent) * 100).toFixed(1)) : 0;

      // Rate per template category
      const matchedTpl = templates.find(
        (t) =>
          t.id === st.templateId ||
          t.metaTemplateId === st.templateId ||
          t.name.toLowerCase() === (st.templateName || '').toLowerCase()
      );
      const category = resolveTemplateCategory(st.templateName || st.templateId, matchedTpl?.category);
      const rateObj = META_INDIA_RATES[category] || META_INDIA_RATES.MARKETING;
      const stepCost = Number((sent * rateObj.rateINR).toFixed(2));

      return {
        stepNumber: stepNum,
        step: st,
        title: st.title || `Step ${stepNum}`,
        delayValue: st.delayValue ?? 0,
        delayUnit: st.delayUnit || 'hours',
        templateName: st.templateName || 'WhatsApp Template',
        category,
        rateINR: rateObj.rateINR,
        sent,
        delivered,
        read,
        failed,
        skipped,
        waiting,
        deliveryRate,
        readRate,
        failureRate,
        estimatedCostINR: stepCost,
      };
    });
  }, [currentCampaign, steps, subscribers, serverAnalytics, templates]);

  // Overall Sequence Performance KPIs
  const overallKPIs = useMemo(() => {
    const totalEnrolled = subscribers.length || currentCampaign?.enrolledCount || 0;
    const activeSubs = subscribers.filter((s) => s.status === 'active').length || currentCampaign?.activeSubscribers || 0;
    const completedSubs = subscribers.filter((s) => s.status === 'completed').length || currentCampaign?.completedSubscribers || 0;
    const cancelledSubs = subscribers.filter((s) => s.status === 'cancelled' || s.status === 'paused').length;

    let totalSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;
    let totalFailed = 0;
    let totalSpend = 0;

    for (const sm of stepMetricsList) {
      totalSent += sm.sent;
      totalDelivered += sm.delivered;
      totalRead += sm.read;
      totalFailed += sm.failed;
      totalSpend += sm.estimatedCostINR;
    }

    // Fallback to campaign stats if step metrics have not populated yet
    if (totalSent === 0 && currentCampaign?.stats) {
      totalSent = currentCampaign.stats.totalMessagesSent || 0;
      totalDelivered = currentCampaign.stats.delivered || 0;
      totalRead = currentCampaign.stats.read || 0;
      totalFailed = currentCampaign.stats.failed || 0;
    }

    const completionRate = totalEnrolled > 0 ? Number(((completedSubs / totalEnrolled) * 100).toFixed(1)) : 0;
    const deliveryRate = totalSent > 0 ? Number(((totalDelivered / totalSent) * 100).toFixed(1)) : 0;
    const readRate = totalDelivered > 0 ? Number(((totalRead / totalDelivered) * 100).toFixed(1)) : 0;

    return {
      totalEnrolled,
      activeSubs,
      completedSubs,
      cancelledSubs,
      completionRate,
      totalSent,
      totalDelivered,
      totalRead,
      totalFailed,
      deliveryRate,
      readRate,
      totalSpendINR: Number(totalSpend.toFixed(2)),
    };
  }, [subscribers, currentCampaign, stepMetricsList]);

  // Selected Step Metric (if single step selected)
  const currentStepMetric = useMemo(() => {
    if (selectedStepNumber === 'all') return null;
    return stepMetricsList.find((sm) => sm.stepNumber === selectedStepNumber) || null;
  }, [stepMetricsList, selectedStepNumber]);

  // Filtered Subscribers list
  const filteredSubscribers = useMemo(() => {
    return subscribers.filter((sub) => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        q === '' ||
        (sub.phone || '').toLowerCase().includes(q) ||
        (sub.name || '').toLowerCase().includes(q);

      // Step Filter
      let matchStep = true;
      if (selectedStepNumber !== 'all') {
        const hasHistoryForStep = (sub.stepHistory || []).some(
          (h) => h.stepNumber === selectedStepNumber
        );
        const isCurrentlyWaitingOnStep = sub.status === 'active' && sub.currentStep === selectedStepNumber;
        matchStep = hasHistoryForStep || isCurrentlyWaitingOnStep;
      }

      // Status Filter
      let matchStatus = true;
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' || statusFilter === 'completed' || statusFilter === 'cancelled') {
          matchStatus = sub.status === statusFilter;
        } else if (selectedStepNumber !== 'all') {
          const stepHist = (sub.stepHistory || []).find((h) => h.stepNumber === selectedStepNumber);
          if (statusFilter === 'waiting') {
            matchStatus = sub.status === 'active' && sub.currentStep === selectedStepNumber && !stepHist;
          } else if (statusFilter === 'read') {
            matchStatus = stepHist?.status === 'read';
          } else if (statusFilter === 'delivered') {
            matchStatus = stepHist?.status === 'delivered' || stepHist?.status === 'read';
          } else if (statusFilter === 'failed') {
            matchStatus = stepHist?.status === 'failed';
          } else if (statusFilter === 'skipped') {
            matchStatus = stepHist?.status === 'skipped';
          }
        }
      }

      return matchSearch && matchStep && matchStatus;
    });
  }, [subscribers, searchQuery, selectedStepNumber, statusFilter]);

  // Paginated Subscribers
  const paginatedSubscribers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSubscribers.slice(start, start + pageSize);
  }, [filteredSubscribers, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredSubscribers.length / pageSize) || 1;

  // Handle Refresh & Rescan
  const handleRefreshData = async () => {
    if (!organization?.id || !selectedDripId) return;
    setIsRefreshing(true);
    try {
      const res = await rescanDripCampaignApi(organization.id, selectedDripId);
      const serverRes = await fetchDripCampaignAnalyticsApi(organization.id, selectedDripId);
      if (serverRes?.success) {
        setServerAnalytics(serverRes);
      }
      setLastRefreshedTime(new Date().toLocaleTimeString());
      toast.showSuccess('Drip Analytics Synced', res?.message || 'Latest subscriber delivery & steps refreshed.');
    } catch (err: any) {
      toast.showError('Sync Failed', err?.message || 'Could not refresh drip analytics.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle Fast-Forward / Advance subscriber
  const handleAdvanceSubscriber = async (sub: DripSubscriber) => {
    if (!organization?.id || !selectedDripId) return;
    setAdvancingSubId(sub.id);
    try {
      await advanceDripSubscriberApi(organization.id, selectedDripId, sub.id);
      toast.showSuccess('Step Triggered', `Advancing ${sub.phone} to next scheduled step.`);
    } catch (err: any) {
      toast.showError('Advance Failed', err?.message || 'Could not advance subscriber.');
    } finally {
      setAdvancingSubId(null);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (subscribers.length === 0) {
      toast.showError('No Data', 'No subscribers available to export.');
      return;
    }

    const headers = [
      'Phone Number',
      'Contact Name',
      'Overall Status',
      'Current Step',
      'Enrolled At',
      'Next Execution At',
      ...steps.map((st) => `Step ${st.stepNumber} (${st.title}) Status`),
      ...steps.map((st) => `Step ${st.stepNumber} Sent At`),
    ];

    const rows = subscribers.map((sub) => {
      const stepStatuses = steps.map((st) => {
        const h = (sub.stepHistory || []).find((log) => log.stepNumber === st.stepNumber);
        if (h) return h.status.toUpperCase();
        if (sub.status === 'active' && sub.currentStep === st.stepNumber) return 'WAITING';
        if (sub.currentStep < st.stepNumber) return 'QUEUED';
        return 'NOT_STARTED';
      });

      const stepTimes = steps.map((st) => {
        const h = (sub.stepHistory || []).find((log) => log.stepNumber === st.stepNumber);
        return h?.sentAt || '';
      });

      return [
        `"${sub.phone}"`,
        `"${sub.name || ''}"`,
        sub.status,
        sub.currentStep,
        sub.enrolledAt || '',
        sub.nextExecutionAt || '',
        ...stepStatuses,
        ...stepTimes,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${currentCampaign?.name || 'drip_sequence'}_step_analytics.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.showSuccess('Export Complete', 'Drip step analytics CSV downloaded successfully.');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Sequence Selector, Account Filter & Actions */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
              <Workflow className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white">
                  Drip Sequence Real-Time & Step Analytics
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Pro Engine
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Track sequential funnels, subscriber step progression, delivery blue ticks, and timer drop-offs.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {onNavigateToDrip && (
              <button
                type="button"
                onClick={onNavigateToDrip}
                className="px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all cursor-pointer"
              >
                Manage Sequences
              </button>
            )}

            <button
              type="button"
              onClick={handleRefreshData}
              disabled={isRefreshing}
              className="px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-bold hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-600' : ''}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync & Reconcile'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center space-x-1.5 shadow-sm cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Step CSV</span>
            </button>
          </div>
        </div>

        {/* Campaign & Number Selector Strip */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
          {/* Drip Campaign Dropdown */}
          <div className="md:col-span-7 space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Select Drip Sequence:
            </label>
            <div className="relative">
              <select
                aria-label="Select Drip Sequence"
                value={selectedDripId}
                onChange={(e) => {
                  setSelectedDripId(e.target.value);
                  setSelectedStepNumber('all');
                  setCurrentPage(1);
                }}
                className="w-full pl-3 pr-8 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-bold text-neutral-900 dark:text-white focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                {availableCampaigns.length === 0 ? (
                  <option value="">No Drip Sequences available</option>
                ) : (
                  availableCampaigns.map((camp) => (
                    <option key={camp.id} value={camp.id}>
                      {camp.name} ({camp.status.toUpperCase()}) • {camp.steps?.length || 0} Steps • {camp.enrolledCount || 0} Enrolled
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* WhatsApp Account Filter */}
          <div className="md:col-span-5 space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Sender WhatsApp Account:
            </label>
            <select
              aria-label="Filter by WhatsApp number"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-semibold text-neutral-900 dark:text-white focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">🌐 All WhatsApp Numbers ({campaigns.length} total sequences)</option>
              {activeAccount && (
                <option value={activeAccount.id}>
                  Active: {activeAccount.displayPhoneNumber} ({activeAccount.verifiedName})
                </option>
              )}
              {accounts
                .filter((a) => a.id !== activeAccount?.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayPhoneNumber} - {a.verifiedName}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Sequence Meta Info Bar */}
        {currentCampaign && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-neutral-500">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                Trigger: <strong className="text-amber-600 dark:text-amber-400 capitalize">{currentCampaign.triggerType?.replace('_', ' ')}</strong>
              </span>
              <span>•</span>
              <span>
                Status:{' '}
                <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                  currentCampaign.status === 'active'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : currentCampaign.status === 'completed'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  {currentCampaign.status}
                </span>
              </span>
              <span>•</span>
              <span>Total Sequence Steps: <strong>{steps.length}</strong></span>
            </div>

            {lastRefreshedTime && (
              <span className="text-[11px] text-neutral-400">
                Last synced: {lastRefreshedTime}
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards Strip (Overall Sequence Health) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Enrolled */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Enrolled Audience</span>
            <Users className="w-4 h-4 text-neutral-500" />
          </div>
          <p className="text-2xl font-black text-neutral-900 dark:text-white font-mono">
            {overallKPIs.totalEnrolled}
          </p>
          <p className="text-[10px] text-neutral-400 font-medium">Total subscribers in funnel</p>
        </div>

        {/* Active In-Flight */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-amber-200/70 dark:border-amber-900/40 shadow-2xs space-y-1 bg-linear-to-b from-amber-500/5 to-transparent">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Active In-Flight</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {overallKPIs.activeSubs}
          </p>
          <p className="text-[10px] text-neutral-400 font-medium">Currently progressing steps</p>
        </div>

        {/* Completed Funnel */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-blue-200/70 dark:border-blue-900/40 shadow-2xs space-y-1 bg-linear-to-b from-blue-500/5 to-transparent">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Funnel Completed</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
            {overallKPIs.completedSubs}
          </p>
          <p className="text-[10px] text-blue-600/80 dark:text-blue-400 font-medium">
            {overallKPIs.completionRate}% completion rate
          </p>
        </div>

        {/* Messages Dispatched */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Dispatched</span>
            <Send className="w-4 h-4 text-neutral-500" />
          </div>
          <p className="text-2xl font-black text-neutral-900 dark:text-white font-mono">
            {overallKPIs.totalSent}
          </p>
          <p className="text-[10px] text-neutral-400 font-medium">Across all sequence steps</p>
        </div>

        {/* Delivery & Read Rates */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-emerald-200/70 dark:border-emerald-900/40 shadow-2xs space-y-1 bg-linear-to-b from-emerald-500/5 to-transparent">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Delivery / Read</span>
            <CheckCheck className="w-4 h-4 text-sky-500" />
          </div>
          <div className="flex items-baseline space-x-1.5">
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {overallKPIs.deliveryRate}%
            </p>
            <span className="text-xs font-bold text-sky-500 font-mono">
              ({overallKPIs.readRate}% read)
            </span>
          </div>
          <p className="text-[10px] text-neutral-400 font-medium">{overallKPIs.totalRead} messages read</p>
        </div>

        {/* Estimated Meta Spend */}
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Meta Spend (Est.)</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
            ₹{overallKPIs.totalSpendINR}
          </p>
          <p className="text-[10px] text-neutral-400 font-medium">India CBP conversation rate</p>
        </div>
      </div>

      {/* CORE FEATURE: "HAR STEP KA ALAG DEKH SAKE" - STEP-BY-STEP VISUAL PIPELINE STRIP */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-white flex items-center space-x-2">
              <span>Step-by-Step Performance Pipeline</span>
              <span className="text-xs font-normal text-neutral-500">
                (Click any step to inspect its separate analytics, template & recipients)
              </span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Har step ki alag delivery, read count, delay timer aur waiting contacts dekhein.
            </p>
          </div>

          {/* Stepper View Toggle: All Steps vs Individual Step */}
          <div className="flex items-center space-x-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setSelectedStepNumber('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedStepNumber === 'all'
                  ? 'bg-white dark:bg-neutral-900 text-amber-600 dark:text-amber-400 shadow-2xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              All Steps Overview
            </button>
            {steps.map((st, i) => (
              <button
                key={st.id || i}
                type="button"
                onClick={() => setSelectedStepNumber(st.stepNumber)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 ${
                  selectedStepNumber === st.stepNumber
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                }`}
              >
                <span>Step {st.stepNumber}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Visual Pipeline Grid / Ribbon */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pt-2">
          {stepMetricsList.map((sm, i) => {
            const isSelected = selectedStepNumber === sm.stepNumber;
            return (
              <div
                key={sm.stepNumber}
                onClick={() => setSelectedStepNumber(sm.stepNumber)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative space-y-3 ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 ring-2 ring-amber-500/30 shadow-md'
                    : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-800/40 hover:border-amber-300 dark:hover:border-amber-700'
                }`}
              >
                {/* Step Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`w-7 h-7 rounded-xl font-mono font-black text-xs flex items-center justify-center ${
                      isSelected
                        ? 'bg-amber-600 text-white'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200'
                    }`}>
                      {sm.stepNumber}
                    </span>
                    <div className="truncate max-w-[140px]">
                      <p className="font-bold text-xs text-neutral-900 dark:text-white truncate">
                        {sm.title}
                      </p>
                      <p className="text-[10px] text-neutral-400 truncate">
                        {sm.templateName}
                      </p>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-neutral-100 dark:bg-neutral-700 text-amber-600 dark:text-amber-400 shrink-0">
                    {sm.delayValue === 0 ? '⚡ 0m delay' : `+${sm.delayValue} ${sm.delayUnit}`}
                  </span>
                </div>

                {/* Step Metrics Strip */}
                <div className="grid grid-cols-4 gap-1.5 py-2 px-2.5 rounded-xl bg-white dark:bg-neutral-900/90 border border-neutral-100 dark:border-neutral-800 text-center">
                  <div>
                    <span className="text-[9px] font-bold text-neutral-400 uppercase">Sent</span>
                    <p className="text-xs font-black text-neutral-900 dark:text-white font-mono">
                      {sm.sent}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-emerald-600 uppercase">Deliv.</span>
                    <p className="text-xs font-black text-emerald-600 font-mono">
                      {sm.delivered}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-sky-500 uppercase">Read</span>
                    <p className="text-xs font-black text-sky-500 font-mono">
                      {sm.read}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-amber-500 uppercase">Wait</span>
                    <p className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono">
                      {sm.waiting}
                    </p>
                  </div>
                </div>

                {/* Progress bar (Delivered vs Sent) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-neutral-500">Read Rate: <strong>{sm.readRate}%</strong></span>
                    <span className="text-neutral-500">Est. Spend: <strong className="font-mono text-emerald-600">₹{sm.estimatedCostINR}</strong></span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                    <div
                      className="h-full bg-linear-to-r from-emerald-500 to-sky-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, sm.deliveryRate || 0)}%` }}
                    />
                  </div>
                </div>

                {/* Trigger Condition Badge */}
                <div className="pt-1 flex items-center justify-between text-[10px] text-neutral-400">
                  <span className="truncate">
                    Condition: <strong className="text-neutral-700 dark:text-neutral-300 capitalize">{sm.step.condition || 'always'}</strong>
                  </span>
                  <span className={`text-[10px] font-bold ${isSelected ? 'text-amber-600' : 'text-neutral-400'}`}>
                    {isSelected ? 'Selected ✓' : 'View Step →'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SELECTED STEP DEEP DIVE SECTION (If a single step is chosen) */}
      {currentStep && currentStepMetric && (
        <div className="p-6 rounded-3xl bg-linear-to-br from-amber-500/5 via-white to-white dark:from-amber-950/20 dark:via-neutral-900 dark:to-neutral-900 border border-amber-300/80 dark:border-amber-800/60 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <span className="w-12 h-12 rounded-2xl bg-amber-600 text-white font-black text-lg flex items-center justify-center font-mono shadow-md">
                {currentStep.stepNumber}
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                    Step {currentStep.stepNumber}: {currentStep.title}
                  </h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {currentStepMetric.category} Template
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Template Name: <strong className="text-neutral-800 dark:text-neutral-200">{currentStep.templateName}</strong> • Delay:{' '}
                  <strong className="text-amber-600 dark:text-amber-400">{currentStep.delayValue === 0 ? 'Instant (0m)' : `${currentStep.delayValue} ${currentStep.delayUnit}`}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowPhonePreview(!showPhonePreview)}
                className="px-3.5 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-bold flex items-center space-x-1.5 hover:bg-neutral-50 cursor-pointer shadow-2xs"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{showPhonePreview ? 'Hide Phone Preview' : 'Show Phone Preview'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedStepNumber('all')}
                className="px-3 py-1.5 rounded-xl text-neutral-500 hover:text-neutral-800 dark:hover:text-white text-xs font-semibold cursor-pointer"
              >
                Close Drilldown ✕
              </button>
            </div>
          </div>

          {/* Step KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-center space-y-1">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">Step Dispatched</span>
              <p className="text-xl font-black text-neutral-900 dark:text-white font-mono">{currentStepMetric.sent}</p>
              <p className="text-[10px] text-neutral-400">Total sent for this step</p>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-800 border border-emerald-200 dark:border-emerald-800 text-center space-y-1">
              <span className="text-[10px] font-bold text-emerald-600 uppercase">Delivered</span>
              <p className="text-xl font-black text-emerald-600 font-mono">{currentStepMetric.delivered}</p>
              <p className="text-[10px] text-emerald-600 font-bold">{currentStepMetric.deliveryRate}% rate</p>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-800 border border-sky-200 dark:border-sky-800 text-center space-y-1">
              <span className="text-[10px] font-bold text-sky-500 uppercase">Read (Blue Ticks)</span>
              <p className="text-xl font-black text-sky-500 font-mono">{currentStepMetric.read}</p>
              <p className="text-[10px] text-sky-500 font-bold">{currentStepMetric.readRate}% read</p>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-800 border border-rose-200 dark:border-rose-800 text-center space-y-1">
              <span className="text-[10px] font-bold text-rose-500 uppercase">Failed / Bounced</span>
              <p className="text-xl font-black text-rose-600 font-mono">{currentStepMetric.failed}</p>
              <p className="text-[10px] text-rose-500 font-bold">{currentStepMetric.failureRate}% failure</p>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-800 text-center space-y-1">
              <span className="text-[10px] font-bold text-amber-600 uppercase">Waiting in Queue</span>
              <p className="text-xl font-black text-amber-600 font-mono">{currentStepMetric.waiting}</p>
              <p className="text-[10px] text-neutral-400">Pending delay timer</p>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-center space-y-1">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">Step Meta Cost</span>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-400 font-mono">₹{currentStepMetric.estimatedCostINR}</p>
              <p className="text-[10px] text-neutral-400">@ ₹{currentStepMetric.rateINR}/msg</p>
            </div>
          </div>

          {/* WhatsApp Template Mobile Phone Preview for this step */}
          {showPhonePreview && (
            <div className="p-5 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-sm text-neutral-900 dark:text-white">
                    Step {currentStep.stepNumber} Message Template Preview:
                  </h4>
                </div>
                <span className="text-xs text-neutral-400">
                  Exact WhatsApp look with header & buttons
                </span>
              </div>

              <div className="flex flex-col lg:flex-row items-start gap-6">
                <div className="shrink-0 mx-auto lg:mx-0">
                  <MiniTemplatePhonePreview
                    template={effectiveStepTemplate}
                    customVariables={{
                      ...(currentStep.variableValues || {}),
                      '1': 'Customer Name',
                      body_1: 'Customer Name',
                    }}
                    customMediaUrl={currentStep.headerMediaUrl}
                    recipientName="Customer Name"
                    deliveryStatus="read"
                    size="medium"
                  />
                </div>

                <div className="flex-1 space-y-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700 space-y-2">
                    <p className="font-bold text-neutral-900 dark:text-white uppercase text-[10px] tracking-wider">
                      Step Configuration Rules
                    </p>
                    <div className="space-y-1.5 text-neutral-600 dark:text-neutral-300">
                      <p>
                        • <strong>Delay Timing:</strong> Triggered {currentStep.delayValue === 0 ? 'immediately (0 mins)' : `${currentStep.delayValue} ${currentStep.delayUnit}`} after the subscriber completed the previous step.
                      </p>
                      <p>
                        • <strong>Stop Condition:</strong>{' '}
                        {currentStep.condition === 'if_not_replied' ? (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            Only send if customer has NOT replied to previous messages. (Sequence exits automatically if replied).
                          </span>
                        ) : currentStep.condition === 'if_read' ? (
                          <span className="text-sky-600 dark:text-sky-400 font-semibold">
                            Only send if customer read (blue-ticked) the previous message.
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">Always send regardless of replies.</span>
                        )}
                      </p>
                      <p>
                        • <strong>Category Billing:</strong> {currentStepMetric.category} (₹{currentStepMetric.rateINR} per conversation).
                      </p>
                    </div>
                  </div>

                  {currentStep.headerMediaUrl && (
                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700 space-y-1">
                      <p className="font-bold text-[10px] uppercase text-neutral-400">Attached Media URL</p>
                      <p className="font-mono text-emerald-600 dark:text-emerald-400 truncate text-[11px]">
                        {currentStep.headerMediaUrl}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBSCRIBERS & STEP DELIVERY TABLE */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        {/* Table Controls: Search, Status Filter, Step Scope */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-white flex items-center space-x-2">
              <span>Audience Subscribers & Step Logs</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                {filteredSubscribers.length} Contacts
              </span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              {selectedStepNumber === 'all'
                ? 'Showing all subscribers across all steps.'
                : `Showing subscribers participating in Step ${selectedStepNumber}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              aria-label="Filter by subscriber status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">All Statuses ({subscribers.length})</option>
              <option value="active">Active In-Flight ({overallKPIs.activeSubs})</option>
              <option value="completed">Completed ({overallKPIs.completedSubs})</option>
              {selectedStepNumber !== 'all' && (
                <>
                  <option value="read">Read on Step {selectedStepNumber} ✓✓</option>
                  <option value="delivered">Delivered on Step {selectedStepNumber}</option>
                  <option value="waiting">Waiting on Step {selectedStepNumber} ⏳</option>
                  <option value="failed">Failed on Step {selectedStepNumber} ⚠️</option>
                  <option value="skipped">Skipped (Customer Replied) ↷</option>
                </>
              )}
            </select>

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search phone or name..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        {loadingSubscribers ? (
          <div className="py-16 text-center text-xs text-neutral-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-600" />
            <p>Loading subscriber delivery data...</p>
          </div>
        ) : filteredSubscribers.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400 space-y-1.5">
            <Users className="w-8 h-8 mx-auto text-neutral-300 dark:text-neutral-700" />
            <p className="font-semibold text-neutral-600 dark:text-neutral-300">No subscribers found</p>
            <p>No contacts matched your search or status filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3">Journey Status</th>
                  <th className="py-2.5 px-3">Current Step</th>
                  <th className="py-2.5 px-3">
                    {selectedStepNumber === 'all' ? 'Latest Step Status' : `Step ${selectedStepNumber} Status`}
                  </th>
                  <th className="py-2.5 px-3">Dispatched At</th>
                  <th className="py-2.5 px-3">Next Step Due</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-medium">
                {paginatedSubscribers.map((sub) => {
                  // Determine status for this specific step or latest step
                  const targetStepNum = selectedStepNumber === 'all' ? (sub.currentStep || 1) : selectedStepNumber;
                  const stepHist = (sub.stepHistory || []).find((h) => h.stepNumber === targetStepNum);
                  const isWaitingOnThisStep = sub.status === 'active' && sub.currentStep === targetStepNum && !stepHist;

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      {/* Contact Info */}
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2">
                          <span className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center font-bold text-[10px] text-neutral-700 dark:text-neutral-200 shrink-0">
                            {sub.name ? sub.name.charAt(0).toUpperCase() : 'C'}
                          </span>
                          <div>
                            <p className="font-bold text-neutral-900 dark:text-white font-mono text-xs">
                              {sub.phone}
                            </p>
                            {sub.name && (
                              <p className="text-[10px] text-neutral-400 truncate max-w-[120px]">
                                {sub.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Journey Status */}
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          sub.status === 'active'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : sub.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}>
                          {sub.status}
                        </span>
                      </td>

                      {/* Current Step */}
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-neutral-900 dark:text-white">
                          Step {sub.currentStep} / {steps.length}
                        </span>
                      </td>

                      {/* Step Status Badge with Meta delivery ticks */}
                      <td className="py-3 px-3">
                        {stepHist ? (
                          <div className="flex items-center space-x-1.5">
                            {stepHist.status === 'read' ? (
                              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                                <CheckCheck className="w-3 h-3 text-sky-500" />
                                <span>Read</span>
                              </span>
                            ) : stepHist.status === 'delivered' ? (
                              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <CheckCheck className="w-3 h-3 text-neutral-400" />
                                <span>Delivered</span>
                              </span>
                            ) : stepHist.status === 'sent' ? (
                              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                                <Check className="w-3 h-3 text-neutral-400" />
                                <span>Sent</span>
                              </span>
                            ) : stepHist.status === 'failed' ? (
                              <span
                                title={stepHist.error || 'Failed'}
                                className="flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                <span>Failed</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                                Skipped (Replied)
                              </span>
                            )}
                          </div>
                        ) : isWaitingOnThisStep ? (
                          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3 h-3" />
                            <span>Waiting on Timer</span>
                          </span>
                        ) : (
                          <span className="text-neutral-400 text-[11px]">Not reached</span>
                        )}
                      </td>

                      {/* Dispatched At */}
                      <td className="py-3 px-3 text-neutral-500 font-mono text-[11px]">
                        {stepHist?.sentAt ? new Date(stepHist.sentAt).toLocaleString() : sub.lastStepSentAt ? new Date(sub.lastStepSentAt).toLocaleString() : '—'}
                      </td>

                      {/* Next Step Due At (with countdown) */}
                      <td className="py-3 px-3">
                        {sub.status === 'active' && sub.nextExecutionAt ? (
                          <div className="space-y-0.5">
                            <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                              {new Date(sub.nextExecutionAt).toLocaleTimeString()}
                            </span>
                            <p className="text-[10px] text-neutral-400">
                              {new Date(sub.nextExecutionAt).toLocaleDateString()}
                            </p>
                          </div>
                        ) : sub.status === 'completed' ? (
                          <span className="text-emerald-600 font-bold text-[10px]">Sequence Finished</span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Fast Forward Step (if active) */}
                          {sub.status === 'active' && (
                            <button
                              type="button"
                              title="Advance to next step now"
                              disabled={advancingSubId === sub.id}
                              onClick={() => handleAdvanceSubscriber(sub)}
                              className="p-1.5 rounded-lg border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/50 text-amber-700 dark:text-amber-300 cursor-pointer disabled:opacity-50"
                            >
                              <FastForward className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* View Journey Timeline Modal */}
                          <button
                            type="button"
                            title="View complete step timeline & history"
                            onClick={() => setSelectedSubscriberForModal(sub)}
                            className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-bold text-[11px] flex items-center space-x-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Journey</span>
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

        {/* Pagination */}
        {filteredSubscribers.length > pageSize && (
          <div className="flex items-center justify-between pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs">
            <span className="text-neutral-400">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, filteredSubscribers.length)} of{' '}
              {filteredSubscribers.length} subscribers
            </span>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono font-bold text-neutral-800 dark:text-neutral-200">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SUBSCRIBER JOURNEY & STEP TIMELINE MODAL */}
      {selectedSubscriberForModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden space-y-4 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-800/40">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
                  <Workflow className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                    Subscriber Journey & Step Timeline
                  </h3>
                  <p className="font-mono text-xs text-neutral-500">
                    {selectedSubscriberForModal.phone} {selectedSubscriberForModal.name ? `(${selectedSubscriberForModal.name})` : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSubscriberForModal(null)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Vertical Timeline */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 text-center text-xs">
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase font-bold">Status</span>
                  <p className="font-bold uppercase text-amber-600">{selectedSubscriberForModal.status}</p>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase font-bold">Current Step</span>
                  <p className="font-bold text-neutral-900 dark:text-white font-mono">
                    Step {selectedSubscriberForModal.currentStep} of {steps.length}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase font-bold">Enrolled At</span>
                  <p className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                    {selectedSubscriberForModal.enrolledAt ? new Date(selectedSubscriberForModal.enrolledAt).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>

              {/* Step Timeline */}
              <div className="space-y-4 pt-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-400">
                  Step Execution Progression:
                </h4>

                <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200 dark:before:bg-neutral-800">
                  {steps.map((st) => {
                    const hist = (selectedSubscriberForModal.stepHistory || []).find((h) => h.stepNumber === st.stepNumber);
                    const isCurrent = selectedSubscriberForModal.status === 'active' && selectedSubscriberForModal.currentStep === st.stepNumber;
                    const isPast = (selectedSubscriberForModal.currentStep || 1) > st.stepNumber || selectedSubscriberForModal.status === 'completed';

                    return (
                      <div key={st.stepNumber} className="relative space-y-1">
                        {/* Dot */}
                        <div className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          hist?.status === 'read'
                            ? 'bg-sky-500 text-white'
                            : hist?.status === 'delivered'
                            ? 'bg-emerald-500 text-white'
                            : hist?.status === 'failed'
                            ? 'bg-rose-500 text-white'
                            : isCurrent
                            ? 'bg-amber-500 text-white animate-pulse'
                            : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                        }`}>
                          {st.stepNumber}
                        </div>

                        {/* Card */}
                        <div className={`p-3.5 rounded-2xl border ${
                          isCurrent
                            ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20'
                            : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'
                        }`}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-neutral-900 dark:text-white">
                              Step {st.stepNumber}: {st.title}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400">
                              {st.delayValue === 0 ? 'Instant' : `+${st.delayValue} ${st.delayUnit}`}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1.5 text-xs">
                            <span className="text-neutral-500 text-[11px]">
                              Template: <strong>{st.templateName}</strong>
                            </span>

                            {hist ? (
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                                hist.status === 'read'
                                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                                  : hist.status === 'delivered'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : hist.status === 'failed'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                              }`}>
                                {hist.status === 'read' ? '✓✓ Read' : hist.status === 'delivered' ? '✓✓ Delivered' : hist.status}
                              </span>
                            ) : isCurrent ? (
                              <span className="text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                                ⏳ Waiting for scheduled timer
                              </span>
                            ) : (
                              <span className="text-neutral-400 text-[10px]">Queued</span>
                            )}
                          </div>

                          {hist?.sentAt && (
                            <p className="text-[10px] text-neutral-400 font-mono pt-1">
                              Dispatched: {new Date(hist.sentAt).toLocaleString()}
                            </p>
                          )}
                          {hist?.error && (
                            <p className="text-[10px] text-rose-500 font-medium pt-1">
                              Error: {hist.error}
                            </p>
                          )}
                          {hist?.note && (
                            <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium pt-1">
                              Note: {hist.note}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end bg-neutral-50/50 dark:bg-neutral-800/40">
              <button
                type="button"
                onClick={() => setSelectedSubscriberForModal(null)}
                className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold cursor-pointer"
              >
                Close Timeline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
