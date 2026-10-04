import React, { useState, useMemo } from 'react';
import {
  X,
  Send,
  Smartphone,
  Users,
  ClipboardPaste,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  HelpCircle,
  FileText,
  Image as ImageIcon,
  Video,
  FileCheck,
  PhoneCall,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  RefreshCw,
  Zap,
  UploadCloud,
  HardDrive,
  Link as LinkIcon,
  Trash2,
} from 'lucide-react';
import type { Template, Contact, ContactGroup, WhatsAppAccount } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import { createCampaign, launchCampaign, uploadMediaFile } from '../lib/services.ts';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  activeAccount: WhatsAppAccount | null;
  templates: Template[];
  contacts: Contact[];
  groups: ContactGroup[];
  onSuccess?: () => void;
}

export const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  activeAccount,
  templates,
  contacts,
  groups,
  onSuccess,
}) => {
  const toast = useToast();

  // Campaign basics
  const [campName, setCampName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Audience Mode: 'group' | 'manual' | 'both'
  const [audienceMode, setAudienceMode] = useState<'group' | 'manual' | 'both'>('group');
  const [selectedGroupId, setSelectedGroupId] = useState('all');

  // Manual Numbers Paste input
  const [manualNumbersText, setManualNumbersText] = useState('');
  const [defaultCountryCode, setDefaultCountryCode] = useState('91');

  // Dynamic variables & media
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [campaignMediaUrl, setCampaignMediaUrl] = useState('');

  // Campaign media PC upload state
  const [campaignMediaSourceMode, setCampaignMediaSourceMode] = useState<'upload' | 'url'>('upload');
  const [uploadedCampaignMedia, setUploadedCampaignMedia] = useState<{
    filename: string;
    originalName: string;
    url: string;
    fullUrl: string;
    size: number;
    contentType: string;
  } | null>(null);
  const [isUploadingCampaignMedia, setIsUploadingCampaignMedia] = useState(false);
  const [uploadCampaignError, setUploadCampaignError] = useState<string | null>(null);
  const campaignFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDraggingCampaign, setIsDraggingCampaign] = useState(false);

  // Test send state
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mobileActiveTab, setMobileActiveTab] = useState<'setup' | 'preview'>('setup');

  // Parse template components
  const approvedTemplates = templates.filter((t) => t.status === 'APPROVED');
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId || t.metaTemplateId === selectedTemplateId);

  const headerComponent = selectedTemplate?.components?.find((c) => c.type === 'HEADER');
  const bodyComponent = selectedTemplate?.components?.find((c) => c.type === 'BODY');
  const footerComponent = selectedTemplate?.components?.find((c) => c.type === 'FOOTER');
  const buttonsComponent = selectedTemplate?.components?.find((c) => c.type === 'BUTTONS');

  const bodyText = bodyComponent?.text || '';
  const bodyMatches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
  const requiredVariables = Array.from(new Set(bodyMatches.map((m) => m.replace(/[\{\}]/g, ''))));

  const hasHeaderMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(headerComponent?.format || '').toUpperCase());

  // Parse manual numbers
  const parsedManualRecipients = useMemo(() => {
    if (!manualNumbersText.trim()) return [];
    const lines = manualNumbersText.split(/[\n,;]+/);
    const valid: Array<{ phone: string; name?: string }> = [];
    const seen = new Set<string>();

    for (let raw of lines) {
      raw = raw.trim();
      if (!raw) continue;

      let name = '';
      let phonePart = raw;

      if (raw.includes(':')) {
        const parts = raw.split(':');
        name = parts[0].trim();
        phonePart = parts[1].trim();
      }

      let digits = phonePart.replace(/[^0-9]/g, '');
      if (digits.length === 10 && defaultCountryCode) {
        digits = `${defaultCountryCode.replace(/[^0-9]/g, '')}${digits}`;
      }

      if (digits.length >= 10 && digits.length <= 15 && !seen.has(digits)) {
        seen.add(digits);
        valid.push({
          phone: `+${digits}`,
          name: name || undefined,
        });
      }
    }
    return valid;
  }, [manualNumbersText, defaultCountryCode]);

  // Group contacts recipients
  const groupRecipients = useMemo(() => {
    if (audienceMode === 'manual') return [];
    return contacts.filter((c) => {
      if (c.optInStatus !== 'opted_in') return false;
      if (selectedGroupId === 'all') return true;
      return c.groups && c.groups.includes(selectedGroupId);
    });
  }, [contacts, selectedGroupId, audienceMode]);

  // Combined Unique Target Recipients
  const totalTargetRecipients = useMemo(() => {
    const list: Array<{ phone: string; name?: string }> = [];
    const seen = new Set<string>();

    if (audienceMode === 'group' || audienceMode === 'both') {
      groupRecipients.forEach((c) => {
        const clean = c.phone.replace(/[^0-9]/g, '');
        if (!seen.has(clean)) {
          seen.add(clean);
          list.push({ phone: c.phone, name: c.name });
        }
      });
    }

    if (audienceMode === 'manual' || audienceMode === 'both') {
      parsedManualRecipients.forEach((m) => {
        const clean = m.phone.replace(/[^0-9]/g, '');
        if (!seen.has(clean)) {
          seen.add(clean);
          list.push(m);
        }
      });
    }

    return list;
  }, [audienceMode, groupRecipients, parsedManualRecipients]);

  // Dynamic preview text with user variable replacements
  const previewBodyText = useMemo(() => {
    if (!bodyText) return 'Select an approved template from the left to view real-time WhatsApp message preview.';
    let preview = bodyText;
    requiredVariables.forEach((v) => {
      const val = templateVariables[v] || (v === '1' ? 'John Doe' : `[Value {{${v}}}]`);
      preview = preview.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), val);
    });
    return preview;
  }, [bodyText, requiredVariables, templateVariables]);

  if (!isOpen) return null;

  const handleCampaignFileSelected = async (file: File) => {
    if (!file) return;
    const format = String(headerComponent?.format || '').toUpperCase();
    if (format === 'IMAGE' && !file.type.startsWith('image/')) {
      setUploadCampaignError('Please select a valid image file (JPG, PNG, WEBP).');
      return;
    }
    if (format === 'VIDEO' && !file.type.startsWith('video/')) {
      setUploadCampaignError('Please select a valid video file (MP4, 3GP).');
      return;
    }
    if (format === 'DOCUMENT' && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadCampaignError('Please select a valid PDF document.');
      return;
    }

    setUploadCampaignError(null);
    setIsUploadingCampaignMedia(true);
    try {
      const res = await uploadMediaFile(file, activeAccount?.customToken);
      setUploadedCampaignMedia(res);
      setCampaignMediaUrl(res.url);
    } catch (err: any) {
      setUploadCampaignError(err.message || 'Failed to upload media from PC.');
    } finally {
      setIsUploadingCampaignMedia(false);
    }
  };

  // Send Test Message
  const handleSendTestMessage = async () => {
    if (!activeAccount || !selectedTemplate || !testPhone.trim()) {
      const msg = 'Please specify a test phone number with country code and select an approved template.';
      setTestStatus(msg);
      toast.showWarning('Missing Details', msg);
      return;
    }

    setTestSending(true);
    setTestStatus('Sending test message via Meta Cloud API...');

    try {
      const variablePayload: Record<string, string> = {};
      requiredVariables.forEach((k) => {
        variablePayload[`body_${k}`] = templateVariables[k] || `Customer`;
      });
      if (campaignMediaUrl.trim()) {
        variablePayload.header_media_url = campaignMediaUrl.trim();
      }

      const res = await fetch('/api/meta/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeAccount.customToken ? { 'x-meta-token': activeAccount.customToken } : {}),
        },
        body: JSON.stringify({
          phoneNumberId: activeAccount.phoneNumberId,
          recipientPhone: testPhone.trim(),
          type: 'template',
          customToken: activeAccount.customToken,
          variableValues: variablePayload,
          template: {
            name: selectedTemplate.name,
            language: selectedTemplate.language || 'en_US',
            components: selectedTemplate.components || [],
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send test message.');
      }

      const successMsg = `Test template sent successfully to ${testPhone}!`;
      setTestStatus(successMsg);
      toast.showSuccess('Test Message Sent', successMsg);
    } catch (err: any) {
      const errMsg = err?.message || 'Error sending test message';
      setTestStatus(errMsg);
      toast.showError('Test Send Failed', errMsg);
    } finally {
      setTestSending(false);
    }
  };

  // Launch Campaign
  const handleLaunchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !activeAccount || !selectedTemplate) {
      const msg = 'Active WhatsApp account and approved template are required.';
      setErrorMsg(msg);
      toast.showWarning('Prerequisites Missing', msg);
      return;
    }

    if (totalTargetRecipients.length === 0) {
      const msg = 'No recipients selected. Please choose a group with opted-in contacts or paste manual phone numbers.';
      setErrorMsg(msg);
      toast.showWarning('No Recipients', msg);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Create campaign document
      const campaignPayload = {
        name: campName.trim() || `${selectedTemplate.name} Broadcast`,
        whatsAppAccountId: activeAccount.id,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        ...(audienceMode !== 'manual' && selectedGroupId !== 'all' ? { groupId: selectedGroupId } : {}),
        recipientCount: totalTargetRecipients.length,
      };

      const campaignId = await createCampaign(organizationId, campaignPayload);
      if (!campaignId) throw new Error('Failed to create campaign record in database.');

      // 2. Prepare variables
      const campaignVariables: Record<string, string> = {};
      requiredVariables.forEach((k) => {
        campaignVariables[`body_${k}`] = templateVariables[k] || `Customer`;
      });
      if (campaignMediaUrl.trim()) {
        campaignVariables.header_media_url = campaignMediaUrl.trim();
      }

      // 3. Dispatch via backend Meta API
      await launchCampaign(
        organizationId,
        campaignId,
        activeAccount.phoneNumberId,
        {
          name: selectedTemplate.name,
          language: selectedTemplate.language || 'en_US',
          components: selectedTemplate.components,
        },
        totalTargetRecipients.map((c) => ({
          phone: c.phone,
          name: c.name,
          variableValues: {
            ...campaignVariables,
            body_1: c.name || campaignVariables.body_1 || 'Customer',
          },
        })),
        activeAccount.customToken,
        campaignVariables,
        campaignPayload.name
      );

      toast.showSuccess(
        'Broadcast Campaign Launched!',
        `Dispatched "${campaignPayload.name}" to ${totalTargetRecipients.length} recipients successfully.`
      );

      onSuccess?.();
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Campaign dispatch failed.';
      setErrorMsg(msg);
      toast.showError('Campaign Launch Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border-t sm:border border-neutral-200 dark:border-neutral-800 rounded-t-3xl sm:rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col h-[95vh] sm:h-[94vh] sm:max-h-[880px]">
        {/* Mobile Pull Bar Affordance */}
        <div className="sm:hidden w-12 h-1 bg-neutral-300 dark:bg-neutral-700 rounded-full mx-auto my-2 shrink-0" />

        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/70 dark:bg-neutral-800/40 shrink-0">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs shrink-0">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-neutral-900 dark:text-white text-sm sm:text-base">
                  Create Broadcast Campaign
                </h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  Live Preview & Direct Paste
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[240px] sm:max-w-none">
                Official Meta Cloud API • Live Message & Button Preview • Number Paste & Groups
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Segmented Control Switcher (Setup vs Preview) */}
        <div className="lg:hidden px-3 sm:px-4 py-2 bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <div className="grid grid-cols-2 p-1 bg-neutral-200/80 dark:bg-neutral-900 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => setMobileActiveTab('setup')}
              className={`min-h-[44px] flex items-center justify-center space-x-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mobileActiveTab === 'setup'
                  ? 'bg-white dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>1. Setup & Audience</span>
              {totalTargetRecipients.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono">
                  {totalTargetRecipients.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileActiveTab('preview')}
              className={`min-h-[44px] flex items-center justify-center space-x-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mobileActiveTab === 'preview'
                  ? 'bg-white dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>2. WhatsApp Preview</span>
              {selectedTemplate && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-700 dark:text-red-300 flex items-center space-x-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Body - Responsive: Mobile Tabs / Desktop 2 Columns Side-by-Side */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-neutral-200 dark:border-neutral-800 min-h-0 overflow-hidden">
          {/* Left Column: Form & Settings (7 cols on desktop, full-width on mobile setup tab) */}
          <div className={`${mobileActiveTab === 'setup' ? 'block' : 'hidden'} lg:block lg:col-span-7 p-4 sm:p-5 space-y-4 overflow-y-auto`}>
            {/* Step 1: Campaign Name & WhatsApp Number */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  1. Campaign Details
                </label>
                {activeAccount && (
                  <span className="text-[11px] text-neutral-500 flex items-center space-x-1">
                    <span>From:</span>
                    <strong className="text-neutral-800 dark:text-neutral-200 font-mono">
                      {activeAccount.displayPhoneNumber}
                    </strong>
                  </span>
                )}
              </div>

              <input
                type="text"
                placeholder="e.g. Diwali Mega Sale Offer / Urgent Payment Reminder"
                value={campName}
                onChange={(e) => setCampName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm sm:text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>

            {/* Step 2: Meta Approved Template Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  <span>2. Select Meta Approved Template</span>
                  <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-neutral-500">
                  {approvedTemplates.length} approved templates ready
                </span>
              </div>

              {approvedTemplates.length === 0 ? (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">No APPROVED WhatsApp Templates Found</p>
                  <p className="text-[11px]">
                    Go to the <strong>Templates</strong> section to create or sync templates approved by Meta before launching a broadcast.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    setSelectedTemplateId(e.target.value);
                    setTemplateVariables({});
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="">-- Choose Approved Template --</option>
                  {approvedTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} • {t.category} ({t.language})
                    </option>
                  ))}
                </select>
              )}

              {/* Header Media: Direct PC / Device Upload or URL */}
              {hasHeaderMedia && (
                <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-3 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1.5">
                      {headerComponent?.format === 'VIDEO' ? (
                        <Video className="w-3.5 h-3.5 text-emerald-500" />
                      ) : headerComponent?.format === 'DOCUMENT' ? (
                        <FileText className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                      <span>
                        Broadcast Header Media ({headerComponent?.format}) <span className="text-red-500">*</span>
                      </span>
                    </label>

                    <div className="inline-flex items-center space-x-1 p-0.5 bg-neutral-200/80 dark:bg-neutral-900 rounded-xl text-xs font-semibold self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setCampaignMediaSourceMode('upload')}
                        className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1 cursor-pointer ${
                          campaignMediaSourceMode === 'upload'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        <HardDrive className="w-3 h-3" />
                        <span>💻 Upload from PC</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCampaignMediaSourceMode('url')}
                        className={`px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1 cursor-pointer ${
                          campaignMediaSourceMode === 'url'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        <LinkIcon className="w-3 h-3" />
                        <span>🔗 URL</span>
                      </button>
                    </div>
                  </div>

                  {/* Mode A: Upload from PC / Device */}
                  {campaignMediaSourceMode === 'upload' && (
                    <div className="space-y-2">
                      <input
                        ref={campaignFileInputRef}
                        type="file"
                        className="hidden"
                        accept={
                          headerComponent?.format === 'IMAGE'
                            ? 'image/jpeg,image/png,image/webp'
                            : headerComponent?.format === 'VIDEO'
                            ? 'video/mp4,video/3gpp'
                            : 'application/pdf,.pdf'
                        }
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCampaignFileSelected(file);
                        }}
                      />

                      {uploadedCampaignMedia ? (
                        <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between gap-3">
                          <div className="flex items-center space-x-3 overflow-hidden">
                            {headerComponent?.format === 'IMAGE' && (
                              <img
                                src={uploadedCampaignMedia.url}
                                alt="Banner"
                                className="w-12 h-12 rounded-lg object-cover border border-emerald-300 dark:border-emerald-700 shrink-0"
                              />
                            )}
                            {headerComponent?.format === 'VIDEO' && (
                              <div className="w-12 h-12 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0">
                                <Video className="w-6 h-6 text-emerald-400" />
                              </div>
                            )}
                            {headerComponent?.format === 'DOCUMENT' && (
                              <div className="w-12 h-12 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-500 flex items-center justify-center shrink-0 border border-red-200 dark:border-red-800">
                                <FileText className="w-6 h-6" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                                {uploadedCampaignMedia.originalName}
                              </p>
                              <div className="flex items-center space-x-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                                <span>{(uploadedCampaignMedia.size / 1024).toFixed(1)} KB</span>
                                <span>&bull;</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-0.5">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Ready to Broadcast</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => campaignFileInputRef.current?.click()}
                              className="px-2 py-1 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-white dark:bg-neutral-800 hover:bg-neutral-100 border border-neutral-200 dark:border-neutral-700 cursor-pointer"
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setUploadedCampaignMedia(null);
                                setCampaignMediaUrl('');
                              }}
                              className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDraggingCampaign(true);
                          }}
                          onDragLeave={() => setIsDraggingCampaign(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDraggingCampaign(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) handleCampaignFileSelected(file);
                          }}
                          onClick={() => campaignFileInputRef.current?.click()}
                          className={`p-5 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center space-y-1.5 text-center ${
                            isDraggingCampaign
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                              : 'border-neutral-300 dark:border-neutral-700 hover:border-emerald-500 hover:bg-white dark:hover:bg-neutral-800'
                          }`}
                        >
                          {isUploadingCampaignMedia ? (
                            <div className="flex flex-col items-center space-y-2 text-emerald-600">
                              <Loader2 className="w-6 h-6 animate-spin" />
                              <span className="text-xs font-bold">Uploading from your device...</span>
                            </div>
                          ) : (
                            <>
                              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                <UploadCloud className="w-5 h-5" />
                              </div>
                              <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                                Click or drag &amp; drop {headerComponent?.format?.toLowerCase() || 'file'} from your PC
                              </p>
                              <p className="text-[10px] text-neutral-500">
                                {headerComponent?.format === 'IMAGE' && 'JPG, PNG, WEBP (Max 5MB)'}
                                {headerComponent?.format === 'VIDEO' && 'MP4, 3GP (Max 16MB)'}
                                {headerComponent?.format === 'DOCUMENT' && 'PDF Documents (Max 25MB)'}
                              </p>
                            </>
                          )}
                        </div>
                      )}

                      {uploadCampaignError && (
                        <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{uploadCampaignError}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode B: Media URL Link */}
                  {campaignMediaSourceMode === 'url' && (
                    <div className="space-y-1">
                      <input
                        type="url"
                        placeholder="https://example.com/banner.jpg or https://example.com/video.mp4"
                        value={campaignMediaUrl}
                        onChange={(e) => setCampaignMediaUrl(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                      <p className="text-[10px] text-neutral-500">
                        Direct public URL to the media file for this broadcast header.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Variables Inputs */}
              {requiredVariables.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                    <span className="flex items-center space-x-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Template Variable Inputs</span>
                    </span>
                    <span className="text-[11px] font-normal text-neutral-500">
                      <code>{`{{1}}`}</code> is auto-personalized to contact name
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {requiredVariables.map((v) => (
                      <div key={v} className="space-y-1">
                        <label className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                          <span>Variable {`{{${v}}}`}</span>
                          <span className="text-[10px] text-neutral-400">
                            {v === '1' ? 'Fallback Name' : `Custom ${v}`}
                          </span>
                        </label>
                        <input
                          type="text"
                          placeholder={
                            v === '1'
                              ? 'e.g. Customer Name'
                              : v === '2'
                              ? 'e.g. Flat 30% OFF'
                              : v === '3'
                              ? 'e.g. ORD-10924'
                              : `Value for {{${v}}}`
                          }
                          value={templateVariables[v] || ''}
                          onChange={(e) =>
                            setTemplateVariables({ ...templateVariables, [v]: e.target.value })
                          }
                          className="w-full px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Audience Selection (Groups / Manual Paste / Both) */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center space-x-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  <span>3. Audience & Recipients Target</span>
                  <span className="text-red-500">*</span>
                </label>

                <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-2xl text-xs w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setAudienceMode('group')}
                    className={`min-h-[42px] sm:min-h-[36px] px-3 py-1.5 rounded-xl font-bold text-center transition-all cursor-pointer ${
                      audienceMode === 'group'
                        ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    Groups
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudienceMode('manual')}
                    className={`min-h-[42px] sm:min-h-[36px] px-3 py-1.5 rounded-xl font-bold text-center transition-all cursor-pointer ${
                      audienceMode === 'manual'
                        ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudienceMode('both')}
                    className={`min-h-[42px] sm:min-h-[36px] px-3 py-1.5 rounded-xl font-bold text-center transition-all cursor-pointer ${
                      audienceMode === 'both'
                        ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    Both
                  </button>
                </div>
              </div>

              {/* Group Selector */}
              {(audienceMode === 'group' || audienceMode === 'both') && (
                <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 space-y-2">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Select Contact Group (Opted-in Contacts)
                  </label>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm sm:text-xs text-neutral-900 dark:text-white cursor-pointer focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="all">
                      All Opted-in Contacts ({contacts.filter((c) => c.optInStatus === 'opted_in').length})
                    </option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-neutral-500">
                    Group matched: <strong>{groupRecipients.length}</strong> opted-in WhatsApp contacts.
                  </p>
                </div>
              )}

              {/* Manual Numbers Paste Area */}
              {(audienceMode === 'manual' || audienceMode === 'both') && (
                <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center space-x-1.5">
                      <ClipboardPaste className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Paste Mobile Numbers (Excel / Comma / Line-by-Line)</span>
                    </label>
                    <div className="flex items-center space-x-1 text-[11px]">
                      <span className="text-neutral-400">Default Code:</span>
                      <input
                        type="text"
                        value={defaultCountryCode}
                        onChange={(e) => setDefaultCountryCode(e.target.value)}
                        placeholder="91"
                        className="w-10 px-1 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-center font-mono text-[10px]"
                      />
                    </div>
                  </div>

                  <textarea
                    rows={4}
                    value={manualNumbersText}
                    onChange={(e) => setManualNumbersText(e.target.value)}
                    placeholder="Enter or paste numbers:
9974428034
+91 9876543210
Rahul: 919974428034
+1 415 555 2671, Aniket: 9974428034"
                    className="w-full min-h-[110px] p-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm sm:text-xs font-mono text-neutral-900 dark:text-white placeholder-neutral-400 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-neutral-500">
                      Valid numbers detected: <strong>{parsedManualRecipients.length}</strong>
                    </span>
                    {parsedManualRecipients.length > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Duplicates filtered automatically
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Total Audience Summary Badge */}
              <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-between text-xs">
                <span className="text-neutral-600 dark:text-neutral-300 font-medium">
                  Total Broadcast Audience Target:
                </span>
                <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                  {totalTargetRecipients.length} unique recipients
                </span>
              </div>
            </div>

            {/* Step 4: Quick Single Test Send */}
            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Test Broadcast (Send to Yourself First)</span>
              </span>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="+91 9974428034"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm sm:text-xs text-neutral-900 dark:text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSendTestMessage}
                  disabled={testSending || !selectedTemplate || !testPhone.trim()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white font-bold text-xs flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {testSending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Test</span>
                    </>
                  )}
                </button>
              </div>

              {testStatus && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {testStatus}
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Live WhatsApp Mobile Preview (5 cols) - Shown side-by-side on desktop, or when active tab is preview on mobile */}
          <div className={`${mobileActiveTab === 'preview' ? 'flex' : 'hidden'} lg:flex lg:col-span-5 p-4 bg-neutral-100/70 dark:bg-neutral-950/50 flex-col items-center justify-start overflow-y-auto space-y-3`}>
            {/* Mobile Header in Preview tab */}
            <div className="lg:hidden w-full flex items-center justify-between pb-1 shrink-0">
              <button
                type="button"
                onClick={() => setMobileActiveTab('setup')}
                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 shadow-2xs cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>← Back to Setup</span>
              </button>
              <span className="text-[11px] font-semibold text-neutral-500">Live Bubble View</span>
            </div>

            <div className="w-full flex items-center justify-between text-xs shrink-0">
              <span className="font-bold uppercase tracking-wider text-neutral-500 flex items-center space-x-1.5 text-[11px]">
                <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                <span>Live WhatsApp Screen</span>
              </span>
              {selectedTemplate && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">
                  {selectedTemplate.language || 'en'} • {selectedTemplate.category}
                </span>
              )}
            </div>

            {/* WhatsApp Phone Mockup - Scaled to fit perfectly into viewport without clipping bottom */}
            <div className="w-full max-w-[310px] rounded-[28px] bg-neutral-900 p-2 shadow-xl border-3 border-neutral-800 relative flex flex-col shrink-0">
              {/* Phone Camera Notch */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-14 h-2.5 bg-neutral-800 rounded-full z-20 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-900" />
              </div>

              {/* Phone Screen Container - Fixed compact height fitting top-right with no crop */}
              <div className="w-full rounded-[20px] overflow-hidden bg-[#E5DDD5] dark:bg-[#0b141a] flex flex-col h-[400px] relative text-neutral-900 dark:text-neutral-100 shadow-inner">
                {/* WhatsApp Chat Header */}
                <div className="bg-[#008069] dark:bg-[#1f2c34] text-white px-3 py-2 pt-4 flex items-center space-x-2 shadow-xs z-10 shrink-0">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                    {activeAccount?.verifiedName?.[0] || 'W'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold truncate leading-tight">
                      {activeAccount?.verifiedName || 'CloudWABA Official'}
                    </p>
                    <p className="text-[9px] text-emerald-100 truncate opacity-90 leading-tight">
                      Official WhatsApp Business
                    </p>
                  </div>
                </div>

                {/* WhatsApp Chat Wallpaper & Message Bubble Area */}
                <div className="flex-1 p-2.5 flex flex-col justify-start overflow-y-auto space-y-2">
                  {selectedTemplate ? (
                    <div className="w-full bg-white dark:bg-[#1f2c34] rounded-2xl rounded-tl-xs p-2.5 shadow-md space-y-1.5 text-xs border border-black/5 dark:border-white/5 animate-fadeIn">
                      {/* Header (Media / Text) */}
                      {headerComponent && (
                        <div className="rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800/80">
                          {headerComponent.format === 'IMAGE' && (
                            campaignMediaUrl ? (
                              <img
                                src={campaignMediaUrl}
                                alt="Header preview"
                                className="w-full h-24 object-cover rounded-xl"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="h-20 flex flex-col items-center justify-center text-neutral-400 space-y-1">
                                <ImageIcon className="w-5 h-5 text-emerald-500" />
                                <span className="text-[9px]">Header Image Banner</span>
                              </div>
                            )
                          )}
                          {headerComponent.format === 'VIDEO' && (
                            <div className="h-20 flex flex-col items-center justify-center text-neutral-400 space-y-1">
                              <Video className="w-5 h-5 text-emerald-500" />
                              <span className="text-[9px]">Video Header</span>
                            </div>
                          )}
                          {headerComponent.format === 'DOCUMENT' && (
                            <div className="p-2 flex items-center space-x-2 text-neutral-600 dark:text-neutral-300">
                              <FileCheck className="w-4 h-4 text-red-500" />
                              <span className="text-[10px] font-medium">Document / PDF File</span>
                            </div>
                          )}
                          {headerComponent.format === 'TEXT' && (
                            <p className="font-bold text-[11px] p-1 text-neutral-900 dark:text-white">
                              {headerComponent.text}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Body Message */}
                      <p className="text-[11px] leading-relaxed whitespace-pre-wrap text-neutral-800 dark:text-neutral-200">
                        {previewBodyText}
                      </p>

                      {/* Footer */}
                      {footerComponent?.text && (
                        <p className="text-[9px] text-neutral-400 border-t border-neutral-100 dark:border-neutral-800 pt-1">
                          {footerComponent.text}
                        </p>
                      )}

                      {/* Time & Tick */}
                      <div className="flex items-center justify-end space-x-1 text-[8px] text-neutral-400 pt-0.5">
                        <span>10:45 AM</span>
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                      </div>

                      {/* Template Interactive Buttons */}
                      {buttonsComponent?.buttons && buttonsComponent.buttons.length > 0 && (
                        <div className="border-t border-neutral-100 dark:border-neutral-800/80 pt-1.5 space-y-1">
                          {buttonsComponent.buttons.map((btn: any, idx: number) => (
                            <div
                              key={idx}
                              className="py-1 px-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800 text-[#00a884] dark:text-[#00a884] font-medium text-[10px] text-center flex items-center justify-center space-x-1.5 shadow-2xs border border-neutral-200/50 dark:border-neutral-700/50"
                            >
                              {btn.type === 'PHONE_NUMBER' ? (
                                <PhoneCall className="w-2.5 h-2.5" />
                              ) : btn.type === 'URL' ? (
                                <ExternalLink className="w-2.5 h-2.5" />
                              ) : (
                                <ChevronRight className="w-2.5 h-2.5" />
                              )}
                              <span>{btn.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center p-5 bg-white/70 dark:bg-neutral-900/70 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 space-y-2 my-auto">
                      <HelpCircle className="w-7 h-7 text-neutral-400 mx-auto" />
                      <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        No Template Selected
                      </p>
                      <p className="text-[10px] text-neutral-500">
                        Select an approved template from step 2 to preview message & buttons.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-neutral-400 text-center shrink-0">
              Live WhatsApp recipient screen • Header, text & buttons
            </p>
          </div>
        </div>

        {/* Footer Actions - Responsive: Mobile Sticky Touch-Friendly Bar */}
        <div className="p-3.5 sm:px-6 sm:py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/90 dark:bg-neutral-800/90 backdrop-blur-md flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center justify-between sm:justify-start text-xs text-neutral-600 dark:text-neutral-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center space-x-1.5 font-medium">
                <Info className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Target:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                  {totalTargetRecipients.length} recipients
                </strong>
              </span>

              {activeAccount && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-neutral-200/80 dark:bg-neutral-700/70 text-neutral-700 dark:text-neutral-300">
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span>24h Limit: {activeAccount.messagingLimitLabel || '250 / 24h'}</span>
                </span>
              )}
            </div>

            {/* Quick Preview jump link on mobile */}
            {mobileActiveTab === 'setup' && (
              <button
                type="button"
                onClick={() => setMobileActiveTab('preview')}
                className="lg:hidden text-xs text-emerald-600 dark:text-emerald-400 font-bold underline flex items-center space-x-0.5 cursor-pointer"
              >
                <span>Preview</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] sm:min-h-[38px] px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-center"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleLaunchCampaign}
              disabled={submitting || !selectedTemplate || totalTargetRecipients.length === 0}
              className="min-h-[44px] sm:min-h-[38px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center space-x-2 disabled:opacity-50 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Launching...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Launch ({totalTargetRecipients.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
