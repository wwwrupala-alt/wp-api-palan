import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Users,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  UserPlus,
  Trash2,
  ChevronDown,
  ChevronUp,
  FastForward,
  Loader2,
  Phone,
  Calendar,
  Sparkles,
  Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import {
  subscribeDripSubscribers,
  advanceDripSubscriberApi,
  cancelDripSubscriberApi,
  enrollDripSubscribersApi,
  subscribeGroups,
} from '../../lib/services.ts';
import type { DripCampaign, DripSubscriber, ContactGroup } from '../../types/index.ts';

interface DripSubscribersModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: DripCampaign | null;
}

export const DripSubscribersModal: React.FC<DripSubscribersModalProps> = ({
  isOpen,
  onClose,
  campaign,
}) => {
  const { organization } = useAuth();
  const toast = useToast();

  const [subscribers, setSubscribers] = useState<DripSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);

  // Advancing / cancelling action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Enroll New Contacts panel state
  const [showEnrollPanel, setShowEnrollPanel] = useState(false);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [manualPhones, setManualPhones] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (!isOpen || !organization?.id || !campaign?.id) return;

    setLoading(true);
    const unsub = subscribeDripSubscribers(
      organization.id,
      campaign.id,
      (data) => {
        setSubscribers(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubGroups = subscribeGroups(
      organization.id,
      (g) => setGroups(g),
      () => {}
    );

    return () => {
      unsub();
      unsubGroups();
    };
  }, [isOpen, organization?.id, campaign?.id]);

  const filteredSubscribers = useMemo(() => {
    return subscribers.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        q === '' ||
        s.phone.toLowerCase().includes(q) ||
        (s.name || '').toLowerCase().includes(q);

      const matchStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [subscribers, searchQuery, statusFilter]);

  const counts = useMemo(() => {
    const total = subscribers.length;
    const active = subscribers.filter((s) => s.status === 'active').length;
    const completed = subscribers.filter((s) => s.status === 'completed').length;
    const cancelled = subscribers.filter((s) => s.status === 'cancelled').length;
    return { total, active, completed, cancelled };
  }, [subscribers]);

  const handleAdvanceSubscriber = async (subId: string, phone: string) => {
    if (!organization?.id || !campaign?.id) return;
    setActionLoadingId(`adv_${subId}`);
    try {
      await advanceDripSubscriberApi(organization.id, campaign.id, subId);
      toast.showSuccess(
        'Step Triggered Immediately',
        `Dispatched or queued next step for ${phone} without waiting.`
      );
    } catch (err: any) {
      toast.showError('Advance Failed', err?.message || 'Could not trigger next step.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelSubscriber = async (subId: string, phone: string) => {
    if (!organization?.id || !campaign?.id) return;
    if (!window.confirm(`Unsubscribe ${phone} from this drip campaign?`)) return;

    setActionLoadingId(`cnc_${subId}`);
    try {
      await cancelDripSubscriberApi(organization.id, campaign.id, subId);
      toast.showSuccess('Subscriber Cancelled', `${phone} removed from sequence.`);
    } catch (err: any) {
      toast.showError('Cancel Failed', err?.message || 'Could not cancel subscriber.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !campaign?.id) return;

    const recipientsToEnroll: Array<{ phone: string; name?: string }> = [];

    // If group selected
    if (selectedGroupId) {
      const grp = groups.find((g) => g.id === selectedGroupId);
      if (grp && Array.isArray((grp as any).contacts)) {
        (grp as any).contacts.forEach((c: any) => {
          if (c.phone) recipientsToEnroll.push({ phone: c.phone, name: c.name || 'Customer' });
        });
      }
    }

    // If manual phone numbers entered
    if (manualPhones.trim()) {
      const lines = manualPhones.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      for (const line of lines) {
        recipientsToEnroll.push({ phone: line, name: 'Contact' });
      }
    }

    if (recipientsToEnroll.length === 0) {
      toast.showWarning('No Contacts', 'Please select a contact group or enter phone numbers.');
      return;
    }

    setEnrolling(true);
    try {
      const res = await enrollDripSubscribersApi(
        organization.id,
        campaign.id,
        recipientsToEnroll
      );
      toast.showSuccess(
        'Enrolled Successfully',
        res.message || `Enrolled ${recipientsToEnroll.length} contacts into sequence.`
      );
      setShowEnrollPanel(false);
      setSelectedGroupId('');
      setManualPhones('');
    } catch (err: any) {
      toast.showError('Enroll Failed', err?.message || 'Failed to enroll contacts.');
    } finally {
      setEnrolling(false);
    }
  };

  if (!isOpen || !campaign) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-neutral-900 dark:text-white text-base">
                  {campaign.name}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                  {subscribers.length} Subscribers
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Live Subscriber Progressions, Step Timelines & Manual Fast-Forward Controls
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowEnrollPanel(!showEnrollPanel)}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{showEnrollPanel ? 'Close Enroll Panel' : 'Enroll Contacts'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Enroll New Contacts Form Panel */}
        {showEnrollPanel && (
          <div className="p-5 bg-emerald-50/50 dark:bg-emerald-950/20 border-b border-emerald-200/50 dark:border-emerald-800/50 animate-fadeIn">
            <h4 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center space-x-2 mb-3">
              <UserPlus className="w-4 h-4 text-emerald-600" />
              <span>Enroll New Audience into "{campaign.name}"</span>
            </h4>
            <form onSubmit={handleEnrollSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Select Contact Group:
                  </label>
                  <select
                    value={selectedGroupId || ''}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Choose a Group --</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({(g as any).contactCount || (g as any).contacts?.length || 0} contacts)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Or Paste Phone Numbers (one per line):
                  </label>
                  <textarea
                    rows={2}
                    value={manualPhones || ''}
                    onChange={(e) => setManualPhones(e.target.value)}
                    placeholder="+919876543210&#10;+919123456789"
                    className="w-full px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowEnrollPanel(false)}
                  className="px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-400 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enrolling || (!selectedGroupId && !manualPhones.trim())}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
                >
                  {enrolling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{enrolling ? 'Enrolling...' : 'Confirm Enrollment'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filter Pills & Search Bar */}
        <div className="px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-neutral-900">
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              All ({counts.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                statusFilter === 'active'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>In-Progress ({counts.active})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'completed'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 hover:bg-blue-100'
              }`}
            >
              Completed ({counts.completed})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('cancelled')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'cancelled'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100'
              }`}
            >
              Cancelled ({counts.cancelled})
            </button>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
            <input
              type="text"
              value={searchQuery || ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by phone or name..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Subscribers Table List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
              <p className="text-xs text-neutral-500">Loading subscribers...</p>
            </div>
          ) : filteredSubscribers.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto text-neutral-400">
                <Users className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
                No Subscribers Found
              </h4>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                {subscribers.length === 0
                  ? 'No contacts have been enrolled in this drip sequence yet. Click "Enroll Contacts" above to add contacts.'
                  : 'No subscribers match the current filter or search criteria.'}
              </p>
              {subscribers.length === 0 && (
                <button
                  type="button"
                  onClick={() => setShowEnrollPanel(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                >
                  Enroll Contacts Now
                </button>
              )}
            </div>
          ) : (
            filteredSubscribers.map((sub) => {
              const isExpanded = expandedSubId === sub.id;
              const totalSteps = campaign.steps?.length || 1;
              const curStepNum = sub.currentStep || 1;
              const isFinished = sub.status === 'completed';
              const isCancelled = sub.status === 'cancelled';
              const isAdvancing = actionLoadingId === `adv_${sub.id}`;
              const isCancelling = actionLoadingId === `cnc_${sub.id}`;

              return (
                <div
                  key={sub.id}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/60 overflow-hidden shadow-xs hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Contact Identity */}
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          isFinished
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : isCancelled
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {isFinished ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : isCancelled ? (
                          <X className="w-5 h-5" />
                        ) : (
                          <Phone className="w-5 h-5" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-neutral-900 dark:text-white font-mono">
                            {sub.phone}
                          </span>
                          {sub.name && (
                            <span className="text-xs text-neutral-500 font-medium">
                              ({sub.name})
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isFinished
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : isCancelled
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            {sub.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 mt-1">
                          <span>
                            Enrolled: {new Date(sub.enrolledAt).toLocaleDateString()}
                          </span>
                          {sub.lastStepSentAt && (
                            <span>
                              Last Sent: {new Date(sub.lastStepSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progression & Actions */}
                    <div className="flex items-center space-x-3 sm:space-x-4 self-end sm:self-auto">
                      {/* Step Progress Pill */}
                      <div className="text-right">
                        <div className="flex items-center space-x-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                          <span>Step {isFinished ? totalSteps : curStepNum} of {totalSteps}</span>
                        </div>
                        {sub.nextExecutionAt && sub.status === 'active' && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono flex items-center justify-end space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              Due: {new Date(sub.nextExecutionAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </p>
                        )}
                      </div>

                      {/* Manual Control Buttons */}
                      {sub.status === 'active' && (
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            title="Trigger Next Step Immediately (Fast-Forward without waiting)"
                            disabled={isAdvancing}
                            onClick={() => handleAdvanceSubscriber(sub.id, sub.phone)}
                            className="p-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-2xs hover:scale-105 cursor-pointer disabled:opacity-50"
                          >
                            {isAdvancing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FastForward className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            type="button"
                            title="Unsubscribe contact from sequence"
                            disabled={isCancelling}
                            onClick={() => handleCancelSubscriber(sub.id, sub.phone)}
                            className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isCancelling ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      )}

                      {/* Expand History Dropdown Toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedSubId(isExpanded ? null : sub.id)}
                        className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Step History Log */}
                  {isExpanded && (
                    <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-900/80 border-t border-neutral-100 dark:border-neutral-800 text-xs space-y-2">
                      <h5 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500">
                        Subscriber Step Execution Log:
                      </h5>

                      {(!sub.stepHistory || sub.stepHistory.length === 0) ? (
                        <p className="text-[11px] text-neutral-400 italic">
                          No steps executed yet. Waiting for scheduled delay trigger.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {sub.stepHistory.map((h, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/60 dark:border-neutral-700/60 text-[11px]"
                            >
                              <div className="flex items-center space-x-2">
                                <span className="w-5 h-5 rounded-md bg-neutral-100 dark:bg-neutral-700 font-mono font-bold flex items-center justify-center text-[10px]">
                                  {h.stepNumber}
                                </span>
                                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                                  {h.templateName || `Step ${h.stepNumber}`}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                    h.status === 'sent'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : h.status === 'skipped'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  }`}
                                >
                                  {h.status}
                                </span>
                              </div>

                              <div className="text-neutral-400 font-mono text-[10px]">
                                {new Date(h.sentAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 flex items-center justify-between text-xs text-neutral-500">
          <span>{filteredSubscribers.length} subscribers shown</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-bold text-xs cursor-pointer shadow-xs"
          >
            Close Subscribers
          </button>
        </div>
      </div>
    </div>
  );
};
