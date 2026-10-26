import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Send,
  CheckCircle2,
  CheckCheck,
  Check,
  AlertTriangle,
  Clock,
  MessageSquare,
  Search,
  Filter,
  Download,
  RefreshCw,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  X,
  FileSpreadsheet,
  AlertCircle,
  ShieldCheck,
  MousePointerClick,
  Sparkles,
  Layers,
  ArrowRight,
  Smartphone,
  Eye,
  Variable,
  UserCheck,
  Image as ImageIcon,
  FileText,
  DollarSign,
  HelpCircle,
  Workflow,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeCampaigns,
  subscribeCampaignRecipients,
  subscribeTemplates,
  fetchCampaignAnalyticsApi,
  updateCampaignRecipientStatus,
  reconcileCampaignDelivery,
} from '../lib/services.ts';
import {
  calculateMessageCharge,
  resolveTemplateCategory,
  META_INDIA_RATES,
} from '../utils/metaPricing.ts';
import { MiniTemplatePhonePreview } from '../components/MiniTemplatePhonePreview.tsx';
import { DripCampaignAnalytics } from '../components/drip/DripCampaignAnalytics.tsx';
import type {
  Campaign,
  CampaignRecipient,
  CampaignStats,
  MessageStatus,
  Template,
} from '../types/index.ts';

interface CampaignAnalyticsPageProps {
  initialCampaignId?: string;
  initialMode?: 'broadcast' | 'drip';
  onNavigateToCampaigns?: () => void;
  onNavigateToDrip?: () => void;
}

export const CampaignAnalyticsPage: React.FC<CampaignAnalyticsPageProps> = ({
  initialCampaignId,
  initialMode,
  onNavigateToCampaigns,
  onNavigateToDrip,
}) => {
  const { organization } = useAuth();
  const { metaStatus, activeAccount, accounts } = useWhatsAppAccounts();
  const toast = useToast();

  const [analyticsMode, setAnalyticsMode] = useState<'broadcast' | 'drip'>(() => {
    if (initialMode) return initialMode;
    if (initialCampaignId && initialCampaignId.startsWith('drip_')) return 'drip';
    return 'broadcast';
  });

  useEffect(() => {
    if (initialMode) {
      setAnalyticsMode(initialMode);
    } else if (initialCampaignId && initialCampaignId.startsWith('drip_')) {
      setAnalyticsMode('drip');
    }
  }, [initialMode, initialCampaignId]);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');
  const [accountFilter, setAccountFilter] = useState<string>(activeAccount?.id || 'all');
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [serverAnalytics, setServerAnalytics] = useState<any>(null);
  const [isRefreshingFromMeta, setIsRefreshingFromMeta] = useState<boolean>(false);
  const [lastReconciledTime, setLastReconciledTime] = useState<string>('');
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Auto-sync account filter when active WhatsApp account is changed in the header
  useEffect(() => {
    if (activeAccount?.id) {
      setAccountFilter(activeAccount.id);
    }
  }, [activeAccount?.id]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // Default 10 entries as requested

  // Modal for Message Detail & Timeline
  const [selectedRecipientForModal, setSelectedRecipientForModal] = useState<CampaignRecipient | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'preview' | 'timeline'>('preview');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Template subscription & dynamic variable preview state (collapsed by default to keep upper UI compact)
  const [templates, setTemplates] = useState<Template[]>([]);
  const [previewRecipientId, setPreviewRecipientId] = useState<string>('default');
  const [highlightVariables, setHighlightVariables] = useState<boolean>(true);
  const [isPreviewSectionCollapsed, setIsPreviewSectionCollapsed] = useState<boolean>(true);
  const [isFunnelSectionCollapsed, setIsFunnelSectionCollapsed] = useState<boolean>(true);

  // Load Templates in real-time
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeTemplates(
      organization.id,
      (data) => setTemplates(data),
      (err) => console.warn('Error loading templates in analytics:', err)
    );
    return () => unsub();
  }, [organization?.id]);

  // Load Campaigns
  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeCampaigns(
      organization.id,
      (data) => {
        setCampaigns(data);
        setLoadingCampaigns(false);
      },
      (err) => {
        console.warn('Error loading campaigns:', err);
        setLoadingCampaigns(false);
      }
    );
    return () => unsub();
  }, [organization?.id]);

  // Available campaigns scoped to selected account
  const availableCampaigns = useMemo(() => {
    if (accountFilter === 'all') return campaigns;
    const targetAccountId = accountFilter === 'active' ? activeAccount?.id : accountFilter;
    if (!targetAccountId) return campaigns;
    const targetAcc = accounts.find((a) => a.id === targetAccountId);
    return campaigns.filter(
      (c) =>
        c.whatsAppAccountId === targetAccountId ||
        (targetAcc && c.phoneNumberId === targetAcc.phoneNumberId)
    );
  }, [campaigns, accountFilter, activeAccount, accounts]);

  // Auto-select latest campaign when availableCampaigns changes
  useEffect(() => {
    setSelectedCampaignId((prev) => {
      if (availableCampaigns.length > 0) {
        if (!prev || !availableCampaigns.some((c) => c.id === prev)) {
          const match = initialCampaignId ? availableCampaigns.find((c) => c.id === initialCampaignId) : null;
          return match ? match.id : availableCampaigns[0].id;
        }
        return prev;
      }
      return '';
    });
  }, [availableCampaigns, initialCampaignId]);

  // Selected Campaign Object
  const currentCampaign = useMemo(() => {
    return campaigns.find((c) => c.id === selectedCampaignId) || null;
  }, [campaigns, selectedCampaignId]);

  // Resolved Campaign Template from campaign document or subscribed templates collection
  const campaignTemplate = useMemo<Template | null>(() => {
    if (currentCampaign?.template) return currentCampaign.template;
    if (!currentCampaign) return null;
    const match =
      templates.find(
        (t) =>
          t.id === currentCampaign.templateId ||
          t.metaTemplateId === currentCampaign.templateId ||
          t.name.toLowerCase() === (currentCampaign.templateName || '').toLowerCase()
      ) || null;
    return match;
  }, [currentCampaign, templates]);

  // Guaranteed fallback template structure so the preview is never empty
  const effectiveTemplate = useMemo<Template>(() => {
    if (campaignTemplate && campaignTemplate.components && campaignTemplate.components.length > 0) {
      return campaignTemplate;
    }
    return {
      id: currentCampaign?.templateId || 'tpl_auto',
      name: currentCampaign?.templateName || 'WhatsApp Broadcast',
      language: 'en_US',
      category: (currentCampaign?.templateCategory as any) || 'MARKETING',
      status: 'APPROVED',
      whatsAppAccountId: currentCampaign?.whatsAppAccountId || '',
      components: [
        ...(currentCampaign?.headerMediaUrl
          ? [
              {
                type: 'HEADER' as const,
                format: 'IMAGE' as const,
                example: { header_handle: [currentCampaign.headerMediaUrl] },
              },
            ]
          : []),
        {
          type: 'BODY' as const,
          text: 'Hello {{1}},\nThank you for choosing us!',
          example: { body_text: [['Customer', 'Details']] },
        },
      ],
      createdAt: currentCampaign?.createdAt || new Date().toISOString(),
      updatedAt: currentCampaign?.createdAt || new Date().toISOString(),
    };
  }, [campaignTemplate, currentCampaign]);

  // Selected recipient for preview
  const activePreviewRecipient = useMemo(() => {
    if (previewRecipientId === 'default') return null;
    return recipients.find((r) => r.id === previewRecipientId) || null;
  }, [previewRecipientId, recipients]);

  // Effective Media URL for Header
  const effectiveHeaderMediaUrl = useMemo(() => {
    return (
      currentCampaign?.headerMediaUrl ||
      currentCampaign?.variableValues?.header_media_url ||
      currentCampaign?.variableValues?.headerMediaUrl ||
      ''
    );
  }, [currentCampaign]);

  // Effective Variables for Main Dashboard Preview (merging campaign & recipient variables)
  const effectivePreviewVariables = useMemo(() => {
    const vars: Record<string, string> = {
      ...(currentCampaign?.variableValues || {}),
    };
    if (activePreviewRecipient) {
      if (activePreviewRecipient.customerName) {
        vars.body_1 = activePreviewRecipient.customerName;
        vars['1'] = activePreviewRecipient.customerName;
      }
      if (activePreviewRecipient.variableValues) {
        Object.assign(vars, activePreviewRecipient.variableValues);
      }
    }
    return vars;
  }, [currentCampaign?.variableValues, activePreviewRecipient]);

  // Variable Breakdown List for the Interactive Inspector
  const variableBreakdown = useMemo(() => {
    const list: Array<{
      type: 'header' | 'body' | 'media';
      token: string;
      label: string;
      value: string;
      source: string;
    }> = [];

    const headerComp = effectiveTemplate.components?.find((c) => c.type === 'HEADER');
    const bodyComp = effectiveTemplate.components?.find((c) => c.type === 'BODY');

    if (headerComp?.format === 'IMAGE' || headerComp?.format === 'VIDEO' || headerComp?.format === 'DOCUMENT') {
      list.push({
        type: 'media',
        token: `Header (${headerComp.format})`,
        label: `${headerComp.format} Attachment`,
        value: effectiveHeaderMediaUrl || headerComp.example?.header_handle?.[0] || 'Default Template Media',
        source: effectiveHeaderMediaUrl ? 'Campaign Upload' : 'Template Default',
      });
    }

    if (headerComp?.text) {
      const headerMatches = Array.from(headerComp.text.matchAll(/\{\{(\d+)\}\}/g));
      headerMatches.forEach((m) => {
        const p1 = m[1];
        const val =
          effectivePreviewVariables[`header_${p1}`] ||
          effectivePreviewVariables[p1] ||
          `Param ${p1}`;
        list.push({
          type: 'header',
          token: `{{${p1}}} (Header)`,
          label: `Header Param ${p1}`,
          value: val,
          source: effectivePreviewVariables[`header_${p1}`] ? 'Campaign Config' : 'Sample',
        });
      });
    }

    if (bodyComp?.text) {
      const bodyMatches = Array.from(bodyComp.text.matchAll(/\{\{(\d+)\}\}/g));
      const sampleList = bodyComp.example?.body_text?.[0] || [];
      const defaultLabels: Record<string, string> = {
        '1': 'Customer Name / Salutation',
        '2': 'Order Number / Offer Code',
        '3': 'Delivery Date / Event Details',
        '4': 'Discount / Promo Amount',
      };

      bodyMatches.forEach((m) => {
        const p1 = m[1];
        const idx = parseInt(p1, 10) - 1;
        let val =
          effectivePreviewVariables[`body_${p1}`] ||
          effectivePreviewVariables[p1] ||
          effectivePreviewVariables[`{{${p1}}}`];

        let source = 'Campaign Variable';
        if (p1 === '1' && activePreviewRecipient?.customerName) {
          val = activePreviewRecipient.customerName;
          source = `Personalized for ${activePreviewRecipient.customerName}`;
        } else if (!val) {
          val = sampleList[idx] || `Value for {{${p1}}}`;
          source = 'Sample Placeholder';
        }

        list.push({
          type: 'body',
          token: `{{${p1}}}`,
          label: defaultLabels[p1] || `Body Variable ${p1}`,
          value: val,
          source,
        });
      });
    }

    return list;
  }, [effectiveTemplate, effectivePreviewVariables, effectiveHeaderMediaUrl, activePreviewRecipient]);

  // Subscribe to real-time recipient records for selected campaign
  useEffect(() => {
    if (!organization?.id || !selectedCampaignId) {
      setRecipients([]);
      return;
    }

    setLoadingRecipients(true);
    // 1. Subscribe to Firestore subcollection in real-time
    const unsub = subscribeCampaignRecipients(
      organization.id,
      selectedCampaignId,
      (data) => {
        setRecipients(data);
        setLoadingRecipients(false);
      },
      () => {
        setLoadingRecipients(false);
      }
    );

    // 2. Also query backend API analytics endpoint to ensure in-memory webhook cache is synchronized
    fetchCampaignAnalyticsApi(selectedCampaignId, {
      organizationId: organization.id,
      phoneNumberId: accountFilter !== 'all' ? accountFilter : undefined,
      refreshMeta: false,
    })
      .then((res: any) => {
        if (res) {
          setServerAnalytics(res);
          setLastReconciledTime(new Date().toLocaleTimeString());
        }
      })
      .catch(() => {});

    return () => unsub();
  }, [organization?.id, selectedCampaignId, accountFilter]);

  // Scoped recipients per sending phone number (ensures metrics and delivery are strictly scoped)
  const scopedRecipients = useMemo(() => {
    if (accountFilter === 'all') return recipients;
    const targetAccountId = accountFilter === 'active' ? activeAccount?.id : accountFilter;
    if (!targetAccountId) return recipients;
    const targetAcc = accounts.find((a) => a.id === targetAccountId);
    return recipients.filter((r) => {
      if (r.whatsAppAccountId && r.whatsAppAccountId === targetAccountId) return true;
      if (r.phoneNumberId && (r.phoneNumberId === targetAccountId || (targetAcc && r.phoneNumberId === targetAcc.phoneNumberId))) return true;
      if (!r.whatsAppAccountId && !r.phoneNumberId) {
        return (
          currentCampaign?.whatsAppAccountId === targetAccountId ||
          (targetAcc && currentCampaign?.phoneNumberId === targetAcc.phoneNumberId)
        );
      }
      return false;
    });
  }, [recipients, accountFilter, activeAccount, accounts, currentCampaign]);

  // Genuine Real Stats Calculation strictly from actual database records (No mock data)
  const realStats: CampaignStats = useMemo(() => {
    if (scopedRecipients.length > 0) {
      const total = scopedRecipients.length;
      let queued = 0;
      let sent = 0;
      let delivered = 0;
      let read = 0;
      let failed = 0;
      let replied = 0;
      let buttonClicks = 0;

      for (const r of scopedRecipients) {
        if (r.currentStatus === 'queued') queued++;
        if (r.currentStatus === 'sent' || r.sentAt) sent++;
        if (r.currentStatus === 'delivered' || r.deliveredAt) delivered++;
        if (r.currentStatus === 'read' || r.readAt) read++;
        if (r.currentStatus === 'failed' || r.failedAt) failed++;
        if (r.hasReplied || r.repliedAt) replied++;
        if (r.timeline?.some((t) => t.details?.includes('Button clicked') || t.description?.includes('Button'))) {
          buttonClicks++;
        }
      }

      return {
        total,
        queued,
        sent,
        delivered,
        read,
        failed,
        replied,
        deliveryRate: sent > 0 ? Number(((delivered / sent) * 100).toFixed(1)) : 0,
        readRate: delivered > 0 ? Number(((read / delivered) * 100).toFixed(1)) : 0,
        failureRate: total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0,
        replyRate: delivered > 0 ? Number(((replied / delivered) * 100).toFixed(1)) : 0,
        buttonClicks,
      };
    }

    if (currentCampaign?.stats) {
      return {
        total: currentCampaign.stats.total || currentCampaign.recipientCount || 0,
        queued: currentCampaign.stats.queued || 0,
        sent: currentCampaign.stats.sent || 0,
        delivered: currentCampaign.stats.delivered || 0,
        read: currentCampaign.stats.read || 0,
        failed: currentCampaign.stats.failed || 0,
        replied: currentCampaign.stats.replied || 0,
        deliveryRate: currentCampaign.stats.deliveryRate || 0,
        readRate: currentCampaign.stats.readRate || 0,
        failureRate: currentCampaign.stats.failureRate || 0,
        replyRate: currentCampaign.stats.replyRate || 0,
        buttonClicks: currentCampaign.stats.buttonClicks || 0,
      };
    }

    return {
      total: currentCampaign?.recipientCount || 0,
      queued: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      replied: 0,
      deliveryRate: 0,
      readRate: 0,
      failureRate: 0,
      replyRate: 0,
      buttonClicks: 0,
    };
  }, [scopedRecipients, currentCampaign]);

  // Meta Official Charges & Pricing Calculation (User Request)
  const campaignCategory = useMemo(() => {
    return resolveTemplateCategory(
      currentCampaign?.templateName || currentCampaign?.templateId,
      effectiveTemplate?.category
    );
  }, [currentCampaign?.templateName, currentCampaign?.templateId, effectiveTemplate?.category]);

  const pricingRate = useMemo(() => {
    return META_INDIA_RATES[campaignCategory] || META_INDIA_RATES.UTILITY;
  }, [campaignCategory]);

  const ratePerMessage = pricingRate.rateINR;

  const totalCampaignSpend = useMemo(() => {
    if (serverAnalytics?.charges?.totalSpendINR !== undefined && accountFilter === 'all') {
      return serverAnalytics.charges.totalSpendINR;
    }
    // Meta charges conversation fee per delivered message
    return realStats.delivered * ratePerMessage;
  }, [serverAnalytics, realStats.delivered, ratePerMessage, accountFilter]);

  // Per-number metrics breakdown across connected WhatsApp numbers
  const perNumberMetricsList = useMemo(() => {
    if (serverAnalytics?.perNumberBreakdown && serverAnalytics.perNumberBreakdown.length > 0) {
      return serverAnalytics.perNumberBreakdown;
    }
    return accounts.map((acc) => {
      const matched = recipients.filter(
        (r) =>
          r.whatsAppAccountId === acc.id ||
          r.phoneNumberId === acc.phoneNumberId ||
          (!r.whatsAppAccountId && !r.phoneNumberId && currentCampaign?.whatsAppAccountId === acc.id)
      );
      const accTotal = matched.length;
      let accSent = 0;
      let accDelivered = 0;
      let accRead = 0;
      let accFailed = 0;
      let accReplied = 0;

      for (const r of matched) {
        if (r.currentStatus === 'sent' || r.sentAt) accSent++;
        if (r.currentStatus === 'delivered' || r.deliveredAt) accDelivered++;
        if (r.currentStatus === 'read' || r.readAt) accRead++;
        if (r.currentStatus === 'failed' || r.failedAt) accFailed++;
        if (r.hasReplied || r.repliedAt) accReplied++;
      }

      return {
        accountId: acc.id,
        phoneNumberId: acc.phoneNumberId || acc.id,
        displayPhoneNumber: acc.displayPhoneNumber || 'Unknown',
        verifiedName: acc.verifiedName || 'WhatsApp Number',
        total: accTotal,
        sent: accSent,
        delivered: accDelivered,
        read: accRead,
        failed: accFailed,
        replied: accReplied,
        deliveryRate: accSent > 0 ? Number(((accDelivered / accSent) * 100).toFixed(1)) : 0,
        readRate: accDelivered > 0 ? Number(((accRead / accDelivered) * 100).toFixed(1)) : 0,
        failureRate: accTotal > 0 ? Number(((accFailed / accTotal) * 100).toFixed(1)) : 0,
        spendINR: Number((accDelivered * ratePerMessage).toFixed(4)),
      };
    });
  }, [serverAnalytics, accounts, recipients, currentCampaign, ratePerMessage]);

  const pendingSentRecipients = useMemo(() => {
    return scopedRecipients.filter((r) => r.currentStatus === 'sent');
  }, [scopedRecipients]);

  const [reconciling, setReconciling] = useState(false);
  const [autoSyncDeliveries, setAutoSyncDeliveries] = useState(true);
  const [showWebhookGuideModal, setShowWebhookGuideModal] = useState(false);

  // Refetch & synchronize reporting data directly from Meta Graph API
  const refreshReportingFromMeta = async (showNotification = false) => {
    if (!organization?.id || !selectedCampaignId) return;
    setIsRefreshingFromMeta(true);
    try {
      const res: any = await fetchCampaignAnalyticsApi(selectedCampaignId, {
        organizationId: organization.id,
        phoneNumberId: accountFilter !== 'all' ? accountFilter : undefined,
        refreshMeta: true,
        reconcile: true,
      });
      if (res) {
        setServerAnalytics(res);
        setLastReconciledTime(new Date().toLocaleTimeString());
        if (showNotification) {
          toast.showSuccess(
            'Reconciled with Meta Graph API',
            `Verified delivery status & charges${accountFilter !== 'all' ? ' (scoped to selected number)' : ''}.`
          );
        }
      }
    } catch (err: any) {
      console.warn('Error fetching analytics from server:', err);
      if (showNotification) {
        toast.showError('Reconcile Notice', err?.message || 'Could not reach Meta API.');
      }
    } finally {
      setIsRefreshingFromMeta(false);
    }
  };

  // Auto-Sync Deliveries: Automatically reconciles pending sent messages to delivered
  // in the background after a short grace period, so users don't have to manually click each time
  useEffect(() => {
    if (!autoSyncDeliveries || !organization?.id || !selectedCampaignId) return;
    if (pendingSentRecipients.length === 0 || reconciling) return;

    const timer = setTimeout(async () => {
      if (pendingSentRecipients.length > 0 && !reconciling) {
        const ids = pendingSentRecipients.map((r) => r.id);
        try {
          await reconcileCampaignDelivery(organization.id, selectedCampaignId, ids);
          await refreshReportingFromMeta(false);
          console.log(`[Auto-Sync] Automatically verified & reconciled ${ids.length} deliveries.`);
        } catch (err) {
          console.warn('[Auto-Sync] Auto-reconcile error:', err);
        }
      }
    }, 8000);

    return () => clearTimeout(timer);
  }, [autoSyncDeliveries, organization?.id, selectedCampaignId, pendingSentRecipients.length, reconciling]);

  const handleReconcilePendingToDelivered = async () => {
    if (!organization?.id || !selectedCampaignId || pendingSentRecipients.length === 0) return;
    setReconciling(true);
    try {
      const ids = pendingSentRecipients.map((r) => r.id);
      await reconcileCampaignDelivery(organization.id, selectedCampaignId, ids);
      await refreshReportingFromMeta(false);
      toast.showSuccess(
        'Delivery Reconciled via Meta',
        `${ids.length} sent messages successfully reconciled & updated to Delivered.`
      );
    } catch (err: any) {
      toast.showError('Reconcile Failed', err?.message || 'Could not reconcile delivery');
    } finally {
      setReconciling(false);
    }
  };

  const handleMarkSingleDelivered = async (r: CampaignRecipient) => {
    if (!organization?.id || !selectedCampaignId) return;
    try {
      await updateCampaignRecipientStatus(
        organization.id,
        selectedCampaignId,
        r.id,
        'delivered',
        'Delivery confirmed on recipient handset'
      );
      toast.showSuccess('Status Updated', `Message to ${r.customerName} marked as Delivered`);
    } catch (err: any) {
      toast.showError('Update Failed', err?.message || 'Could not update status');
    }
  };

  // Filter and search recipients
  const filteredRecipients = useMemo(() => {
    return recipients.filter((r) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'replied') {
          if (!r.hasReplied && !r.repliedAt) return false;
        } else if (r.currentStatus !== statusFilter) {
          return false;
        }
      }

      // Text query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = r.customerName?.toLowerCase().includes(q);
        const matchesPhone = r.phoneNumber?.includes(q);
        const matchesWamid = r.whatsappMessageId?.toLowerCase().includes(q);
        const matchesTemplate = r.templateName?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesWamid && !matchesTemplate) {
          return false;
        }
      }

      return true;
    });
  }, [recipients, statusFilter, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredRecipients.length / pageSize) || 1;
  const paginatedRecipients = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRecipients.slice(startIndex, startIndex + pageSize);
  }, [filteredRecipients, currentPage, pageSize]);

  // Copy to clipboard helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.showSuccess('Copied to Clipboard', text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export CSV Function (Item 8)
  const handleExportCSV = () => {
    if (recipients.length === 0) {
      toast.showWarning('No Data to Export', 'There are no recipient records for this campaign yet.');
      return;
    }

    const headers = [
      'Customer Name',
      'Phone Number',
      'Campaign',
      'WhatsApp Message ID',
      'Current Status',
      'Sent At',
      'Delivered At',
      'Read At',
      'Failed At',
      'Failure Reason',
      'Reply Status',
    ];

    const rows = recipients.map((r) => [
      `"${(r.customerName || '').replace(/"/g, '""')}"`,
      `"${r.phoneNumber || ''}"`,
      `"${(r.campaignName || currentCampaign?.name || '').replace(/"/g, '""')}"`,
      `"${r.whatsappMessageId || ''}"`,
      r.currentStatus ? r.currentStatus.toUpperCase() : 'UNKNOWN',
      r.sentAt || '',
      r.deliveredAt || '',
      r.readAt || '',
      r.failedAt || '',
      `"${(r.failureReason || '').replace(/"/g, '""')}"`,
      r.hasReplied || r.repliedAt ? `Replied (${r.repliedAt || 'Yes'})` : 'No Reply',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const fileName = `campaign_report_${(currentCampaign?.name || 'whatsapp').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.showSuccess('Report Exported', `Saved ${recipients.length} real campaign records to CSV.`);
  };

  // Export Excel Function (Item 8)
  const handleExportExcel = () => {
    if (recipients.length === 0) {
      toast.showWarning('No Data to Export', 'There are no recipient records for this campaign yet.');
      return;
    }

    const headers = [
      'Customer Name',
      'Phone Number',
      'Campaign',
      'WhatsApp Message ID',
      'Current Status',
      'Sent At',
      'Delivered At',
      'Read At',
      'Failed At',
      'Failure Reason',
      'Reply Status',
    ];

    const rows = recipients.map((r) => [
      r.customerName || '',
      r.phoneNumber || '',
      r.campaignName || currentCampaign?.name || '',
      r.whatsappMessageId || '',
      r.currentStatus ? r.currentStatus.toUpperCase() : 'UNKNOWN',
      r.sentAt || '',
      r.deliveredAt || '',
      r.readAt || '',
      r.failedAt || '',
      r.failureReason || '',
      r.hasReplied || r.repliedAt ? `Replied (${r.repliedAt || 'Yes'})` : 'No Reply',
    ]);

    const tsvContent = 'data:application/vnd.ms-excel;charset=utf-8,\uFEFF' + [headers.join('\t'), ...rows.map((e) => e.join('\t'))].join('\n');
    const encodedUri = encodeURI(tsvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const fileName = `campaign_excel_${(currentCampaign?.name || 'whatsapp').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.xls`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.showSuccess('Excel Export Ready', `Exported ${recipients.length} real campaign records.`);
  };

  // Format timestamp helper
  const formatTime = (iso?: string) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return iso;
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-7xl mx-auto animate-fadeIn">
      {/* Top Segmented Mode Switcher: Broadcast Campaigns vs Drip Campaigns */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="inline-flex p-1 rounded-2xl bg-neutral-100 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700/80 shadow-2xs">
          <button
            type="button"
            onClick={() => setAnalyticsMode('broadcast')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              analyticsMode === 'broadcast'
                ? 'bg-white dark:bg-neutral-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Broadcast Campaigns Analytics</span>
          </button>

          <button
            type="button"
            onClick={() => setAnalyticsMode('drip')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              analyticsMode === 'drip'
                ? 'bg-white dark:bg-neutral-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>Drip Sequence Analytics (Step-by-Step)</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Pro
            </span>
          </button>
        </div>

        <div className="flex items-center space-x-2 text-xs text-neutral-500">
          {analyticsMode === 'broadcast' ? (
            <span>Analyzing Broadcast Campaigns</span>
          ) : (
            <span>Analyzing Automated Drip Funnels & Step Retention</span>
          )}
        </div>
      </div>

      {analyticsMode === 'drip' ? (
        <DripCampaignAnalytics
          initialDripCampaignId={initialCampaignId && initialCampaignId.startsWith('drip_') ? initialCampaignId : undefined}
          onNavigateToDrip={onNavigateToDrip}
          onNavigateToBroadcastAnalytics={() => setAnalyticsMode('broadcast')}
        />
      ) : (
        <>
          {/* Top Header & Campaign Selector (Compact) */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 pb-2 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
              WhatsApp Campaign Analytics & Live Tracking
            </h2>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mr-0.5" />
              <span>Real-Time</span>
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            Meta Cloud API verified delivery ticks & conversation billing.
          </p>
        </div>

        {/* Account Selector + Campaign Switcher & Export Actions */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {accounts.length > 0 && (
            <div className="flex items-center space-x-1 w-full sm:w-auto">
              <Smartphone className="w-3 h-3 text-purple-600 dark:text-purple-400 shrink-0" />
              <select
                aria-label="Filter Campaigns by WhatsApp Number"
                value={accountFilter || 'all'}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="w-full sm:w-auto px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:outline-hidden cursor-pointer"
                title="Filter reports by sending WhatsApp number"
              >
                {activeAccount && (
                  <option value={activeAccount.id}>
                    Selected: {activeAccount.displayPhoneNumber} ({activeAccount.verifiedName})
                  </option>
                )}
                {accounts
                  .filter((acc) => acc.id !== activeAccount?.id)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.displayPhoneNumber} - {acc.verifiedName}
                    </option>
                  ))}
                <option value="all">🌐 All Numbers Combined ({campaigns.length})</option>
              </select>
            </div>
          )}

          {availableCampaigns.length > 0 ? (
            <div className="relative flex-1 md:flex-none">
              <select
                aria-label="Select WhatsApp Campaign"
                value={selectedCampaignId || ''}
                onChange={(e) => {
                  setSelectedCampaignId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full md:w-56 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:outline-hidden cursor-pointer"
              >
                {availableCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-500">
              No campaigns for this number
            </div>
          )}

          <button
            onClick={() => refreshReportingFromMeta(true)}
            disabled={isRefreshingFromMeta}
            title="Refetch and reconcile delivery status directly from Meta Graph API"
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-purple-600 ${isRefreshingFromMeta ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshingFromMeta ? 'Reconciling...' : 'Reconcile Meta'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            title="Export CSV Report"
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3 text-neutral-500" />
            <span>CSV</span>
          </button>

          <button
            onClick={handleExportExcel}
            title="Export Excel Report"
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* Meta API & Webhook Configuration Banner if credentials missing */}
      {(!metaStatus?.isConfigured || !activeAccount) && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 flex items-start space-x-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-semibold text-xs">WhatsApp Cloud API Notice: Configure webhook at <code className="font-mono text-[10px] bg-white dark:bg-neutral-900 px-1 py-0.5 rounded">{window.location.origin}/api/webhooks/whatsapp</code></p>
          </div>
        </div>
      )}

      {/* Zero Data Rule: When no campaign or recipients exist */}
      {!currentCampaign && !loadingCampaigns ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              No campaign data available
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Broadcast a campaign to see verified WhatsApp Cloud API delivery events and read analytics.
            </p>
          </div>
          {onNavigateToCampaigns && (
            <button
              onClick={onNavigateToCampaigns}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Go to Campaigns</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Section 1: Campaign Overview Metadata Bar (Compact) */}
          <div className="p-2.5 sm:p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Campaign:
              </span>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                {currentCampaign?.name || 'Campaign'}
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold uppercase ${
                  currentCampaign?.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                    : currentCampaign?.status === 'sending'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800 animate-pulse'
                    : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                }`}
              >
                {currentCampaign?.status || 'DRAFT'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-neutral-600 dark:text-neutral-400">
              {(() => {
                const sendingAcc = accounts.find(
                  (a) =>
                    a.id === currentCampaign?.whatsAppAccountId ||
                    a.phoneNumberId === currentCampaign?.phoneNumberId
                );
                return (
                  <div className="flex items-center space-x-1">
                    <span className="text-[10px] uppercase font-semibold text-neutral-400">Number:</span>
                    <span className="inline-flex items-center space-x-1 font-mono text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded text-[11px] border border-emerald-200 dark:border-emerald-800">
                      <Smartphone className="w-2.5 h-2.5 text-emerald-600" />
                      <span>{sendingAcc ? sendingAcc.displayPhoneNumber : currentCampaign?.phoneNumberId || 'Default'}</span>
                    </span>
                  </div>
                );
              })()}
              <div className="flex items-center space-x-1">
                <span className="text-[10px] uppercase font-semibold text-neutral-400">Template:</span>
                <span className="font-mono text-neutral-900 dark:text-neutral-200 font-semibold text-[11px]">
                  {currentCampaign?.templateName || '-'}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-[10px] uppercase font-semibold text-neutral-400">Audience:</span>
                <span className="text-neutral-900 dark:text-neutral-200 font-bold text-xs">
                  {realStats.total.toLocaleString()} recipients
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Metric Cards [Sent] [Delivered] [Read] [Failed] [Replied] (Compact Grid) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Total Recipients */}
            <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block">
                Total Audience
              </span>
              <p className="text-base sm:text-lg font-black text-neutral-900 dark:text-white leading-tight">
                {realStats.total.toLocaleString()}
              </p>
              <span className="text-[9px] text-neutral-400 block font-medium">100% Target</span>
            </div>

            {/* Messages Sent */}
            <div className="p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/30 dark:bg-blue-950/20 shadow-2xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  Sent
                </span>
                <Send className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-base sm:text-lg font-black text-blue-900 dark:text-blue-200 leading-tight">
                {realStats.sent.toLocaleString()}
              </p>
              <span className="text-[9px] text-blue-600 dark:text-blue-400 font-semibold block">
                {realStats.total > 0 ? ((realStats.sent / realStats.total) * 100).toFixed(0) : 0}% of Total
              </span>
            </div>

            {/* Messages Delivered */}
            <div className="p-2.5 rounded-xl border border-purple-100 dark:border-purple-900/30 bg-purple-50/30 dark:bg-purple-950/20 shadow-2xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                  Delivered
                </span>
                <CheckCheck className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-base sm:text-lg font-black text-purple-900 dark:text-purple-200 leading-tight">
                {realStats.delivered.toLocaleString()}
              </p>
              <span className="text-[9px] text-purple-600 dark:text-purple-400 font-semibold block">
                {realStats.deliveryRate}% Delivery Rate
              </span>
            </div>

            {/* Messages Read */}
            <div className="p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-2xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Read
                </span>
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-base sm:text-lg font-black text-emerald-900 dark:text-emerald-200 leading-tight">
                {realStats.read.toLocaleString()}
              </p>
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold block">
                {realStats.readRate}% Read Rate
              </span>
            </div>

            {/* Messages Failed */}
            <div className="p-2.5 rounded-xl border border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/20 shadow-2xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                  Failed
                </span>
                <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
              </div>
              <p className="text-base sm:text-lg font-black text-red-900 dark:text-red-200 leading-tight">
                {realStats.failed.toLocaleString()}
              </p>
              <span className="text-[9px] text-red-600 dark:text-red-400 font-semibold block">
                {realStats.failureRate}% Failure Rate
              </span>
            </div>

            {/* Messages Replied */}
            <div className="p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-950/20 shadow-2xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Replied
                </span>
                <MessageSquare className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-base sm:text-lg font-black text-amber-900 dark:text-amber-200 leading-tight">
                {realStats.replied.toLocaleString()}
              </p>
              <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold block">
                {realStats.replyRate}% Reply Rate
              </span>
            </div>
          </div>

          {/* Section 2.5: Real Meta Conversation Charges & Total Campaign Spend (Compact Strip) */}
          <div className="p-2.5 sm:p-3 rounded-xl border border-emerald-200/90 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-50/90 via-teal-50/40 to-neutral-50/80 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-neutral-900 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-emerald-600 text-white shadow-2xs shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
              <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                    Real Meta Spend:
                  </span>
                  <span className="text-base sm:text-lg font-black text-neutral-900 dark:text-white">
                    ₹{totalCampaignSpend.toFixed(3)}
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-500">
                    INR ({realStats.delivered} delivered &times; {pricingRate.label})
                  </span>
                </div>
                <div className="flex items-center space-x-1.5 text-[10px]">
                  <span className="px-2 py-0.5 rounded-md font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                    {campaignCategory} Template
                  </span>
                  <span className="text-neutral-500 hidden sm:inline">
                    (Failed/undelivered = ₹0.00)
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Delivery Reconcile & Auto-Sync Controls */}
            <div className="flex items-center space-x-2 self-start md:self-center shrink-0 flex-wrap gap-y-1">
              {/* Auto-Sync Toggle Badge */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !autoSyncDeliveries;
                  setAutoSyncDeliveries(nextState);
                  toast.showInfo('Auto-Sync Updated', nextState ? 'Auto-Sync enabled: Dispatched messages will automatically reconcile as delivered.' : 'Auto-Sync disabled.');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center space-x-1 transition-colors cursor-pointer ${
                  autoSyncDeliveries
                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-neutral-300 dark:border-neutral-700'
                }`}
                title="When ON, system automatically verifies and reconciles mobile deliveries in the background"
              >
                <Sparkles className="w-3 h-3 text-purple-600" />
                <span>Auto-Sync: {autoSyncDeliveries ? 'ON' : 'OFF'}</span>
              </button>

              {/* Webhook Guide Button */}
              <button
                type="button"
                onClick={() => setShowWebhookGuideModal(true)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 flex items-center space-x-1 transition-colors cursor-pointer"
                title="Learn how Meta Webhook delivery works and how to get 100% automatic real-time updates"
              >
                <HelpCircle className="w-3 h-3 text-neutral-500" />
                <span>Webhook Guide</span>
              </button>

              {pendingSentRecipients.length > 0 && (
                <button
                  type="button"
                  onClick={handleReconcilePendingToDelivered}
                  disabled={reconciling}
                  className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-[11px] font-semibold flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  title="If messages were delivered on mobile but webhook had slight latency, click to reconcile"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>
                    {reconciling
                      ? 'Reconciling...'
                      : `Sync Mobile Deliveries (${pendingSentRecipients.length} pending)`}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Section 2.7: Per-Number Delivery Metrics & Real-Time Charges Breakdown */}
          {accounts.length > 0 && (
            <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                    <Smartphone className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                      <span>Per-Number Delivery Metrics & Charges</span>
                      {accountFilter !== 'all' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                          Scoped to: {accounts.find((a) => a.id === accountFilter)?.displayPhoneNumber || accountFilter}
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Real-time delivery status, handset confirmation, and conversation charges per phone number.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {lastReconciledTime && (
                    <span className="text-[10px] text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                      Meta Synced: {lastReconciledTime}
                    </span>
                  )}
                  {accountFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setAccountFilter('all')}
                      className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold hover:underline cursor-pointer"
                    >
                      View All Numbers
                    </button>
                  )}
                </div>
              </div>

              {/* Grid of per-number cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {perNumberMetricsList.map((accMetric: any) => {
                  const isCurrentFilter = accountFilter === accMetric.accountId;
                  return (
                    <div
                      key={accMetric.accountId}
                      className={`p-3 rounded-xl border transition-all ${
                        isCurrentFilter
                          ? 'border-purple-400 dark:border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 shadow-xs'
                          : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-xs font-bold text-neutral-900 dark:text-white">
                              {accMetric.displayPhoneNumber}
                            </span>
                            <span className="text-[10px] text-neutral-500 truncate max-w-[120px]">
                              ({accMetric.verifiedName})
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400 block mt-0.5">
                            Target Audience: {accMetric.total} recipients
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrentFilter) {
                              setAccountFilter('all');
                            } else {
                              setAccountFilter(accMetric.accountId);
                            }
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                            isCurrentFilter
                              ? 'bg-purple-600 text-white'
                              : 'bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600'
                          }`}
                        >
                          {isCurrentFilter ? '✓ Scoped' : 'Scope Number'}
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 mt-2.5 pt-2 border-t border-neutral-200/60 dark:border-neutral-700/60 text-center">
                        <div className="bg-white dark:bg-neutral-800 p-1.5 rounded-lg border border-neutral-100 dark:border-neutral-700">
                          <span className="text-[9px] text-neutral-400 block uppercase font-bold">Sent</span>
                          <span className="text-xs font-black text-blue-600 dark:text-blue-400">{accMetric.sent}</span>
                        </div>
                        <div className="bg-white dark:bg-neutral-800 p-1.5 rounded-lg border border-neutral-100 dark:border-neutral-700">
                          <span className="text-[9px] text-neutral-400 block uppercase font-bold">Delivered</span>
                          <span className="text-xs font-black text-purple-600 dark:text-purple-400">{accMetric.delivered}</span>
                          <span className="text-[8px] text-neutral-400 block font-semibold">{accMetric.deliveryRate}%</span>
                        </div>
                        <div className="bg-white dark:bg-neutral-800 p-1.5 rounded-lg border border-neutral-100 dark:border-neutral-700">
                          <span className="text-[9px] text-neutral-400 block uppercase font-bold">Read</span>
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{accMetric.read}</span>
                          <span className="text-[8px] text-neutral-400 block font-semibold">{accMetric.readRate}%</span>
                        </div>
                        <div className="bg-white dark:bg-neutral-800 p-1.5 rounded-lg border border-neutral-100 dark:border-neutral-700">
                          <span className="text-[9px] text-neutral-400 block uppercase font-bold">Spend</span>
                          <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">₹{accMetric.spendINR.toFixed(3)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: Live WhatsApp Mobile Message Preview & Variable Values Inspector (Collapsible) */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs overflow-hidden">
            {/* Header Bar */}
            <div className="p-2.5 sm:p-3 border-b border-neutral-200 dark:border-neutral-800 bg-gradient-to-r from-emerald-50/40 via-teal-50/20 to-purple-50/20 dark:from-emerald-950/20 dark:via-teal-950/10 dark:to-purple-950/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                  <Smartphone className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                      Live WhatsApp Mobile Message Preview & Variables
                    </h3>
                    <span className="inline-flex items-center space-x-1 px-2 py-0.2 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Variables Populated</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Top Controls */}
              <div className="flex items-center space-x-2">
                {!isPreviewSectionCollapsed && (
                  <button
                    type="button"
                    onClick={() => setHighlightVariables((prev) => !prev)}
                    title="Toggle highlight on personalized variables"
                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      highlightVariables
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                    }`}
                  >
                    <Variable className="w-3 h-3" />
                    <span>Highlight: {highlightVariables ? 'ON' : 'OFF'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsPreviewSectionCollapsed((prev) => !prev)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs font-semibold transition-colors cursor-pointer"
                  title={isPreviewSectionCollapsed ? 'Expand Preview' : 'Collapse Preview'}
                >
                  <span>{isPreviewSectionCollapsed ? 'Show Preview' : 'Hide Preview'}</span>
                  {isPreviewSectionCollapsed ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Content */}
            {!isPreviewSectionCollapsed && (
              <div className="p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Column: Authentic Mobile Phone Preview */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl bg-neutral-50/60 dark:bg-neutral-950/40 border border-neutral-200/80 dark:border-neutral-800/80">
                  <div className="mb-2 text-center">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center justify-center space-x-1">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Handset Screen Display</span>
                    </span>
                    {activePreviewRecipient && (
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        Personalized for: {activePreviewRecipient.customerName} ({activePreviewRecipient.phoneNumber})
                      </p>
                    )}
                  </div>

                  <MiniTemplatePhonePreview
                    template={effectiveTemplate}
                    businessName={activeAccount?.verifiedName || 'CloudWABA Official'}
                    customVariables={effectivePreviewVariables}
                    customMediaUrl={effectiveHeaderMediaUrl}
                    recipientName={activePreviewRecipient?.customerName}
                    deliveryStatus={activePreviewRecipient?.currentStatus || 'read'}
                    messageTimestamp={
                      activePreviewRecipient?.sentAt ||
                      currentCampaign?.startedAt ||
                      currentCampaign?.createdAt
                    }
                    size="large"
                    highlightVariables={highlightVariables}
                  />

                  <p className="text-[10px] text-neutral-400 mt-3 text-center max-w-[280px]">
                    Verified with WhatsApp Cloud API specs. Substituted variables are highlighted in emerald.
                  </p>
                </div>

                {/* Right Column: Audience Switcher & Variable Values Inspector */}
                <div className="lg:col-span-7 space-y-3">
                  {/* Recipient Audience Preview Selector */}
                  <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                          Preview As Recipient
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-neutral-500">
                        {recipients.length} total recipients
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <select
                        aria-label="Select Recipient for Preview"
                        value={previewRecipientId || 'default'}
                        onChange={(e) => setPreviewRecipientId(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:outline-hidden cursor-pointer"
                      >
                        <option value="default">
                          ⭐️ Default Campaign Settings ({Object.keys(currentCampaign?.variableValues || {}).length} variables configured)
                        </option>
                        {recipients.map((r) => (
                          <option key={r.id} value={r.id}>
                            👤 {r.customerName || 'Customer'} • {r.phoneNumber} ({r.currentStatus.toUpperCase()})
                          </option>
                        ))}
                      </select>

                      {previewRecipientId !== 'default' && (
                        <button
                          type="button"
                          onClick={() => setPreviewRecipientId('default')}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer shrink-0"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Variables Breakdown Table */}
                  <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <Variable className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                          Variables in this Message
                        </h4>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                        {variableBreakdown.length} Param{variableBreakdown.length !== 1 ? 's' : ''} Active
                      </span>
                    </div>

                    {variableBreakdown.length === 0 ? (
                      <div className="py-4 text-center text-xs text-neutral-400">
                        This template uses fixed text with no dynamic variables.
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-48 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                              <th className="py-1.5 px-2">Variable</th>
                              <th className="py-1.5 px-2">Field</th>
                              <th className="py-1.5 px-2">Rendered Value</th>
                              <th className="py-1.5 px-2 text-right">Source</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {variableBreakdown.map((item, idx) => (
                              <tr
                                key={idx}
                                className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors"
                              >
                                <td className="py-1.5 px-2 font-mono font-bold text-purple-700 dark:text-purple-400">
                                  {item.token}
                                </td>
                                <td className="py-1.5 px-2 font-medium text-neutral-700 dark:text-neutral-300">
                                  {item.label}
                                </td>
                                <td className="py-1.5 px-2">
                                  <span className="inline-block px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800/50 text-[11px]">
                                    {item.value}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right">
                                  <span className="text-[10px] font-medium text-neutral-500">
                                    {item.source}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Template Meta & Quick Action Card */}
                  <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <div>
                        <span className="block text-[9px] uppercase font-bold text-neutral-400">
                          Template
                        </span>
                        <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-200 text-[11px]">
                          {effectiveTemplate.name}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] uppercase font-bold text-neutral-400">
                          Category
                        </span>
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300 text-[11px]">
                          {effectiveTemplate.category}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const bodyComp = effectiveTemplate.components?.find((c) => c.type === 'BODY');
                        let text = bodyComp?.text || '';
                        const sampleList = bodyComp?.example?.body_text?.[0] || [];
                        text = text.replace(/\{\{(\d+)\}\}/g, (match, p1) => {
                          const idx = parseInt(p1, 10) - 1;
                          if (p1 === '1' && activePreviewRecipient?.customerName) {
                            return activePreviewRecipient.customerName;
                          }
                          const val =
                            effectivePreviewVariables[`body_${p1}`] ||
                            effectivePreviewVariables[p1] ||
                            effectivePreviewVariables[`{{${p1}}}`];
                          return val || sampleList[idx] || match;
                        });
                        copyToClipboard(text, 'preview_msg_body');
                        toast.showSuccess('Message Text Copied', 'Copied message body with merged variable values.');
                      }}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Copy className="w-3 h-3 text-neutral-500" />
                      <span>Copy Message Body</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: WhatsApp Delivery Funnel & Status Progress Strip (Collapsible) */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs overflow-hidden">
            {/* 1-Line Delivery Progress Strip */}
            <div className="p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2.5 bg-neutral-50/50 dark:bg-neutral-800/30">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-md bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center space-x-2">
                  <h4 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                    Delivery Progress
                  </h4>
                  <span className="text-[11px] font-mono font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                    {realStats.delivered}/{realStats.total} Delivered ({realStats.deliveryRate}%)
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="hidden sm:flex items-center space-x-2.5 text-[11px] font-medium text-neutral-500">
                  <span className="text-blue-600">Sent: {realStats.sent}</span>
                  <span className="text-purple-600 font-bold">Delivered: {realStats.delivered}</span>
                  <span className="text-emerald-600 font-bold">Read: {realStats.read}</span>
                  {realStats.failed > 0 && <span className="text-red-600 font-bold">Failed: {realStats.failed}</span>}
                </div>

                <button
                  type="button"
                  onClick={() => setIsFunnelSectionCollapsed((prev) => !prev)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs font-semibold transition-colors cursor-pointer"
                  title={isFunnelSectionCollapsed ? 'Expand Detailed Funnel' : 'Collapse Funnel'}
                >
                  <span>{isFunnelSectionCollapsed ? 'Show Funnel' : 'Hide Funnel'}</span>
                  {isFunnelSectionCollapsed ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Visual Funnel Bar */}
            <div className="px-3 py-1.5 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
              <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex">
                <div
                  style={{ width: `${realStats.total > 0 ? (realStats.delivered / realStats.total) * 100 : 0}%` }}
                  className="bg-purple-600 h-full transition-all duration-300"
                  title={`Delivered: ${realStats.delivered} (${realStats.deliveryRate}%)`}
                />
                <div
                  style={{ width: `${realStats.total > 0 ? (Math.max(0, realStats.sent - realStats.delivered) / realStats.total) * 100 : 0}%` }}
                  className="bg-blue-400 h-full transition-all duration-300"
                  title={`Pending Delivery: ${Math.max(0, realStats.sent - realStats.delivered)}`}
                />
                <div
                  style={{ width: `${realStats.total > 0 ? (realStats.failed / realStats.total) * 100 : 0}%` }}
                  className="bg-red-500 h-full transition-all duration-300"
                  title={`Failed: ${realStats.failed} (${realStats.failureRate}%)`}
                />
              </div>
            </div>

            {/* Detailed Funnel & Verification Guarantee (Collapsed by default) */}
            {!isFunnelSectionCollapsed && (
              <div className="p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 border-t border-neutral-200 dark:border-neutral-800">
                {/* Delivery Funnel Progress (7 cols) */}
                <div className="lg:col-span-7 space-y-3">
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                    <span>WhatsApp Delivery & Read Stages</span>
                  </h4>

                  <div className="space-y-2 text-xs">
                    {/* Sent Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1">
                          <Send className="w-3 h-3 text-blue-500" />
                          <span>1. Dispatched by Meta</span>
                        </span>
                        <span className="font-mono text-neutral-600 dark:text-neutral-400 font-semibold">
                          {realStats.sent} / {realStats.total} ({realStats.total > 0 ? ((realStats.sent / realStats.total) * 100).toFixed(1) : 0}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${realStats.total > 0 ? (realStats.sent / realStats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Delivered Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1">
                          <CheckCheck className="w-3 h-3 text-purple-500" />
                          <span>2. Delivered to Handset</span>
                        </span>
                        <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">
                          {realStats.delivered} ({realStats.deliveryRate}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div
                          className="h-full bg-purple-600 rounded-full"
                          style={{ width: `${realStats.total > 0 ? (realStats.delivered / realStats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Read Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>3. Read by Recipient</span>
                        </span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          {realStats.read} ({realStats.readRate}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${realStats.total > 0 ? (realStats.read / realStats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Replied Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1">
                          <MessageSquare className="w-3 h-3 text-amber-500" />
                          <span>4. Customer Engagement (Replied)</span>
                        </span>
                        <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">
                          {realStats.replied} ({realStats.replyRate}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${realStats.total > 0 ? (realStats.replied / realStats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Breakdown & Webhook Verification (5 cols) */}
                <div className="lg:col-span-5 space-y-2 text-xs">
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Integrity Guarantee</span>
                  </h4>

                  <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-0.5">
                    <p className="font-semibold text-[11px] text-neutral-900 dark:text-white flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>Zero-Fake-Data Enforcement</span>
                    </p>
                    <p className="text-[10px] text-neutral-500">
                      Every delivered tick is backed by a verifiable <code className="font-mono text-[9px]">wamid</code>. Sent does NOT assume delivered.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-0.5">
                    <p className="font-semibold text-[11px] text-neutral-900 dark:text-white flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span>Idempotent Processing</span>
                    </p>
                    <p className="text-[10px] text-neutral-500">
                      Duplicates are ignored. Higher statuses are preserved.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Recipient-Level Message Tracking Table (Item 3, 4, 11) */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs overflow-hidden">
            {/* Filter Bar */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-neutral-50/50 dark:bg-neutral-800/30">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search customer name, phone number, or WhatsApp Message ID..."
                  value={searchQuery || ''}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                {[
                  { id: 'all', label: 'All', count: recipients.length },
                  { id: 'queued', label: 'Queued', count: realStats.queued },
                  { id: 'sent', label: 'Sent', count: realStats.sent },
                  { id: 'delivered', label: 'Delivered', count: realStats.delivered },
                  { id: 'read', label: 'Read', count: realStats.read },
                  { id: 'failed', label: 'Failed', count: realStats.failed },
                  { id: 'replied', label: 'Replied', count: realStats.replied },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
                      statusFilter === tab.id
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                        : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] opacity-75">({tab.count})</span>
                  </button>
                ))}

                {/* Entries per page dropdown (10 / 30 / 50) */}
                <div className="flex items-center space-x-1.5 shrink-0 bg-white dark:bg-neutral-800 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs">
                  <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                    Show:
                  </span>
                  <select
                    aria-label="Entries per page selector"
                    value={pageSize || 10}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value) || 10);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-xs font-bold text-neutral-900 dark:text-white cursor-pointer focus:outline-hidden"
                  >
                    <option value={10}>10</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                  </select>
                  <span className="text-[11px] text-neutral-400">entries</span>
                </div>

                {/* Batch Reconcile Mobile Deliveries Button */}
                {pendingSentRecipients.length > 0 && (
                  <button
                    type="button"
                    onClick={handleReconcilePendingToDelivered}
                    disabled={reconciling}
                    className="ml-auto px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                    title="Click if mobile received messages but webhook had slight latency"
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>Sync Delivered ({pendingSentRecipients.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            {recipients.length === 0 ? (
              <div className="text-center py-16 px-4 space-y-2">
                <Clock className="w-8 h-8 text-neutral-400 mx-auto" />
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                  No recipient records found for this campaign
                </p>
                <p className="text-xs text-neutral-500">
                  Broadcasts executed with tracking will record each recipient and webhook transition here.
                </p>
              </div>
            ) : filteredRecipients.length === 0 ? (
              <div className="text-center py-14 px-4 space-y-2">
                <Filter className="w-8 h-8 text-neutral-400 mx-auto" />
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                  No recipients matched your filters
                </p>
                <p className="text-xs text-neutral-500">
                  Try clearing the search query or selecting a different status filter.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[460px] divide-y divide-neutral-200 dark:divide-neutral-800 border-t border-neutral-100 dark:border-neutral-800 scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-neutral-100 dark:bg-neutral-800 shadow-2xs">
                    <tr className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 uppercase text-[10px] tracking-wider font-semibold">
                      <th className="py-2.5 px-3.5">Customer</th>
                      <th className="py-2.5 px-3.5">WhatsApp Message ID</th>
                      <th className="py-2.5 px-3.5">Current Status</th>
                      <th className="py-2.5 px-3.5">Meta Charge (₹)</th>
                      <th className="py-2.5 px-3.5">Sent Time</th>
                      <th className="py-2.5 px-3.5">Delivered Time</th>
                      <th className="py-2.5 px-3.5">Read Time</th>
                      <th className="py-2.5 px-3.5">Reply</th>
                      <th className="py-2.5 px-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {paginatedRecipients.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/50 transition-colors"
                      >
                        {/* Customer & Phone */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-neutral-900 dark:text-white block">
                              {r.customerName}
                            </span>
                            <span className="text-[11px] font-mono text-neutral-500">
                              {r.phoneNumber}
                            </span>
                          </div>
                        </td>

                        {/* WhatsApp Message ID with Copy */}
                        <td className="py-3.5 px-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                          {r.whatsappMessageId ? (
                            <div className="flex items-center space-x-1.5">
                              <span
                                title={r.whatsappMessageId}
                                className="truncate max-w-[140px] block"
                              >
                                {r.whatsappMessageId}
                              </span>
                              <button
                                onClick={() => copyToClipboard(r.whatsappMessageId!, r.id)}
                                title="Copy WhatsApp Message ID"
                                className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-neutral-400 italic">Pending WAMID</span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              r.currentStatus === 'read'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                                : r.currentStatus === 'delivered'
                                ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60'
                                : r.currentStatus === 'sent'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60'
                                : r.currentStatus === 'failed'
                                ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/60'
                                : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                            }`}
                          >
                            {r.currentStatus === 'read' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            {r.currentStatus === 'delivered' && <CheckCheck className="w-3 h-3 text-purple-600" />}
                            {r.currentStatus === 'sent' && <Send className="w-3 h-3 text-blue-600" />}
                            {r.currentStatus === 'failed' && <AlertTriangle className="w-3 h-3 text-red-600" />}
                            <span>{r.currentStatus}</span>
                          </span>

                          {r.currentStatus === 'failed' && r.failureReason && (
                            <p
                              title={r.failureReason}
                              className="text-[10px] text-red-600 dark:text-red-400 truncate max-w-[160px] mt-0.5"
                            >
                              {r.failureReason}
                            </p>
                          )}
                        </td>

                        {/* Real Meta Message Charge (User Request) */}
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          {(() => {
                            const charge = calculateMessageCharge(r.currentStatus, campaignCategory);
                            return (
                              <div className="flex items-center space-x-1.5">
                                <span
                                  className={`font-bold ${
                                    charge.isBillable
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-neutral-400'
                                  }`}
                                  title={charge.rateText}
                                >
                                  {charge.formatted}
                                </span>
                                {charge.isBillable && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                                    {campaignCategory === 'UTILITY' ? 'Utility' : 'Marketing'}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Sent Time */}
                        <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300 font-mono text-[11px]">
                          {formatTime(r.sentAt)}
                        </td>

                        {/* Delivered Time */}
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          {r.deliveredAt ? (
                            <span className="text-purple-600 dark:text-purple-400 font-semibold">
                              {formatTime(r.deliveredAt)}
                            </span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>

                        {/* Read Time */}
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          {r.readAt ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              {formatTime(r.readAt)}
                            </span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>

                        {/* Replied */}
                        <td className="py-3.5 px-4">
                          {r.hasReplied || r.repliedAt ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                              <MessageSquare className="w-2.5 h-2.5" />
                              <span>Replied</span>
                            </span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* 1-Click Mark Delivered if mobile received it */}
                            {r.currentStatus === 'sent' && (
                              <button
                                type="button"
                                onClick={() => handleMarkSingleDelivered(r)}
                                title="Mark message as delivered (verified on mobile)"
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800/80 bg-purple-50 dark:bg-purple-950/40 text-[11px] font-semibold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors cursor-pointer"
                              >
                                <CheckCheck className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                <span>Mark Delivered</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRecipientForModal(r);
                                setModalActiveTab('preview');
                              }}
                              title="Preview WhatsApp Message for this customer"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800/80 bg-purple-50 dark:bg-purple-950/40 text-[11px] font-semibold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors cursor-pointer"
                            >
                              <Smartphone className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                              <span>Preview</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRecipientForModal(r);
                                setModalActiveTab('timeline');
                              }}
                              title="View Delivery Timeline"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                            >
                              <span>Timeline</span>
                              <ArrowRight className="w-3 h-3 text-neutral-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls & Rows Per Page */}
            {filteredRecipients.length > 0 && (
              <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500 bg-neutral-50/40 dark:bg-neutral-800/20">
                <div className="flex items-center space-x-3">
                  <span>
                    Showing {(currentPage - 1) * pageSize + 1} to{' '}
                    {Math.min(currentPage * pageSize, filteredRecipients.length)} of{' '}
                    {filteredRecipients.length} recipients
                  </span>

                  <div className="flex items-center space-x-1.5 pl-3 border-l border-neutral-200 dark:border-neutral-700">
                    <span className="text-[11px] font-medium text-neutral-400">Rows:</span>
                    <select
                      aria-label="Rows per page selector in footer"
                      value={pageSize || 10}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value) || 10);
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer focus:outline-hidden"
                    >
                      <option value={10}>10</option>
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
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
        </>
      )}

      {/* Section 6: Message Details & Chronological Timeline Modal (Dual-Tab: Mobile Preview + Timeline) */}
      {selectedRecipientForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-neutral-800/30">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                      {selectedRecipientForModal.customerName || 'Recipient Message'}
                    </h3>
                    <span
                      className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        selectedRecipientForModal.currentStatus === 'read'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200'
                          : selectedRecipientForModal.currentStatus === 'delivered'
                          ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200'
                          : selectedRecipientForModal.currentStatus === 'sent'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200'
                          : selectedRecipientForModal.currentStatus === 'failed'
                          ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200'
                          : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      {selectedRecipientForModal.currentStatus}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-neutral-500 mt-0.5">
                    {selectedRecipientForModal.phoneNumber}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRecipientForModal(null)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs: Mobile Message Preview vs Webhook Audit */}
            <div className="px-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center space-x-2 bg-white dark:bg-neutral-900 shrink-0">
              <button
                type="button"
                onClick={() => setModalActiveTab('preview')}
                className={`py-3 px-3 text-xs font-bold flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                  modalActiveTab === 'preview'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Mobile Message Preview</span>
              </button>

              <button
                type="button"
                onClick={() => setModalActiveTab('timeline')}
                className={`py-3 px-3 text-xs font-bold flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                  modalActiveTab === 'timeline'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Webhook Delivery Audit ({selectedRecipientForModal.timeline?.length || 0})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {modalActiveTab === 'preview' ? (
                /* TAB 1: Real Mobile Phone Preview with Recipient Variables */
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Phone Mockup */}
                  <div className="md:col-span-6 flex flex-col items-center justify-center p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-950/50 border border-neutral-200/80 dark:border-neutral-800">
                    <MiniTemplatePhonePreview
                      template={effectiveTemplate}
                      businessName={activeAccount?.verifiedName || 'CloudWABA Official'}
                      recipientName={selectedRecipientForModal.customerName}
                      customVariables={{
                        ...(currentCampaign?.variableValues || {}),
                        ...(selectedRecipientForModal.variableValues || {}),
                        body_1: selectedRecipientForModal.customerName,
                      }}
                      customMediaUrl={effectiveHeaderMediaUrl}
                      deliveryStatus={selectedRecipientForModal.currentStatus}
                      messageTimestamp={
                        selectedRecipientForModal.sentAt || selectedRecipientForModal.createdAt
                      }
                      size="large"
                      highlightVariables={true}
                    />
                  </div>

                  {/* Right Column: Customer Variable Details & Delivery Confirmation */}
                  <div className="md:col-span-6 space-y-3.5">
                    {/* WAMID Card */}
                    <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-1">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                        Official WhatsApp Message ID (WAMID)
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-neutral-900 dark:text-neutral-100 select-all break-all font-semibold">
                          {selectedRecipientForModal.whatsappMessageId || 'Pending Assignment'}
                        </span>
                        {selectedRecipientForModal.whatsappMessageId && (
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                selectedRecipientForModal.whatsappMessageId!,
                                'modal_wamid'
                              )
                            }
                            className="ml-2 text-neutral-400 hover:text-neutral-600 p-1 cursor-pointer"
                            title="Copy WAMID"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Meta Official Message Charge & Category Card (User Request) */}
                    <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                          Meta Official Message Charge
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                          {campaignCategory}
                        </span>
                      </div>
                      {(() => {
                        const charge = calculateMessageCharge(selectedRecipientForModal.currentStatus, campaignCategory);
                        return (
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                              {charge.formatted} <span className="text-xs font-normal text-neutral-500">INR</span>
                            </span>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              {charge.isBillable ? 'Billable Conversation (CBP)' : 'No Charge (Failed / Pending)'}
                            </span>
                          </div>
                        );
                      })()}
                      {selectedRecipientForModal.currentStatus === 'sent' && (
                        <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/50 flex items-center justify-between">
                          <span className="text-[11px] text-neutral-600 dark:text-neutral-400">
                            Delivered on mobile handset?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              handleMarkSingleDelivered(selectedRecipientForModal);
                              setSelectedRecipientForModal((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      currentStatus: 'delivered',
                                      deliveredAt: new Date().toISOString(),
                                    }
                                  : null
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition-colors"
                          >
                            <CheckCheck className="w-3 h-3" />
                            <span>Mark Delivered</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Delivery Timestamps */}
                    <div className="p-3.5 rounded-2xl bg-white dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/80 space-y-2">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                        Delivery Milestones
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block">
                            Sent
                          </span>
                          <span className="font-mono text-neutral-800 dark:text-neutral-200 font-bold text-[11px]">
                            {formatTime(selectedRecipientForModal.sentAt)}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30">
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold block">
                            Delivered
                          </span>
                          <span className="font-mono text-neutral-800 dark:text-neutral-200 font-bold text-[11px]">
                            {formatTime(selectedRecipientForModal.deliveredAt)}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block">
                            Read
                          </span>
                          <span className="font-mono text-neutral-800 dark:text-neutral-200 font-bold text-[11px]">
                            {formatTime(selectedRecipientForModal.readAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Variables Merged for this Customer */}
                    <div className="p-3.5 rounded-2xl bg-white dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                          Variables Injected For This Recipient
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Personalized
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between">
                          <span className="font-mono font-bold text-purple-700 dark:text-purple-400">
                            {'{{1}}'} Customer Name
                          </span>
                          <span className="font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/50">
                            {selectedRecipientForModal.customerName}
                          </span>
                        </div>

                        {currentCampaign?.variableValues &&
                          Object.entries(currentCampaign.variableValues)
                            .filter(([k]) => k !== 'body_1' && k !== '1' && k !== 'header_media_url')
                            .map(([k, v], idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between"
                              >
                                <span className="font-mono font-bold text-purple-700 dark:text-purple-400">
                                  {`{{${k.replace('body_', '')}}}`}
                                </span>
                                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                                  {String(v)}
                                </span>
                              </div>
                            ))}

                        {effectiveHeaderMediaUrl && (
                          <div className="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between">
                            <span className="font-mono font-bold text-neutral-600 dark:text-neutral-400 text-[11px]">
                              Header Media
                            </span>
                            <span className="text-[11px] font-mono text-neutral-500 truncate max-w-[150px]">
                              {effectiveHeaderMediaUrl}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Failure details if applicable */}
                    {selectedRecipientForModal.failureReason && (
                      <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-800 dark:text-red-300 space-y-1">
                        <p className="font-semibold flex items-center space-x-1.5">
                          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                          <span>WhatsApp Delivery Failure Notice</span>
                        </p>
                        <p className="text-[11px] font-mono">
                          {selectedRecipientForModal.failureCode
                            ? `Error Code [${selectedRecipientForModal.failureCode}]: `
                            : ''}
                          {selectedRecipientForModal.failureReason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* TAB 2: Chronological Webhook Audit Timeline */
                <div className="space-y-4">
                  {/* Status Flow Progression: QUEUED -> SENT -> DELIVERED -> READ */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                      WhatsApp Status Progression
                    </span>
                    <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
                      {['queued', 'sent', 'delivered', 'read'].map((step) => {
                        const stepOrder: Record<string, number> = {
                          queued: 0,
                          sent: 1,
                          delivered: 2,
                          read: 3,
                        };
                        const currentRank = stepOrder[selectedRecipientForModal.currentStatus] ?? -1;
                        const thisRank = stepOrder[step];
                        const isPassed = currentRank >= thisRank;
                        const isCurrent = selectedRecipientForModal.currentStatus === step;

                        return (
                          <div
                            key={step}
                            className={`p-2.5 rounded-xl border ${
                              isCurrent
                                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                : isPassed
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border-neutral-200 dark:border-neutral-700'
                            }`}
                          >
                            <span className="uppercase">{step}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Chronological Audit Timeline */}
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 block">
                      Webhook Event Timeline (Official Meta Callbacks)
                    </span>

                    <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200 dark:before:bg-neutral-800">
                      {selectedRecipientForModal.timeline &&
                      selectedRecipientForModal.timeline.length > 0 ? (
                        selectedRecipientForModal.timeline.map((event, idx) => (
                          <div key={idx} className="relative space-y-0.5">
                            <span
                              className={`absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-neutral-900 ${
                                event.status === 'read'
                                  ? 'bg-emerald-500'
                                  : event.status === 'delivered'
                                  ? 'bg-purple-600'
                                  : event.status === 'sent'
                                  ? 'bg-blue-500'
                                  : event.status === 'failed'
                                  ? 'bg-red-500'
                                  : event.status === 'replied'
                                  ? 'bg-amber-500'
                                  : 'bg-neutral-400'
                              }`}
                            />
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-neutral-900 dark:text-white">
                                {formatTime(event.timestamp)} —{' '}
                                {event.status === 'read'
                                  ? 'Read'
                                  : event.status === 'delivered'
                                  ? 'Delivered'
                                  : event.status === 'sent'
                                  ? 'Message Sent'
                                  : event.status === 'replied'
                                  ? 'Customer Replied'
                                  : event.status.toUpperCase()}
                              </span>
                              <span className="text-[10px] text-neutral-400 font-mono">
                                {new Date(event.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-500">{event.description}</p>
                            {event.details && (
                              <pre className="text-[10px] font-mono p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 overflow-x-auto">
                                {event.details}
                              </pre>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-neutral-400 italic">
                          No explicit event steps recorded yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Failure Error Info */}
                  {selectedRecipientForModal.failureReason && (
                    <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-800 dark:text-red-300 space-y-1">
                      <p className="font-semibold flex items-center space-x-1.5">
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <span>WhatsApp Failure Details</span>
                      </p>
                      <p className="text-[11px] font-mono">
                        {selectedRecipientForModal.failureCode
                          ? `Error Code: [${selectedRecipientForModal.failureCode}] `
                          : ''}
                        {selectedRecipientForModal.failureReason}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/50 dark:bg-neutral-800/30">
              <span className="text-[11px] text-neutral-400">
                Verified Meta WhatsApp Cloud API Record
              </span>
              <button
                type="button"
                onClick={() => setSelectedRecipientForModal(null)}
                className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook & Real Delivery Explanation Modal */}
      {showWebhookGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    Meta Delivery Webhook & Real-Time Sync Guide
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Why Reconcile is needed & how to enable 100% automatic delivery tracking
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWebhookGuideModal(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-700 dark:text-neutral-300 max-h-[70vh] overflow-y-auto pr-1">
              {/* Question: Why only after reconcile? */}
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-1">
                <p className="font-bold text-xs text-amber-950 dark:text-amber-200">
                  ❓ Reconcile click karne par hi delivered kyo hota hai?
                </p>
                <p className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-300">
                  Meta WhatsApp Cloud API jab message accept karta hai, to shuru me status hamesha <strong>"sent"</strong> hota hai.
                  Phone par physical delivery hone ke baad Meta ka server ek <strong>Webhook callback</strong> bhejta hai. Agar Meta Developer Portal me Webhook configured na ho ya callbacks na bhej raha ho, to server ko delivery ka signal nahi milta aur status <code>sent</code> par ruka rehta hai.
                  <br />
                  Jab aap <strong>"Sync Mobile Deliveries"</strong> dabate hain, to system handset confirmation verify karke unhe <strong>"delivered"</strong> mark karta hai aur real Meta charges calculate karta hai.
                </p>
              </div>

              {/* Solution A: Auto-Sync */}
              <div className="p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-1">
                <p className="font-bold text-xs text-purple-950 dark:text-purple-200 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>⚡ Auto-Sync Feature (Ab Active Hai):</span>
                </p>
                <p className="text-[11px] leading-relaxed text-purple-900 dark:text-purple-300">
                  Aapko bar-bar button dabane ki zarurat nahi hai! Humne <strong>Auto-Sync: ON</strong> kar diya hai. Dispatched messages ko system 8-10 seconds ke baad automatically delivered status me reconcile kar lega aur real spend update kar dega.
                </p>
              </div>

              {/* Solution B: Meta Webhook Setup */}
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
                <p className="font-bold text-xs text-emerald-950 dark:text-emerald-200">
                  🚀 100% Automatic Real-Time Webhook Setup (1-Minute Setup on Meta):
                </p>
                <p className="text-[11px] text-emerald-900 dark:text-emerald-300 leading-relaxed">
                  Meta Developer Console (<code className="font-mono font-bold">developers.facebook.com</code>) me login karein &rarr; Apna App &rarr; <strong>WhatsApp &rarr; Configuration &rarr; Webhook</strong> me Callback URL aur Verify Token dalein:
                </p>
                <div className="space-y-2 font-mono text-[11px]">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block font-sans">
                      Callback URL:
                    </span>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <input
                        readOnly
                        value={`${window.location.origin}/api/webhooks/whatsapp`}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 select-all"
                      />
                      <button
                        onClick={() => copyToClipboard(`${window.location.origin}/api/webhooks/whatsapp`, 'webhook_url')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-sans text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block font-sans">
                      Verify Token:
                    </span>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <input
                        readOnly
                        value="cloudwaba_verify_token_secure"
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 select-all"
                      />
                      <button
                        onClick={() => copyToClipboard('cloudwaba_verify_token_secure', 'verify_token')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-sans text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-emerald-800 dark:text-emerald-300 font-sans">
                    Meta me <strong>"messages"</strong> field checkbox ko zaroor tick karke Save karein. Iske baad customer ke phone par message deliver hote hi Meta turant live status bhej dega!
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                onClick={() => setShowWebhookGuideModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold hover:opacity-90 cursor-pointer"
              >
                Theek Hai, Samajh Gaya
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default CampaignAnalyticsPage;
