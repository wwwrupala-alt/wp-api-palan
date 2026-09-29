import React, { useEffect, useState } from 'react';
import {
  Send,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Users,
  Eye,
  X,
  Smartphone,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeCampaigns,
  subscribeTemplates,
  subscribeContacts,
  subscribeGroups,
  createCampaign,
  launchCampaign,
} from '../lib/services.ts';
import type { Campaign, Template, Contact, ContactGroup } from '../types/index.ts';

export const CampaignsPage: React.FC = () => {
  const { organization } = useAuth();
  const { accounts, activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // New Campaign Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [campName, setCampName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [testPhone, setTestPhone] = useState('');
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [campaignMediaUrl, setCampaignMediaUrl] = useState('');

  useEffect(() => {
    if (!organization?.id) return;
    const unsubCamp = subscribeCampaigns(
      organization.id,
      (data) => {
        setCampaigns(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubTpl = subscribeTemplates(
      organization.id,
      (data) => setTemplates(data),
      () => {}
    );

    const unsubCnt = subscribeContacts(
      organization.id,
      (data) => setContacts(data),
      () => {}
    );

    const unsubGrp = subscribeGroups(
      organization.id,
      (data) => setGroups(data),
      () => {}
    );

    return () => {
      unsubCamp();
      unsubTpl();
      unsubCnt();
      unsubGrp();
    };
  }, [organization?.id]);

  const approvedTemplates = templates.filter((t) => t.status === 'APPROVED');

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId || t.metaTemplateId === selectedTemplateId);

  // Extract variables needed by template body
  const bodyText = selectedTemplate?.components?.find((c) => c.type === 'BODY')?.text || '';
  const bodyMatches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
  const requiredVariables = Array.from(new Set(bodyMatches.map((m) => m.replace(/[\{\}]/g, ''))));
  const hasHeaderMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(
    String(selectedTemplate?.components?.find((c) => c.type === 'HEADER')?.format || '').toUpperCase()
  );

  // Calculate target recipients (only opted-in contacts)
  const targetRecipients = contacts.filter((c) => {
    if (c.optInStatus !== 'opted_in') return false;
    if (selectedGroupId === 'all') return true;
    return c.groups && c.groups.includes(selectedGroupId);
  });

  const handleSendTestMessage = async () => {
    if (!activeAccount || !selectedTemplate || !testPhone.trim()) {
      const msg = 'Please specify a valid test phone number and select an approved template.';
      setTestStatus(msg);
      toast.showWarning('Missing Details', msg);
      return;
    }
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
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Server returned status ${res.status}. Route might be misconfigured.`);
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send test message.');
      }
      const successMsg = `Test template sent successfully to ${testPhone}`;
      setTestStatus(successMsg);
      toast.showSuccess('Test Message Sent', successMsg);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error sending test message';
      setTestStatus(errMsg);
      toast.showError('Test Send Failed', err);
    }
  };

  const handleLaunchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !activeAccount || !selectedTemplate) {
      const msg = 'Active WhatsApp account and approved template are required.';
      setErrorMsg(msg);
      toast.showWarning('Prerequisites Missing', msg);
      return;
    }

    if (targetRecipients.length === 0) {
      const msg = 'No opted-in contacts found in the selected target group.';
      setErrorMsg(msg);
      toast.showWarning('No Opted-in Recipients', msg);
      return;
    }

    setCreating(true);
    setErrorMsg(null);

    try {
      // 1. Create campaign document
      const campaignPayload = {
        name: campName.trim(),
        whatsAppAccountId: activeAccount.id,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        ...(selectedGroupId !== 'all' && selectedGroupId ? { groupId: selectedGroupId } : {}),
        recipientCount: targetRecipients.length,
      };

      const campaignId = await createCampaign(organization.id, campaignPayload);

      if (!campaignId) throw new Error('Failed to create campaign record');

      // 2. Dispatch via Meta Cloud API
      const campaignVariables: Record<string, string> = {};
      requiredVariables.forEach((k) => {
        campaignVariables[`body_${k}`] = templateVariables[k] || `Customer`;
      });
      if (campaignMediaUrl.trim()) {
        campaignVariables.header_media_url = campaignMediaUrl.trim();
      }

      await launchCampaign(
        organization.id,
        campaignId,
        activeAccount.phoneNumberId,
        {
          name: selectedTemplate.name,
          language: selectedTemplate.language || 'en_US',
          components: selectedTemplate.components,
        },
        targetRecipients.map((c) => ({
          phone: c.phone,
          name: c.name,
          variableValues: {
            ...campaignVariables,
            body_1: c.name || campaignVariables.body_1 || 'Customer',
          },
        })),
        activeAccount.customToken,
        campaignVariables
      );

      toast.showSuccess(
        'Campaign Launched!',
        `Broadcast "${campName}" dispatched to ${targetRecipients.length} recipients.`
      );

      setIsModalOpen(false);
      setCampName('');
      setSelectedTemplateId('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Campaign dispatch failed.';
      setErrorMsg(msg);
      toast.showError('Campaign Dispatch Failed', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Broadcast Campaigns
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Launch official WhatsApp template broadcasts to opted-in audiences.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg(null);
            setTestStatus(null);
            setIsModalOpen(true);
          }}
          disabled={!activeAccount}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Campaign</span>
        </button>
      </div>

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
            <Send className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">No campaigns yet.</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Connect your WhatsApp number and select an approved template to broadcast updates or marketing messages.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={!activeAccount}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Campaign</span>
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-4">Campaign Name</th>
                  <th className="py-3 px-4">Template</th>
                  <th className="py-3 px-4">Recipients</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Delivery Performance</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-neutral-900 dark:text-white">
                      {c.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-neutral-600 dark:text-neutral-300">
                      {c.templateName || c.templateId}
                    </td>
                    <td className="py-3.5 px-4 text-neutral-700 dark:text-neutral-300">
                      {c.recipientCount} contacts
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                          c.status === 'completed'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                            : c.status === 'sending'
                            ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                            : c.status === 'failed'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {c.stats ? (
                        <div className="flex items-center space-x-3 text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Sent: {c.stats.sent}
                          </span>
                          <span className="text-neutral-400">&bull;</span>
                          <span className="text-neutral-500">
                            Delivered: {c.stats.delivered}
                          </span>
                          {c.stats.failed > 0 && (
                            <>
                              <span className="text-neutral-400">&bull;</span>
                              <span className="text-rose-500 font-medium">Failed: {c.stats.failed}</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400">&mdash;</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-neutral-500 text-[11px]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-base">
                Create Broadcast Campaign
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleLaunchCampaign} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. September Product Launch"
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Approved Meta WhatsApp Template <span className="text-red-500">*</span>
                </label>
                {approvedTemplates.length === 0 ? (
                  <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs">
                    No APPROVED templates found. Sync from Meta or wait for Meta approval before broadcasting.
                  </p>
                ) : (
                  <select
                    required
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="">-- Choose Approved Template --</option>
                    {approvedTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.category} - {t.language})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Audience Group (Only Opted-in Contacts)
                </label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                >
                  <option value="all">All Opted-in Contacts ({contacts.filter((c) => c.optInStatus === 'opted_in').length})</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Target count: <strong>{targetRecipients.length}</strong> eligible WhatsApp recipients.
                </p>
              </div>

              {/* Template Preview & Dynamic Variables Input */}
              {selectedTemplate && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                      Template Message Format
                    </span>
                    <p className="text-xs text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                      {bodyText || '(No body text)'}
                    </p>
                  </div>

                  {/* Header Media URL if template requires IMAGE/VIDEO/DOCUMENT */}
                  {hasHeaderMedia && (
                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-1">
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        Header Media Direct Link (Image/Video/PDF) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="url"
                        placeholder="https://example.com/promotions/banner.jpg"
                        value={campaignMediaUrl}
                        onChange={(e) => setCampaignMediaUrl(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white font-mono"
                      />
                    </div>
                  )}

                  {/* Template Dynamic Variables Input Fields */}
                  {requiredVariables.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                        <span>Fill Template Variable Values</span>
                        <span className="text-[11px] font-normal text-neutral-500">
                          {`{{1}}`} is auto-personalized to contact name if blank
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {requiredVariables.map((v) => (
                          <div key={v} className="space-y-1">
                            <label className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                              Value for <code className="bg-emerald-100 dark:bg-emerald-900/60 px-1 py-0.5 rounded text-emerald-700 dark:text-emerald-300">{`{{${v}}}`}</code>
                            </label>
                            <input
                              type="text"
                              placeholder={v === '1' ? 'e.g. Customer Name' : v === '2' ? 'e.g. ORD-901' : `Value for {{${v}}}`}
                              value={templateVariables[v] || ''}
                              onChange={(e) => setTemplateVariables({ ...templateVariables, [v]: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Send Test Message */}
              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Send Test Message Before Launch
                </span>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Enter your phone with country code (+1...)"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSendTestMessage}
                    disabled={!selectedTemplate || !testPhone.trim()}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-900 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white font-medium disabled:opacity-50"
                  >
                    Send Test
                  </button>
                </div>
                {testStatus && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{testStatus}</p>}
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !selectedTemplate || targetRecipients.length === 0}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Dispatching via Meta...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Launch Broadcast Now</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
