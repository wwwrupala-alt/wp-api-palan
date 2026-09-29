import React, { useEffect, useState } from 'react';
import {
  Bot,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  UserCheck,
  CheckCircle2,
  X,
  File,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  subscribeAutomations,
  addAutomation,
  toggleAutomation,
  deleteAutomation,
} from '../lib/services.ts';
import type { Automation } from '../types/index.ts';

export const AutomationsPage: React.FC = () => {
  const { organization } = useAuth();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);

  // New Rule Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [triggerType, setTriggerType] = useState<'keyword_exact' | 'keyword_contains' | 'welcome' | 'fallback'>('keyword_exact');
  const [keyword, setKeyword] = useState('');
  const [responseType, setResponseType] = useState<'text' | 'image' | 'document' | 'assign_agent'>('text');
  const [responseContent, setResponseContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaName, setMediaName] = useState('');

  useEffect(() => {
    if (!organization?.id) return;
    const unsub = subscribeAutomations(
      organization.id,
      (data) => {
        setAutomations(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [organization?.id]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    await addAutomation(organization.id, {
      trigger: triggerType === 'keyword_exact' ? `Exact match: ${keyword}` : triggerType,
      triggerType,
      keyword: keyword.trim().toUpperCase(),
      responseType,
      responseContent: responseContent.trim(),
      mediaUrl: mediaUrl.trim() || undefined,
      mediaName: mediaName.trim() || undefined,
      enabled: true,
    });

    setIsModalOpen(false);
    setKeyword('');
    setResponseContent('');
    setMediaUrl('');
    setMediaName('');
  };

  const handleToggle = async (auto: Automation) => {
    if (!organization?.id) return;
    await toggleAutomation(organization.id, auto.id, !auto.enabled);
  };

  const handleDelete = async (autoId: string) => {
    if (!organization?.id) return;
    if (window.confirm('Delete this automation rule?')) {
      await deleteAutomation(organization.id, autoId);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Bot Automations &amp; Keyword Rules
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Configure instant WhatsApp bot keyword triggers, auto-responses, and PDF catalog deliverers.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Automation Rule</span>
        </button>
      </div>

      {/* Automations List */}
      {automations.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
            <Bot className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              No automations created yet.
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Create your first keyword trigger (e.g. &quot;CATALOG&quot; or &quot;SUPPORT&quot;) to automate customer inquiries 24/7.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Automation Rule</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {automations.map((auto) => (
            <div
              key={auto.id}
              className={`p-5 rounded-2xl bg-white dark:bg-neutral-900 border transition-all shadow-xs flex flex-col justify-between space-y-4 ${
                auto.enabled
                  ? 'border-neutral-200 dark:border-neutral-800'
                  : 'border-neutral-200/50 dark:border-neutral-800/50 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-0.5 rounded-md font-mono text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                    {auto.keyword ? `Keyword: ${auto.keyword}` : auto.triggerType}
                  </span>
                  <button
                    onClick={() => handleToggle(auto)}
                    title={auto.enabled ? 'Disable' : 'Enable'}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  >
                    {auto.enabled ? (
                      <ToggleRight className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-neutral-400" />
                    )}
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center space-x-1.5 text-neutral-500 dark:text-neutral-400 text-[11px]">
                    {auto.responseType === 'document' ? (
                      <File className="w-3.5 h-3.5 text-blue-500" />
                    ) : auto.responseType === 'image' ? (
                      <ImageIcon className="w-3.5 h-3.5 text-purple-500" />
                    ) : auto.responseType === 'assign_agent' ? (
                      <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span className="capitalize font-semibold">{auto.responseType.replace('_', ' ')} Response</span>
                  </div>

                  <p className="text-neutral-800 dark:text-neutral-200 leading-relaxed bg-neutral-50 dark:bg-neutral-800/60 p-3 rounded-xl whitespace-pre-wrap">
                    {auto.responseContent}
                  </p>

                  {auto.mediaUrl && (
                    <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[11px] font-mono text-neutral-600 dark:text-neutral-400 truncate">
                      Attachment: {auto.mediaName || auto.mediaUrl}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-400">
                <span>Created {new Date(auto.createdAt).toLocaleDateString()}</span>
                <button
                  onClick={() => handleDelete(auto.id)}
                  className="p-1 rounded text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Automation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-900 dark:text-white text-base">
                New Automation Rule
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Trigger Type
                  </label>
                  <select
                    value={triggerType}
                    onChange={(e) => setTriggerType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  >
                    <option value="keyword_exact">Keyword Exact Match</option>
                    <option value="keyword_contains">Message Contains Keyword</option>
                    <option value="welcome">Welcome New Conversation</option>
                    <option value="fallback">Fallback (No match)</option>
                  </select>
                </div>

                {triggerType.startsWith('keyword') && (
                  <div>
                    <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Keyword <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CATALOG, PRICING, HELP"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono uppercase"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Response Action Type
                </label>
                <select
                  value={responseType}
                  onChange={(e) => setResponseType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                >
                  <option value="text">Send Text Message</option>
                  <option value="document">Send Document / PDF</option>
                  <option value="image">Send Image</option>
                  <option value="assign_agent">Assign to Human Agent</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Response Message Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Here is our current product catalog and pricing sheet..."
                  value={responseContent}
                  onChange={(e) => setResponseContent(e.target.value)}
                  className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                />
              </div>

              {(responseType === 'document' || responseType === 'image') && (
                <div className="space-y-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700">
                  <div>
                    <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Public Media File URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://example.com/assets/catalog-2026.pdf"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      File Display Name
                    </label>
                    <input
                      type="text"
                      placeholder="Catalog_2026.pdf"
                      value={mediaName}
                      onChange={(e) => setMediaName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

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
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  Save Automation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
