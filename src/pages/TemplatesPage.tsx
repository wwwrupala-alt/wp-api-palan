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
  Copy,
  Search,
  LayoutGrid,
  List,
  Filter,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
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
import { MiniTemplatePhonePreview } from '../components/MiniTemplatePhonePreview.tsx';
import type { Template, TemplateComponent } from '../types/index.ts';

export const TemplatesPage: React.FC = () => {
  const { organization } = useAuth();
  const { activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Filter States
  const [selectedTab, setSelectedTab] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedHeaderFormat, setSelectedHeaderFormat] = useState<string>('ALL');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(true);

  // Layout View: Default to '3-cols' (1 Row me 3 templates show honge comfortable view me)
  const [viewLayout, setViewLayout] = useState<'3-cols' | '1-row'>('3-cols');

  // Preview Modal for zooming in on any template
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Create & Clone Template Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [templateToClone, setTemplateToClone] = useState<Template | null>(null);
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

  const handleCloneTemplate = (template: Template) => {
    setTemplateToClone(template);
    setCreateError(null);
    setIsCreateOpen(true);
  };

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

      setTemplateToClone(null);
      setCreateError(null);
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

  // Extract all distinct languages across existing templates
  const availableLanguages = Array.from(
    new Set(templates.map((t) => t.language).filter(Boolean))
  ).sort();

  // Active filter count
  const activeFiltersCount =
    (selectedTab !== 'ALL' ? 1 : 0) +
    (selectedCategory !== 'ALL' ? 1 : 0) +
    (selectedHeaderFormat !== 'ALL' ? 1 : 0) +
    (selectedLanguage !== 'ALL' ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const resetAllFilters = () => {
    setSelectedTab('ALL');
    setSelectedCategory('ALL');
    setSelectedHeaderFormat('ALL');
    setSelectedLanguage('ALL');
    setSearchQuery('');
    setSortBy('newest');
  };

  // Comprehensive multi-factor filtering & sorting
  const filteredTemplates = templates
    .filter((t) => {
      // 1. Status Filter
      if (selectedTab !== 'ALL' && t.status !== selectedTab) return false;

      // 2. Category Filter
      if (selectedCategory !== 'ALL' && t.category !== selectedCategory) return false;

      // 3. Header Media Format Filter
      const headerComp = t.components?.find((c) => c.type === 'HEADER');
      const headerFormat = (headerComp?.format || (headerComp ? 'TEXT' : 'NONE')).toUpperCase();
      if (selectedHeaderFormat !== 'ALL') {
        if (selectedHeaderFormat === 'NONE' && headerComp) return false;
        if (selectedHeaderFormat !== 'NONE' && headerFormat !== selectedHeaderFormat) return false;
      }

      // 4. Language Filter
      if (selectedLanguage !== 'ALL' && t.language !== selectedLanguage) return false;

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const bodyComp = t.components?.find((c) => c.type === 'BODY');
        const matchName = t.name.toLowerCase().includes(q);
        const matchCategory = t.category.toLowerCase().includes(q);
        const matchBody = bodyComp?.text && bodyComp.text.toLowerCase().includes(q);
        const matchMetaId = t.metaTemplateId && t.metaTemplateId.toLowerCase().includes(q);
        if (!matchName && !matchCategory && !matchBody && !matchMetaId) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      if (sortBy === 'name-asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      }
      return 0;
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
            Official Meta WhatsApp interactive and broadcast templates with live smartphone preview.
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
            onClick={() => {
              setTemplateToClone(null);
              setCreateError(null);
              setIsCreateOpen(true);
            }}
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

      {/* Search, Filter Options Toggle, and Layout Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
        <div className="flex items-center space-x-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search templates by name, message content, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 ${
              showFilterPanel || activeFiltersCount > 0
                ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* View Layout Switcher (Default: 3 Templates per Row - Comfortable View) */}
        <div className="flex items-center space-x-1.5 self-end md:self-auto bg-neutral-100 dark:bg-neutral-800/80 p-1 rounded-xl text-xs">
          <button
            onClick={() => setViewLayout('3-cols')}
            className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-medium transition-all cursor-pointer ${
              viewLayout === '3-cols'
                ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
            title="1 Row me 3 Templates (Comfortable View)"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>3 per Row (Comfortable)</span>
          </button>
          <button
            onClick={() => setViewLayout('1-row')}
            className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-medium transition-all cursor-pointer ${
              viewLayout === '1-row'
                ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
            }`}
            title="1 Template per Row (Wide View)"
          >
            <List className="w-3.5 h-3.5" />
            <span>1 per Row (Wide)</span>
          </button>
        </div>
      </div>

      {/* Filter Panel Bar */}
      {showFilterPanel && (
        <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-700/80 space-y-3 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-200/60 dark:border-neutral-700/60">
            <div className="flex items-center space-x-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Template Filters</span>
              <span className="text-[11px] font-normal text-neutral-500">
                (Showing {filteredTemplates.length} of {templates.length} templates)
              </span>
            </div>
            {activeFiltersCount > 0 && (
              <button
                onClick={resetAllFilters}
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Category Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs cursor-pointer focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">All Categories</option>
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>
            </div>

            {/* Media Format Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Header Media
              </label>
              <select
                value={selectedHeaderFormat}
                onChange={(e) => setSelectedHeaderFormat(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs cursor-pointer focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">All Media Types</option>
                <option value="IMAGE">Image Header</option>
                <option value="VIDEO">Video Header</option>
                <option value="DOCUMENT">Document Header</option>
                <option value="TEXT">Text Header Only</option>
                <option value="NONE">No Header</option>
              </select>
            </div>

            {/* Language Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs cursor-pointer focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">All Languages</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs cursor-pointer focus:ring-1 focus:ring-emerald-500"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name-asc">Name (A &rarr; Z)</option>
                <option value="name-desc">Name (Z &rarr; A)</option>
              </select>
            </div>
          </div>

          {/* Active Filter Chips */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10.5px] font-medium text-neutral-400">Active Filters:</span>
              {selectedTab !== 'ALL' && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10.5px]">
                  <span>Status: {selectedTab}</span>
                  <button onClick={() => setSelectedTab('ALL')} className="hover:opacity-75 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedCategory !== 'ALL' && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10.5px]">
                  <span>Category: {selectedCategory}</span>
                  <button onClick={() => setSelectedCategory('ALL')} className="hover:opacity-75 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedHeaderFormat !== 'ALL' && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10.5px]">
                  <span>Media: {selectedHeaderFormat}</span>
                  <button onClick={() => setSelectedHeaderFormat('ALL')} className="hover:opacity-75 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedLanguage !== 'ALL' && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10.5px]">
                  <span>Lang: {selectedLanguage}</span>
                  <button onClick={() => setSelectedLanguage('ALL')} className="hover:opacity-75 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {searchQuery && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10.5px]">
                  <span>Search: &quot;{searchQuery}&quot;</span>
                  <button onClick={() => setSearchQuery('')} className="hover:opacity-75 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Template Cards Grid with Side Mobile Preview */}
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
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
            >
              Sync from Meta
            </button>
            <button
              onClick={() => {
                setTemplateToClone(null);
                setCreateError(null);
                setIsCreateOpen(true);
              }}
              disabled={!activeAccount}
              className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 disabled:opacity-50 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Create Template
            </button>
          </div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2">
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            No templates match &quot;{searchQuery}&quot;
          </p>
          <p className="text-xs text-neutral-500">
            Try adjusting your search query or switching tabs.
          </p>
        </div>
      ) : (
        <div
          className={
            viewLayout === '3-cols'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-5'
              : 'space-y-5 w-full'
          }
        >
          {filteredTemplates.map((t) => {
            const bodyComp = t.components?.find((c) => c.type === 'BODY');
            const headerComp = t.components?.find((c) => c.type === 'HEADER');
            const footerComp = t.components?.find((c) => c.type === 'FOOTER');
            const buttonsComp = t.components?.find((c) => c.type === 'BUTTONS');

            // 1. Comfortable View (3 Templates Per Row)
            if (viewLayout === '3-cols') {
              return (
                <div
                  key={t.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/90 dark:border-neutral-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 group"
                >
                  {/* Card Top: Name + Copy + Status Badge */}
                  <div className="flex items-start justify-between gap-2 pb-1 border-b border-neutral-100 dark:border-neutral-800/80">
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <h4
                          className="font-bold text-neutral-900 dark:text-white text-xs sm:text-[13px] font-mono truncate max-w-[140px] sm:max-w-[170px]"
                          title={t.name}
                        >
                          {t.name}
                        </h4>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(t.name);
                            toast.showSuccess('Copied', 'Template name copied');
                          }}
                          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5 cursor-pointer"
                          title="Copy name"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                          {t.category}
                        </span>
                        <span className="text-[8px] text-neutral-400">&bull;</span>
                        <span className="text-[9px] text-neutral-500 font-medium">
                          {t.language}
                        </span>
                        {headerComp && (
                          <span className="px-1.5 py-0.2 rounded text-[8.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40">
                            {headerComp.format || 'HEADER'}
                          </span>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(t.status)}
                  </div>

                  {/* Card Middle: Split into Left Details Snippet + Right Mini Phone Preview */}
                  <div className="flex gap-2.5 items-start justify-between">
                    {/* Left Column: Body Text & Button Count */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {headerComp && headerComp.format === 'TEXT' && headerComp.text && (
                        <div className="p-1.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-700/60">
                          <p className="text-[8px] font-semibold text-neutral-400 uppercase tracking-wider">
                            Header
                          </p>
                          <p className="font-semibold text-neutral-800 dark:text-neutral-200 text-[10px] truncate">
                            {headerComp.text}
                          </p>
                        </div>
                      )}

                      <div className="p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-700/60 space-y-1">
                        <div className="flex items-center justify-between text-[8px] font-semibold text-neutral-400 uppercase tracking-wider">
                          <span>Body</span>
                          <span>{bodyComp?.text?.length || 0} ch</span>
                        </div>
                        <p className="text-[10px] leading-relaxed text-neutral-700 dark:text-neutral-300 line-clamp-4 whitespace-pre-wrap">
                          {bodyComp?.text || '(Empty Body)'}
                        </p>
                      </div>

                      {footerComp?.text && (
                        <p className="text-[9px] text-neutral-400 italic truncate border-l border-neutral-300 dark:border-neutral-700 pl-1.5">
                          {footerComp.text}
                        </p>
                      )}

                      {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {buttonsComp.buttons.slice(0, 2).map((btn, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded-md text-[8.5px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 truncate max-w-[85px]"
                            >
                              {btn.text}
                            </span>
                          ))}
                          {buttonsComp.buttons.length > 2 && (
                            <span className="text-[8.5px] text-neutral-400 self-center">
                              +{buttonsComp.buttons.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right Column: Chota Compact Mobile Preview */}
                    <div className="shrink-0 flex flex-col items-center">
                      <div className="text-[8.5px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 flex items-center space-x-0.5">
                        <Smartphone className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Preview</span>
                      </div>
                      <MiniTemplatePhonePreview
                        template={t}
                        businessName={activeAccount?.verifiedName || 'WhatsApp'}
                        compact={true}
                      />
                    </div>
                  </div>

                  {/* Card Bottom: ID, Date & Action Buttons */}
                  <div className="flex items-center justify-between gap-1.5 text-[10px] text-neutral-400 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                    <span
                      className="font-mono text-[9px] text-neutral-400 truncate max-w-[80px] sm:max-w-[100px]"
                      title={t.metaTemplateId || t.id}
                    >
                      ID: {t.metaTemplateId || t.id.slice(0, 10)}
                    </span>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => setPreviewTemplate(t)}
                        title="Zoom Preview"
                        className="p-1 px-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-[10px] font-medium flex items-center space-x-0.5 cursor-pointer"
                      >
                        <Eye className="w-3 h-3 text-neutral-500" />
                        <span>Zoom</span>
                      </button>

                      <button
                        onClick={() => handleCloneTemplate(t)}
                        title={`Clone "${t.name}"`}
                        className="p-1 px-1.5 rounded-lg text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 border border-teal-200/60 dark:border-teal-800/40 text-[10px] font-medium flex items-center space-x-0.5 cursor-pointer"
                      >
                        <Copy className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                        <span>Clone</span>
                      </button>

                      <button
                        onClick={() => handleDeleteTemplate(t)}
                        disabled={deletingTemplateId === t.id}
                        title="Delete template"
                        className="p-1 px-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[10px] flex items-center cursor-pointer disabled:opacity-50"
                      >
                        {deletingTemplateId === t.id ? (
                          <Loader2 className="w-3 h-3 animate-spin text-rose-500" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // 2. Wide View (1 Template Per Row)
            return (
              <div
                key={t.id}
                className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200/90 dark:border-neutral-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
              >
                {/* Main Card Content: Left Details + Right Chota Mobile Preview */}
                <div className="flex flex-col lg:flex-row gap-6 items-start justify-between">
                  {/* Left Side: Template Information & Details */}
                  <div className="flex-1 min-w-0 space-y-3.5 w-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4
                            className="font-bold text-neutral-900 dark:text-white text-sm sm:text-base font-mono truncate max-w-[240px] sm:max-w-[360px]"
                            title={t.name}
                          >
                            {t.name}
                          </h4>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(t.name);
                              toast.showSuccess('Copied', 'Template name copied');
                            }}
                            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5 cursor-pointer"
                            title="Copy name"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                            {t.category}
                          </span>
                          <span className="text-[10px] text-neutral-400">&bull;</span>
                          <span className="text-[10.5px] text-neutral-500 font-medium">
                            {t.language}
                          </span>
                          {headerComp && (
                            <>
                              <span className="text-[10px] text-neutral-400">&bull;</span>
                              <span className="px-2 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40">
                                {headerComp.format || 'HEADER'}
                              </span>
                            </>
                          )}
                          {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
                            <span className="px-2 py-0.5 rounded text-[9.5px] font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/50 dark:border-sky-800/40">
                              {buttonsComp.buttons.length} {buttonsComp.buttons.length === 1 ? 'Button' : 'Buttons'}
                            </span>
                          )}
                        </div>
                      </div>
                      {getStatusBadge(t.status)}
                    </div>

                    {/* Breakdown / Information Box */}
                    <div className="space-y-2 text-xs">
                      {headerComp && headerComp.format === 'TEXT' && headerComp.text && (
                        <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-700/60">
                          <p className="text-[9.5px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">
                            Header Text
                          </p>
                          <p className="font-semibold text-neutral-800 dark:text-neutral-200 text-xs truncate">
                            {headerComp.text}
                          </p>
                        </div>
                      )}

                      <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-700/60 space-y-1.5">
                        <div className="flex items-center justify-between text-[9.5px] font-semibold text-neutral-400 uppercase tracking-wider">
                          <span>Body Content</span>
                          <span>{bodyComp?.text?.length || 0} characters</span>
                        </div>
                        <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                          {bodyComp?.text || '(Empty Body)'}
                        </p>
                      </div>

                      {footerComp?.text && (
                        <div className="px-2.5 py-1 text-[10.5px] text-neutral-400 dark:text-neutral-500 italic truncate border-l-2 border-neutral-300 dark:border-neutral-700 pl-2">
                          Footer: {footerComp.text}
                        </div>
                      )}

                      {/* Interactive Buttons Preview if present */}
                      {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
                        <div className="pt-1">
                          <p className="text-[9.5px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                            Interactive Buttons:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {buttonsComp.buttons.map((b, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 flex items-center space-x-1"
                              >
                                {b.type === 'URL' ? (
                                  <ExternalLink className="w-3 h-3 text-sky-500" />
                                ) : (
                                  <MessageSquare className="w-3 h-3 text-emerald-500" />
                                )}
                                <span>{b.text}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side: CHOTA MOBILE PREVIEW (Live Smartphone Preview) */}
                  <div className="self-center lg:self-start shrink-0">
                    <div className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center justify-center space-x-1">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Live Mobile Preview</span>
                    </div>
                    <MiniTemplatePhonePreview
                      template={t}
                      businessName={activeAccount?.verifiedName || 'WhatsApp'}
                      compact={false}
                    />
                  </div>
                </div>

                {/* Bottom Bar: Meta IDs & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-neutral-400 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-center space-x-3 text-[10px] text-neutral-500">
                    <span
                      className="font-mono text-neutral-400 truncate max-w-[200px]"
                      title={t.metaTemplateId || t.id}
                    >
                      ID: {t.metaTemplateId || t.id.slice(0, 16)}
                    </span>
                    <span>&bull;</span>
                    <span>
                      Created: {new Date(t.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 self-end sm:self-auto">
                    <button
                      onClick={() => setPreviewTemplate(t)}
                      title="Inspect Fullscreen Mobile Preview"
                      className="px-3 py-1.5 rounded-xl text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center space-x-1.5 cursor-pointer text-xs font-semibold"
                    >
                      <Eye className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Zoom Preview</span>
                    </button>

                    <button
                      onClick={() => handleCloneTemplate(t)}
                      title={`Clone "${t.name}"`}
                      className="px-3 py-1.5 rounded-xl text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 border border-teal-200/60 dark:border-teal-800/40 transition-colors flex items-center space-x-1.5 cursor-pointer text-xs font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>Clone</span>
                    </button>

                    <button
                      onClick={() => handleDeleteTemplate(t)}
                      disabled={deletingTemplateId === t.id}
                      title="Delete template from Meta"
                      className="px-3 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50 transition-colors flex items-center space-x-1 cursor-pointer disabled:opacity-50 text-xs font-medium"
                    >
                      {deletingTemplateId === t.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Zoom / Full Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="font-bold text-neutral-900 dark:text-white text-sm font-mono truncate max-w-[240px]">
                    {previewTemplate.name}
                  </h3>
                  <p className="text-[10.5px] text-neutral-500">
                    {previewTemplate.category} &bull; {previewTemplate.language}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-center py-2">
              <MiniTemplatePhonePreview
                template={previewTemplate}
                businessName={activeAccount?.verifiedName || 'WhatsApp'}
                className="max-w-[260px] min-h-[420px]"
              />
            </div>

            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <button
                onClick={() => {
                  handleCloneTemplate(previewTemplate);
                  setPreviewTemplate(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Clone This Template</span>
              </button>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-4 py-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Create / Clone Template Modal with Live Smartphone Preview */}
      {isCreateOpen && (
        <TemplateBuilderModal
          key={`tpl-modal-${templateToClone?.id || 'fresh'}-${isCreateOpen ? 1 : 0}`}
          isOpen={isCreateOpen}
          onClose={() => {
            setIsCreateOpen(false);
            setTemplateToClone(null);
            setCreateError(null);
          }}
          onSubmit={handleCreateSubmit}
          creating={creating}
          createError={createError}
          initialTemplate={templateToClone}
          customToken={activeAccount?.customToken}
        />
      )}
    </div>
  );
};
