import React, { useEffect, useState, useMemo } from 'react';
import {
  Send,
  Plus,
  BarChart3,
  Trash2,
  CheckSquare,
  Square,
  Search,
  Filter,
  X,
  AlertTriangle,
  Loader2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeCampaigns,
  subscribeTemplates,
  subscribeContacts,
  subscribeGroups,
  deleteCampaign,
  deleteMultipleCampaigns,
} from '../lib/services.ts';
import type { Campaign, Template, Contact, ContactGroup } from '../types/index.ts';
import { CreateCampaignModal } from '../components/CreateCampaignModal.tsx';

interface CampaignsPageProps {
  onViewAnalytics?: (campaignId: string) => void;
}

export const CampaignsPage: React.FC<CampaignsPageProps> = ({ onViewAnalytics }) => {
  const { organization } = useAuth();
  const { activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Multi-Select State
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [singleDeleteCampaign, setSingleDeleteCampaign] = useState<Campaign | null>(null);

  // New Advance Campaign Modal
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  // Filtered campaigns based on search query and status filter
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.templateName || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [campaigns, searchQuery, statusFilter]);

  // Checkbox handlers
  const isAllSelected =
    filteredCampaigns.length > 0 &&
    filteredCampaigns.every((c) => selectedCampaignIds.includes(c.id));

  const isSomeSelected =
    selectedCampaignIds.length > 0 && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      // Unselect all visible campaigns
      setSelectedCampaignIds((prev) =>
        prev.filter((id) => !filteredCampaigns.some((c) => c.id === id))
      );
    } else {
      // Select all visible campaigns
      const visibleIds = filteredCampaigns.map((c) => c.id);
      setSelectedCampaignIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleToggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCampaignIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Bulk Delete
  const handleConfirmBulkDelete = async () => {
    if (!organization?.id || selectedCampaignIds.length === 0) return;
    const count = selectedCampaignIds.length;
    setIsDeleting(true);

    try {
      await deleteMultipleCampaigns(organization.id, selectedCampaignIds);
      toast.showSuccess(
        'Campaigns Deleted',
        `${count} campaign${count > 1 ? 's' : ''} successfully deleted.`
      );
      setSelectedCampaignIds([]);
      setDeleteModalOpen(false);
    } catch (err: any) {
      toast.showError('Delete Failed', err?.message || 'Could not delete selected campaigns.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Single Delete
  const handleConfirmSingleDelete = async () => {
    if (!organization?.id || !singleDeleteCampaign) return;
    const name = singleDeleteCampaign.name;
    const id = singleDeleteCampaign.id;
    setIsDeleting(true);

    try {
      await deleteCampaign(organization.id, id);
      toast.showSuccess('Campaign Deleted', `Campaign "${name}" has been removed.`);
      setSelectedCampaignIds((prev) => prev.filter((item) => item !== id));
      setSingleDeleteCampaign(null);
    } catch (err: any) {
      toast.showError('Delete Failed', err?.message || 'Could not delete campaign.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Broadcast Campaigns
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Live Preview &amp; Manual Paste
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Send bulk WhatsApp messages with official Meta templates, live WhatsApp bubble preview &amp; Excel number pasting.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {onViewAnalytics && campaigns.length > 0 && (
            <button
              onClick={() => onViewAnalytics(campaigns[0].id)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              <BarChart3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Live Analytics</span>
            </button>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            disabled={!activeAccount}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Campaign</span>
          </button>
        </div>
      </div>

      {/* Floating / Sticky Bulk Action Bar (When 1 or more campaigns are selected) */}
      {selectedCampaignIds.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex flex-wrap items-center justify-between gap-3 text-xs animate-fadeIn shadow-xs">
          <div className="flex items-center space-x-2.5 text-rose-800 dark:text-rose-300 font-semibold">
            <CheckSquare className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span>
              {selectedCampaignIds.length} campaign{selectedCampaignIds.length > 1 ? 's' : ''} selected
            </span>
            <span className="text-neutral-400">•</span>
            <span className="text-[11px] font-normal text-rose-700/80 dark:text-rose-300/80">
              Multiple select karke ek saath delete karne ke liye taiyar
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedCampaignIds([])}
              className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800/80 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-medium transition-colors cursor-pointer text-xs"
            >
              Clear Selection
            </button>
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedCampaignIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      {campaigns.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search campaigns by name or template..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Statuses ({campaigns.length})</option>
              <option value="completed">Completed</option>
              <option value="sending">Sending</option>
              <option value="scheduled">Scheduled</option>
              <option value="draft">Draft</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      )}

      {/* Campaigns Table or Empty State */}
      {loading ? (
        <div className="p-12 text-center text-neutral-500 flex flex-col items-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          <span className="text-xs">Loading campaigns...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 mx-auto">
            <Send className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">No broadcast campaigns yet.</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Connect your WhatsApp number, select an approved template, and paste or select numbers to start broadcasting.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={!activeAccount}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Campaign</span>
          </button>
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-500 space-y-2">
          <p>No campaigns found matching your search &ldquo;{searchQuery}&rdquo;</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
            className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                  {/* Select All Checkbox */}
                  <th className="py-3 px-4 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      title={isAllSelected ? 'Deselect all visible' : 'Select all visible'}
                      className="p-1 rounded-md text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer"
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : isSomeSelected ? (
                        <div className="w-4 h-4 rounded border border-emerald-500 bg-emerald-500/20 flex items-center justify-center">
                          <div className="w-2 h-0.5 bg-emerald-600 dark:bg-emerald-400" />
                        </div>
                      ) : (
                        <Square className="w-4 h-4 text-neutral-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Campaign Name</th>
                  <th className="py-3 px-4">Template</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Audience</th>
                  <th className="py-3 px-4">Delivery Stats</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredCampaigns.map((c) => {
                  const isSelected = selectedCampaignIds.includes(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                          : 'hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50'
                      }`}
                      onClick={(e) => handleToggleSelectOne(c.id, e)}
                    >
                      {/* Individual Checkbox */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleToggleSelectOne(c.id, e)}
                          className="p-1 rounded-md text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4 text-neutral-300 dark:text-neutral-600" />
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-neutral-900 dark:text-white">
                        <div className="flex items-center space-x-2">
                          <span>{c.name}</span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                              SELECTED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300 font-mono text-[11px]">
                        {c.templateName}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            c.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : c.status === 'sending'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 animate-pulse'
                              : c.status === 'failed'
                              ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                              : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                          }`}
                        >
                          {c.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-neutral-700 dark:text-neutral-300">
                        {c.recipientCount} recipients
                      </td>
                      <td className="py-3.5 px-4">
                        {c.stats ? (
                          <div className="flex items-center space-x-2 text-[11px]">
                            <span className="text-emerald-600 font-semibold">{c.stats.sent} Sent</span>
                            <span className="text-neutral-300">•</span>
                            <span className="text-neutral-500">{c.stats.delivered || 0} Delivered</span>
                            {c.stats.failed > 0 && (
                              <>
                                <span className="text-neutral-300">•</span>
                                <span className="text-red-500 font-semibold">{c.stats.failed} Failed</span>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-500 text-[11px]">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1.5">
                          {onViewAnalytics && (
                            <button
                              onClick={() => onViewAnalytics(c.id)}
                              title="View Analytics & Delivery"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800/80 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 font-semibold text-[11px] transition-colors cursor-pointer"
                            >
                              <BarChart3 className="w-3.5 h-3.5" />
                              <span>Track</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSingleDeleteCampaign(c)}
                            title="Delete this campaign"
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-red-300 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Bulk Delete */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Delete {selectedCampaignIds.length} Selected Campaigns?
                </h3>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Yeh action irreversible hai.
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Kya aap sach mein in <strong>{selectedCampaignIds.length} campaigns</strong> ko delete karna chahte hain? Inki delivery statistics aur recipient reports database se permanently delete ho jayengi.
            </p>

            {/* Selected items preview */}
            <div className="max-h-32 overflow-y-auto p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-[11px] space-y-1">
              {campaigns
                .filter((c) => selectedCampaignIds.includes(c.id))
                .map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                    <span className="font-medium truncate mr-2">• {c.name}</span>
                    <span className="text-[10px] text-neutral-400 shrink-0 font-mono">
                      {c.recipientCount} rec.
                    </span>
                  </div>
                ))}
            </div>

            <div className="flex justify-end items-center space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold text-white flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete All {selectedCampaignIds.length}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Single Campaign Delete */}
      {singleDeleteCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Delete Campaign?
                </h3>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {singleDeleteCampaign.name}
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Kya aap sach mein campaign <strong>&ldquo;{singleDeleteCampaign.name}&rdquo;</strong> ko permanently delete karna chahte hain?
            </p>

            <div className="flex justify-end items-center space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setSingleDeleteCampaign(null)}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmSingleDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold text-white flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Campaign</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Broadcast Campaign Modal with Side WhatsApp Preview & Manual Number Paste */}
      {organization?.id && (
        <CreateCampaignModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          organizationId={organization.id}
          activeAccount={activeAccount}
          templates={templates}
          contacts={contacts}
          groups={groups}
          onSuccess={() => {
            // Refreshes upon campaign dispatch
          }}
        />
      )}
    </div>
  );
};

export default CampaignsPage;
