import React, { useEffect, useState } from 'react';
import {
  FileText,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  PauseCircle,
  AlertCircle,
  ExternalLink,
  X,
  MessageSquare,
  Smartphone,
  Eye,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeTemplates,
  syncTemplatesFromMeta,
  createTemplate,
} from '../lib/services.ts';
import type { Template, TemplateComponent } from '../types/index.ts';

export const TemplatesPage: React.FC = () => {
  const { organization } = useAuth();
  const { activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('ALL');

  // Create Template Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form Fields
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('UTILITY');
  const [tplLang, setTplLang] = useState('en_US');
  const [headerType, setHeaderType] = useState<'NONE' | 'TEXT' | 'IMAGE'>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [bodyText, setBodyText] = useState('Hello {{1}}, your order {{2}} has been confirmed!');
  const [footerText, setFooterText] = useState('Reply STOP to unsubscribe');
  const [buttonType, setButtonType] = useState<'NONE' | 'QUICK_REPLY' | 'URL'>('QUICK_REPLY');
  const [buttonText, setButtonText] = useState('View Details');
  const [buttonUrl, setButtonUrl] = useState('https://example.com/order/{{1}}');

  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeTemplates(
      organization.id,
      (data) => {
        setTemplates(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [organization?.id]);

  const handleSyncFromMeta = async () => {
    if (!organization?.id || !activeAccount) {
      toast.showWarning('No Account', 'Please connect a WhatsApp Business Account first.');
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      const count = await syncTemplatesFromMeta(
        organization.id,
        activeAccount.wabaId,
        activeAccount.id,
        activeAccount.customToken
      );
      const msg = `Successfully synced ${count} template(s) from Meta WhatsApp Platform.`;
      setSyncMsg(msg);
      toast.showSuccess('Templates Synced', msg);
      setTimeout(() => setSyncMsg(null), 3000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to sync templates from Meta.';
      setSyncMsg(errMsg);
      toast.showError('Template Sync Failed', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !activeAccount) {
      setCreateError('Please connect a WhatsApp Business Account first.');
      return;
    }

    setCreating(true);
    setCreateError(null);

    const components: TemplateComponent[] = [];

    // Header
    if (headerType === 'TEXT' && headerText.trim()) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: headerText.trim(),
      });
    } else if (headerType === 'IMAGE') {
      components.push({
        type: 'HEADER',
        format: 'IMAGE',
      });
    }

    // Body
    components.push({
      type: 'BODY',
      text: bodyText.trim(),
    });

    // Footer
    if (footerText.trim()) {
      components.push({
        type: 'FOOTER',
        text: footerText.trim(),
      });
    }

    // Buttons
    if (buttonType === 'QUICK_REPLY' && buttonText.trim()) {
      components.push({
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: buttonText.trim() }],
      });
    } else if (buttonType === 'URL' && buttonText.trim() && buttonUrl.trim()) {
      components.push({
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: buttonText.trim(), url: buttonUrl.trim() }],
      });
    }

    try {
      await createTemplate(
        organization.id,
        activeAccount.wabaId,
        activeAccount.id,
        {
          name: tplName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          language: tplLang,
          category: tplCategory,
          components,
        },
        activeAccount.customToken
      );

      toast.showSuccess(
        'Template Submitted to Meta',
        `Template "${tplName}" sent for review. Meta usually approves within minutes.`
      );

      setIsCreateOpen(false);
      setTplName('');
      setHeaderText('');
      setBodyText('Hello {{1}}, your order {{2}} has been confirmed!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error submitting template to Meta.';
      setCreateError(msg);
      toast.showError('Template Submission Failed', err);
    } finally {
      setCreating(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (selectedTab === 'ALL') return true;
    return t.status === selectedTab;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            <span>Approved</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
            <Clock className="w-3 h-3" />
            <span>Pending</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400">
            <XCircle className="w-3 h-3" />
            <span>Rejected</span>
          </span>
        );
      case 'PAUSED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            <PauseCircle className="w-3 h-3" />
            <span>Paused</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Message Templates
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Official Meta WhatsApp interactive and broadcast templates.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSyncFromMeta}
            disabled={syncing || !activeAccount}
            className="px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sync from Meta</span>
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            disabled={!activeAccount}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Template</span>
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="p-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-800 dark:text-neutral-200 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 space-x-6 text-xs font-medium">
        {['ALL', 'APPROVED', 'PENDING', 'REJECTED', 'PAUSED'].map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`pb-3 border-b-2 capitalize transition-colors ${
              selectedTab === tab
                ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
          >
            {tab.toLowerCase()} ({templates.filter((t) => (tab === 'ALL' ? true : t.status === tab)).length})
          </button>
        ))}
      </div>

      {/* Template Cards Grid */}
      {templates.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
            <FileText className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              No templates synced yet.
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Click &quot;Sync from Meta&quot; to fetch your registered WhatsApp templates or create a new template directly through the Meta Cloud API.
            </p>
          </div>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              onClick={handleSyncFromMeta}
              disabled={!activeAccount}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium"
            >
              Sync from Meta
            </button>
            <button
              onClick={() => setIsCreateOpen(true)}
              disabled={!activeAccount}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 disabled:opacity-50 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              Create Template
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((t) => {
            const bodyComp = t.components?.find((c) => c.type === 'BODY');
            const headerComp = t.components?.find((c) => c.type === 'HEADER');
            const footerComp = t.components?.find((c) => c.type === 'FOOTER');
            const buttonsComp = t.components?.find((c) => c.type === 'BUTTONS');

            return (
              <div
                key={t.id}
                className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-neutral-900 dark:text-white text-sm font-mono truncate max-w-[200px]">
                        {t.name}
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        {t.category} &bull; {t.language}
                      </p>
                    </div>
                    {getStatusBadge(t.status)}
                  </div>

                  {/* WhatsApp Preview Bubble */}
                  <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-neutral-800/80 border border-emerald-100 dark:border-neutral-700/60 text-xs space-y-2">
                    {headerComp && (
                      <p className="font-semibold text-neutral-900 dark:text-white text-xs border-b border-emerald-200/50 dark:border-neutral-700/50 pb-1">
                        {headerComp.text || `[${headerComp.format || 'MEDIA'} HEADER]`}
                      </p>
                    )}
                    <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap leading-relaxed text-[11px]">
                      {bodyComp?.text || '(Empty Body)'}
                    </p>
                    {footerComp?.text && (
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 italic">
                        {footerComp.text}
                      </p>
                    )}

                    {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
                      <div className="pt-2 border-t border-emerald-200/40 dark:border-neutral-700/40 space-y-1">
                        {buttonsComp.buttons.map((b, i) => (
                          <div
                            key={i}
                            className="text-center py-1 rounded bg-white dark:bg-neutral-700/60 text-emerald-600 dark:text-emerald-400 font-medium text-[10px] shadow-2xs border border-emerald-200/40 dark:border-neutral-600/40"
                          >
                            {b.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                  <span>ID: {t.metaTemplateId || t.id.slice(0, 14)}</span>
                  <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Template Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-base">
                Create &amp; Submit Meta Template
              </h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Template Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="order_confirmation_v1"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">Lowercase letters, numbers, and underscores only</p>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="UTILITY">Utility</option>
                    <option value="MARKETING">Marketing</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Language</label>
                  <select
                    value={tplLang}
                    onChange={(e) => setTplLang(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="en_US">English (US)</option>
                    <option value="en_GB">English (UK)</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="hi">Hindi</option>
                    <option value="pt_BR">Portuguese (BR)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Header Type</label>
                  <select
                    value={headerType}
                    onChange={(e) => setHeaderType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="NONE">None</option>
                    <option value="TEXT">Text</option>
                    <option value="IMAGE">Image Media</option>
                  </select>
                </div>
              </div>

              {headerType === 'TEXT' && (
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Header Text</label>
                  <input
                    type="text"
                    placeholder="e.g. Order Update"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Message Body Text <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Enter message text with variables like {{1}}, {{2}}..."
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white leading-relaxed"
                />
                <p className="text-[10px] text-neutral-400 mt-1">Use double braces for parameters: {'{{1}}'}, {'{{2}}'}</p>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Footer (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Reply STOP to unsubscribe"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Interactive Button</label>
                  <select
                    value={buttonType}
                    onChange={(e) => setButtonType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="NONE">None</option>
                    <option value="QUICK_REPLY">Quick Reply Button</option>
                    <option value="URL">Website URL Button</option>
                  </select>
                </div>

                {buttonType !== 'NONE' && (
                  <div>
                    <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Button Label</label>
                    <input
                      type="text"
                      placeholder="e.g. View Order"
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              {buttonType === 'URL' && (
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">URL Address</label>
                  <input
                    type="url"
                    placeholder="https://acme.com/orders/{{1}}"
                    value={buttonUrl}
                    onChange={(e) => setButtonUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting to Meta...</span>
                    </>
                  ) : (
                    <span>Submit Template</span>
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
