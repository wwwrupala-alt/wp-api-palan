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
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeTemplates,
  syncTemplatesFromMeta,
  createTemplate,
  deleteTemplate,
} from '../lib/services.ts';
import { TemplateBuilderModal } from '../components/TemplateBuilderModal.tsx';
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
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

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

  const handleCreateSubmit = async (templateData: {
    name: string;
    category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
    language: string;
    components: TemplateComponent[];
  }) => {
    if (!organization?.id || !activeAccount) {
      setCreateError('Please connect a WhatsApp Business Account first.');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      await createTemplate(
        organization.id,
        activeAccount.wabaId,
        activeAccount.id,
        templateData,
        activeAccount.customToken
      );

      toast.showSuccess(
        'Template Submitted to Meta',
        `Template "${templateData.name}" sent for review. Meta usually approves within minutes.`
      );

      setIsCreateOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error submitting template to Meta.';
      setCreateError(msg);
      toast.showError('Template Submission Failed', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTemplate = async (template: Template) => {
    if (!organization?.id || !activeAccount) {
      toast.showWarning('No Account', 'Please connect a WhatsApp Business Account.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete template "${template.name}"? This will delete it permanently from Meta and your account.`
    );
    if (!confirmed) return;

    setDeletingTemplateId(template.id);
    try {
      await deleteTemplate(
        organization.id,
        template.id,
        template.name,
        activeAccount.wabaId,
        activeAccount.customToken
      );
      toast.showSuccess(
        'Template Deleted',
        `Template "${template.name}" has been deleted successfully.`
      );
    } catch (err) {
      toast.showError('Failed to Delete Template', err);
    } finally {
      setDeletingTemplateId(null);
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

                <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px] text-neutral-400 truncate max-w-[120px]">
                      {t.metaTemplateId || t.id.slice(0, 14)}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDeleteTemplate(t)}
                    disabled={deletingTemplateId === t.id}
                    title="Delete template from Meta"
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  >
                    {deletingTemplateId === t.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span className="text-[10.5px] font-medium text-neutral-500 hover:text-rose-600">Delete</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Advanced Create Template Modal with Live Smartphone Preview */}
      <TemplateBuilderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateSubmit}
        creating={creating}
        createError={createError}
      />
    </div>
  );
};
