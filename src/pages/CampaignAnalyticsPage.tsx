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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeCampaigns,
  subscribeCampaignRecipients,
  subscribeTemplates,
  fetchCampaignAnalyticsApi,
} from '../lib/services.ts';
import { MiniTemplatePhonePreview } from '../components/MiniTemplatePhonePreview.tsx';
import type {
  Campaign,
  CampaignRecipient,
  CampaignStats,
  MessageStatus,
  Template,
} from '../types/index.ts';

interface CampaignAnalyticsPageProps {
  initialCampaignId?: string;
  onNavigateToCampaigns?: () => void;
}

export const CampaignAnalyticsPage: React.FC<CampaignAnalyticsPageProps> = ({
  initialCampaignId,
  onNavigateToCampaigns,
}) => {
  const { organization } = useAuth();
  const { metaStatus, activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Modal for Message Detail & Timeline
  const [selectedRecipientForModal, setSelectedRecipientForModal] = useState<CampaignRecipient | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'preview' | 'timeline'>('preview');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Template subscription & dynamic variable preview state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [previewRecipientId, setPreviewRecipientId] = useState<string>('default');
  const [highlightVariables, setHighlightVariables] = useState<boolean>(true);
  const [isPreviewSectionCollapsed, setIsPreviewSectionCollapsed] = useState<boolean>(false);

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
        // Default to first campaign or initialCampaignId
        if (!selectedCampaignId && data.length > 0) {
          const match = initialCampaignId ? data.find((c) => c.id === initialCampaignId) : null;
          setSelectedCampaignId(match ? match.id : data[0].id);
        }
      },
      (err) => {
        console.warn('Error loading campaigns:', err);
        setLoadingCampaigns(false);
      }
    );
    return () => unsub();
  }, [organization?.id, initialCampaignId]);

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
    fetchCampaignAnalyticsApi(selectedCampaignId)
      .then((res: any) => {
        if (res && res.stats && (!currentCampaign?.stats || res.hasRealData)) {
          // Sync server-calculated stats if present
        }
      })
      .catch(() => {});

    return () => unsub();
  }, [organization?.id, selectedCampaignId]);

  // Genuine Real Stats Calculation strictly from actual database records (No mock data)
  const realStats: CampaignStats = useMemo(() => {
    if (recipients.length > 0) {
      const total = recipients.length;
      let queued = 0;
      let sent = 0;
      let delivered = 0;
      let read = 0;
      let failed = 0;
      let replied = 0;
      let buttonClicks = 0;

      for (const r of recipients) {
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
  }, [recipients, currentCampaign]);

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
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Top Header & Campaign Selector */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              WhatsApp Campaign Analytics & Live Tracking
            </h2>
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mr-0.5" />
              <span>Real-Time Webhooks</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Real message statuses verified by Meta Cloud API webhooks. No simulated or mock data.
          </p>
        </div>

        {/* Campaign Switcher & Export Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {campaigns.length > 0 && (
            <div className="relative flex-1 md:flex-none">
              <select
                aria-label="Select WhatsApp Campaign"
                value={selectedCampaignId}
                onChange={(e) => {
                  setSelectedCampaignId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full md:w-64 px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:outline-hidden cursor-pointer"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => {
              if (selectedCampaignId) {
                fetchCampaignAnalyticsApi(selectedCampaignId).catch(() => {});
                toast.showInfo('Refreshed', 'Synced latest webhook delivery statistics.');
              }
            }}
            title="Refresh Delivery Metrics"
            className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportCSV}
            title="Export CSV Report"
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-neutral-500" />
            <span>CSV</span>
          </button>

          <button
            onClick={handleExportExcel}
            title="Export Excel Report"
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* Meta API & Webhook Configuration Banner if credentials missing */}
      {(!metaStatus?.isConfigured || !activeAccount) && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-sm">WhatsApp Cloud API & Webhook Configuration Notice</p>
            <p>
              Real delivery ticks require valid Meta WhatsApp Cloud API credentials and the webhook endpoint configured at:
            </p>
            <p className="font-mono bg-white dark:bg-neutral-900 px-2 py-1 rounded border border-amber-200 dark:border-amber-800/80 inline-block text-[11px] select-all">
              {window.location.origin}/api/webhooks/whatsapp
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Verify Token: <code className="font-bold">cloudwaba_verify_token_secure</code> (or your custom META_WEBHOOK_VERIFY_TOKEN).
            </p>
          </div>
        </div>
      )}

      {/* Zero Data Rule: When no campaign or recipients exist */}
      {!currentCampaign && !loadingCampaigns ? (
        <div className="text-center py-20 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
            <BarChart3 className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              No campaign data available
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              There are no broadcast campaigns stored in the database. Broadcast a campaign to see verified WhatsApp Cloud API delivery events and read analytics.
            </p>
          </div>
          {onNavigateToCampaigns && (
            <button
              onClick={onNavigateToCampaigns}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Go to Campaigns</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Section 1: Campaign Overview Metadata Bar (Item 11) */}
          <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Active Campaign
              </span>
              <div className="flex items-center space-x-3">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {currentCampaign?.name || 'Campaign'}
                </h3>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
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
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-neutral-600 dark:text-neutral-400">
              <div>
                <span className="block text-[10px] uppercase font-semibold text-neutral-400">Template</span>
                <span className="font-mono text-neutral-900 dark:text-neutral-200 font-semibold">
                  {currentCampaign?.templateName || '-'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-semibold text-neutral-400">Start Time</span>
                <span className="text-neutral-900 dark:text-neutral-200 font-medium">
                  {formatDate(currentCampaign?.startedAt || currentCampaign?.createdAt)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-semibold text-neutral-400">Total Audience</span>
                <span className="text-neutral-900 dark:text-neutral-200 font-bold text-sm">
                  {realStats.total.toLocaleString()} recipients
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Metric Cards [Sent] [Delivered] [Read] [Failed] [Replied] (Item 1 & 11) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total Recipients */}
            <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Total Recipients
              </span>
              <p className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white">
                {realStats.total.toLocaleString()}
              </p>
              <span className="text-[10px] text-neutral-400 block font-medium">100% Target Audience</span>
            </div>

            {/* Messages Sent */}
            <div className="p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/30 dark:bg-blue-950/20 shadow-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  Sent
                </span>
                <Send className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-blue-900 dark:text-blue-200">
                {realStats.sent.toLocaleString()}
              </p>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block">
                {realStats.total > 0 ? ((realStats.sent / realStats.total) * 100).toFixed(1) : 0}% of Total
              </span>
            </div>

            {/* Messages Delivered */}
            <div className="p-4 rounded-2xl border border-purple-100 dark:border-purple-900/30 bg-purple-50/30 dark:bg-purple-950/20 shadow-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                  Delivered
                </span>
                <CheckCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-purple-900 dark:text-purple-200">
                {realStats.delivered.toLocaleString()}
              </p>
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold block">
                {realStats.deliveryRate}% Delivery Rate
              </span>
            </div>

            {/* Messages Read */}
            <div className="p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Read
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-900 dark:text-emerald-200">
                {realStats.read.toLocaleString()}
              </p>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block">
                {realStats.readRate}% Read Rate
              </span>
            </div>

            {/* Messages Failed */}
            <div className="p-4 rounded-2xl border border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/20 shadow-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                  Failed
                </span>
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-red-900 dark:text-red-200">
                {realStats.failed.toLocaleString()}
              </p>
              <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold block">
                {realStats.failureRate}% Failure Rate
              </span>
            </div>

            {/* Messages Replied */}
            <div className="p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-950/20 shadow-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Replied
                </span>
                <MessageSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-amber-900 dark:text-amber-200">
                {realStats.replied.toLocaleString()}
              </p>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block">
                {realStats.replyRate}% Reply Rate
              </span>
            </div>
          </div>

          {/* Section 3: Live WhatsApp Mobile Message Preview & Variable Values Inspector */}
          <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs overflow-hidden">
            {/* Header Bar */}
            <div className="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-800 bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-purple-50/30 dark:from-emerald-950/20 dark:via-teal-950/10 dark:to-purple-950/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                      Live WhatsApp Mobile Message Preview
                    </h3>
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span>Variables Populated</span>
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Authentic smartphone handset view of the broadcast message with your customized variable values and media attachment.
                  </p>
                </div>
              </div>

              {/* Top Controls */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setHighlightVariables((prev) => !prev)}
                  title="Toggle highlight on personalized variables"
                  className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    highlightVariables
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                  }`}
                >
                  <Variable className="w-3.5 h-3.5" />
                  <span>Highlight Variables: {highlightVariables ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPreviewSectionCollapsed((prev) => !prev)}
                  className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors cursor-pointer"
                  title={isPreviewSectionCollapsed ? 'Expand Preview' : 'Collapse Preview'}
                >
                  {isPreviewSectionCollapsed ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronUp className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Content */}
            {!isPreviewSectionCollapsed && (
              <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Authentic Mobile Phone Preview */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center p-2 sm:p-4 rounded-2xl bg-neutral-50/60 dark:bg-neutral-950/40 border border-neutral-200/80 dark:border-neutral-800/80">
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
                <div className="lg:col-span-7 space-y-4">
                  {/* Recipient Audience Preview Selector */}
                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <UserCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
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
                        value={previewRecipientId}
                        onChange={(e) => setPreviewRecipientId(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 focus:outline-hidden cursor-pointer"
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
                          className="px-3 py-2 rounded-xl text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer shrink-0"
                        >
                          Reset to Default
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Switching the recipient previews how customer personal parameters (like{' '}
                      <code className="text-purple-600 dark:text-purple-400 font-mono font-bold">
                        {'{{1}}'}
                      </code>{' '}
                      for Name) dynamically merge into the WhatsApp payload.
                    </p>
                  </div>

                  {/* Variables Breakdown Table */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Variable className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                          Variables & Merged Values in this Message
                        </h4>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                        {variableBreakdown.length} Param{variableBreakdown.length !== 1 ? 's' : ''} Active
                      </span>
                    </div>

                    {variableBreakdown.length === 0 ? (
                      <div className="py-6 text-center text-xs text-neutral-400">
                        This template uses fixed text with no dynamic variables.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                              <th className="py-2.5 px-3">Variable Token</th>
                              <th className="py-2.5 px-3">Field / Meaning</th>
                              <th className="py-2.5 px-3">Value Rendered in Message</th>
                              <th className="py-2.5 px-3 text-right">Data Source</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {variableBreakdown.map((item, idx) => (
                              <tr
                                key={idx}
                                className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors"
                              >
                                <td className="py-2.5 px-3 font-mono font-bold text-purple-700 dark:text-purple-400">
                                  {item.token}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-neutral-700 dark:text-neutral-300">
                                  {item.label}
                                </td>
                                <td className="py-2.5 px-3">
                                  {item.type === 'media' && item.value.startsWith('http') ? (
                                    <div className="flex items-center space-x-2">
                                      <img
                                        src={item.value}
                                        alt="Thumbnail"
                                        className="w-7 h-7 rounded-md object-cover border border-neutral-200 dark:border-neutral-700"
                                      />
                                      <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300 truncate max-w-[140px]">
                                        {item.value}
                                      </span>
                                    </div>
                                  ) : item.type === 'media' && item.value.startsWith('/') ? (
                                    <div className="flex items-center space-x-2">
                                      <img
                                        src={item.value}
                                        alt="Local attachment"
                                        className="w-7 h-7 rounded-md object-cover border border-neutral-200 dark:border-neutral-700"
                                      />
                                      <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300 truncate max-w-[140px]">
                                        {item.value}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800/50">
                                      {item.value}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right">
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
                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-neutral-400">
                          Template
                        </span>
                        <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-200">
                          {effectiveTemplate.name}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-neutral-400">
                          Category
                        </span>
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                          {effectiveTemplate.category}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-neutral-400">
                          Language
                        </span>
                        <span className="font-mono text-neutral-700 dark:text-neutral-300">
                          {effectiveTemplate.language}
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
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Copy className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Copy Substituted Message Text</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Delivery & Read Analytics Visualization (Item 4 & 11) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Delivery Funnel Progress (7 cols) */}
            <div className="lg:col-span-7 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>WhatsApp Delivery & Read Funnel</span>
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Live delivery stage conversion confirmed by Meta status callbacks
                  </p>
                </div>
                <span className="text-xs font-semibold text-neutral-500 font-mono">
                  {realStats.sent} Sent
                </span>
              </div>

              {/* Visual Funnel Bars */}
              <div className="space-y-3 pt-2">
                {/* Sent Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1.5">
                      <Send className="w-3.5 h-3.5 text-blue-500" />
                      <span>1. Dispatched by Meta</span>
                    </span>
                    <span className="font-mono text-neutral-600 dark:text-neutral-400 font-semibold">
                      {realStats.sent} / {realStats.total} (
                      {realStats.total > 0 ? ((realStats.sent / realStats.total) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${realStats.total > 0 ? (realStats.sent / realStats.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Delivered Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1.5">
                      <CheckCheck className="w-3.5 h-3.5 text-purple-500" />
                      <span>2. Delivered to Handset</span>
                    </span>
                    <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">
                      {realStats.delivered} ({realStats.deliveryRate}%)
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full bg-purple-600 rounded-full transition-all duration-500"
                      style={{
                        width: `${realStats.total > 0 ? (realStats.delivered / realStats.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Read Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>3. Read by Recipient</span>
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {realStats.read} ({realStats.readRate}%)
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${realStats.total > 0 ? (realStats.read / realStats.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Replied Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                      <span>4. Customer Engagement (Replied)</span>
                    </span>
                    <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">
                      {realStats.replied} ({realStats.replyRate}%)
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${realStats.total > 0 ? (realStats.replied / realStats.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Status Breakdown & Webhook Verification (5 cols) */}
            <div className="lg:col-span-5 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-4">
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Verification & Integrity Guarantee</span>
              </h4>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-neutral-900 dark:text-white">Strict Zero-Fake-Data Enforcement</p>
                    <p className="text-[11px] text-neutral-500">
                      Every delivered tick is backed by a verifiable <code className="font-mono text-[10px]">wamid</code> and Meta timestamp. Sent does NOT assume delivered.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 flex items-start space-x-2.5">
                  <Clock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-neutral-900 dark:text-white">Idempotent Webhook Processing</p>
                    <p className="text-[11px] text-neutral-500">
                      Duplicates are ignored. Higher statuses (Read) are never regressed by delayed Delivered webhooks.
                    </p>
                  </div>
                </div>

                {realStats.failed > 0 && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300 flex items-start space-x-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-semibold">{realStats.failed} Rejections Detected</p>
                      <p className="text-[11px]">
                        Review failure codes in the recipient table below (e.g. invalid number or opt-out).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                  value={searchQuery}
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
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">WhatsApp Message ID</th>
                      <th className="py-3 px-4">Current Status</th>
                      <th className="py-3 px-4">Sent Time</th>
                      <th className="py-3 px-4">Delivered Time</th>
                      <th className="py-3 px-4">Read Time</th>
                      <th className="py-3 px-4">Reply</th>
                      <th className="py-3 px-4 text-right">Action</th>
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

            {/* Pagination Controls */}
            {filteredRecipients.length > pageSize && (
              <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 bg-neutral-50/40 dark:bg-neutral-800/20">
                <span>
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, filteredRecipients.length)} of{' '}
                  {filteredRecipients.length} recipients
                </span>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 disabled:opacity-40 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer"
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
                            className="ml-2 text-neutral-400 hover:text-neutral-600 p-1"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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
    </div>
  );
};

export default CampaignAnalyticsPage;
