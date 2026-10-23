import React, { useState } from 'react';
import {
  X,
  Workflow,
  Clock,
  Sparkles,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  FileText,
  Users,
  MessageSquare,
  ShieldAlert,
  Send,
  Zap,
  Copy,
  RefreshCw,
} from 'lucide-react';
import type { DripCampaign, DripStep } from '../../types/index.ts';
import { DripStepCountdown } from './DripStepCountdown.tsx';
import { rescanDripCampaignApi } from '../../lib/services.ts';
import { useToast } from '../../context/ToastContext.tsx';

interface DripFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: DripCampaign | null;
  onEditCampaign?: (campaign: DripCampaign) => void;
  onCloneCampaign?: (campaign: DripCampaign) => void;
}

export const DripFlowModal: React.FC<DripFlowModalProps> = ({
  isOpen,
  onClose,
  campaign,
  onEditCampaign,
  onCloneCampaign,
}) => {
  const toast = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  if (!isOpen || !campaign) return null;

  const handleSyncReadReceipts = async () => {
    if (!campaign) return;
    setIsSyncing(true);
    try {
      await rescanDripCampaignApi(campaign.organizationId, campaign.id);
      toast.showSuccess('Status Synced', 'Refreshed live WhatsApp delivery & read receipts.');
    } catch (err: any) {
      toast.showError('Sync Failed', err?.message || 'Could not sync status.');
    } finally {
      setIsSyncing(false);
    }
  };

  const steps: DripStep[] = campaign.steps || [];

  const formatDelay = (val: number, unit: string) => {
    if (val === 0) return 'Immediate (0m delay)';
    return `Wait ${val} ${unit}`;
  };

  const getConditionLabel = (cond?: string) => {
    switch (cond) {
      case 'if_not_replied':
        return {
          title: 'Condition: If customer has NOT replied',
          desc: 'Skips and stops if the recipient sent any inbound reply to previous message.',
          badge: 'Smart Reply Guard',
          color: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
        };
      case 'if_read':
        return {
          title: 'Condition: If previous message was READ',
          desc: 'Dispatches only if WhatsApp read receipt was confirmed.',
          badge: 'Read Receipt Gate',
          color: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800',
        };
      case 'always':
      default:
        return {
          title: 'Condition: Always Send',
          desc: 'Dispatches unconditionally when the delay timer elapses.',
          badge: 'Unconditional',
          color: 'text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700',
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-neutral-900 dark:text-white text-base">
                  {campaign.name}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    campaign.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : campaign.status === 'paused'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300'
                  }`}
                >
                  {campaign.status}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Visual Multi-Step Drip Sequence Flowchart & Execution Logic
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncReadReceipts}
              className="px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              title="Sync live WhatsApp read receipts & delivery status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Live Status'}</span>
            </button>
            {onCloneCampaign && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCloneCampaign(campaign);
                }}
                className="px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
                title="Duplicate sequence to modify numbers, templates or delays"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Clone Sequence</span>
              </button>
            )}
            {onEditCampaign && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditCampaign(campaign);
                }}
                className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 cursor-pointer"
              >
                Edit Steps
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Flow Canvas */}
        <div className="p-6 overflow-y-auto space-y-6 bg-neutral-50/50 dark:bg-neutral-950/40">
          {/* Top Trigger Node */}
          <div className="flex flex-col items-center">
            <div className="w-full max-w-lg rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 shadow-sm relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Sequence Trigger & Audience
                    </span>
                    <h4 className="font-bold text-sm text-neutral-900 dark:text-white">
                      {campaign.triggerType === 'group_enrollment'
                        ? 'Contact Group Enrollment'
                        : campaign.triggerType === 'all_opted_in'
                        ? 'All Opted-In Contacts'
                        : 'Manual Phone List'}
                    </h4>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 font-mono">
                    {campaign.enrolledCount || 0} Enrolled
                  </span>
                  <p className="text-[10px] text-neutral-500">
                    {campaign.activeSubscribers || 0} In Progress • {campaign.completedSubscribers || 0} Finished
                  </p>
                </div>
              </div>
            </div>

            {/* Down Connector */}
            <div className="flex flex-col items-center my-2">
              <div className="w-0.5 h-6 bg-emerald-500/50" />
              <ArrowDown className="w-4 h-4 text-emerald-500 -mt-1" />
            </div>
          </div>

          {/* Sequential Steps */}
          {steps.map((st, idx) => {
            const isLast = idx === steps.length - 1;
            const cond = getConditionLabel(st.condition);

            return (
              <div key={st.id || idx} className="flex flex-col items-center">
                {/* Step Card */}
                <div className="w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-md hover:border-emerald-400 dark:hover:border-emerald-500 transition-all">
                  {/* Step Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center space-x-2.5">
                      <span className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 font-black text-xs flex items-center justify-center font-mono">
                        {st.stepNumber || idx + 1}
                      </span>
                      <h4 className="font-bold text-sm text-neutral-900 dark:text-white">
                        {st.title || `Step ${idx + 1}`}
                      </h4>
                    </div>

                    <div className="flex flex-col items-end space-y-1">
                      <div className="flex items-center space-x-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-200/60 dark:border-amber-800/60 font-mono">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatDelay(st.delayValue, st.delayUnit)}</span>
                      </div>
                      <DripStepCountdown
                        nextExecutionAt={st.nextExecutionAt}
                        delayValue={st.delayValue}
                        delayUnit={st.delayUnit}
                        sentCount={st.stats?.sent}
                        waitingCount={st.waitingSubscribers}
                        isComplete={campaign.completedSubscribers > 0 && campaign.activeSubscribers === 0}
                        compact
                      />
                    </div>
                  </div>

                  {/* Condition Gate Banner */}
                  <div className={`mt-3 p-2.5 rounded-xl border text-xs flex items-center justify-between ${cond.color}`}>
                    <div className="flex items-center space-x-2">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-semibold">{cond.title}</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-black/10 dark:bg-white/10">
                      {cond.badge}
                    </span>
                  </div>

                  {/* Template Details */}
                  <div className="mt-3.5 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs">
                        <FileText className="w-3.5 h-3.5 text-neutral-500" />
                        <span className="font-bold text-neutral-900 dark:text-white">
                          {st.templateName || st.template?.name || 'WhatsApp Template'}
                        </span>
                      </div>
                      {st.templateCategory && (
                        <span className="text-[10px] uppercase font-semibold text-neutral-500 bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded">
                          {st.templateCategory}
                        </span>
                      )}
                    </div>

                    {st.headerMediaUrl && (
                      <div className="rounded-lg overflow-hidden border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 flex items-center space-x-2 text-[10px]">
                        <span className="font-bold text-amber-700 dark:text-amber-300">Header Media:</span>
                        <span className="truncate text-neutral-700 dark:text-neutral-300 font-mono">{st.headerMediaUrl.split('/').pop()?.split('?')[0] || 'Media Attachment'}</span>
                      </div>
                    )}

                    {st.template?.components && (
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-300 line-clamp-3 italic">
                        {st.template.components.find((c: any) => c.type === 'BODY')?.text ||
                          'Message body text.'}
                      </p>
                    )}

                    {st.variableValues && Object.keys(st.variableValues).length > 0 && (
                      <div className="pt-1.5 border-t border-neutral-200/50 dark:border-neutral-700/50 flex flex-wrap gap-1">
                        <span className="text-[10px] text-neutral-400 font-semibold uppercase">Vars:</span>
                        {Object.entries(st.variableValues).map(([k, v]) => (
                          <span
                            key={k}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200"
                          >
                            {k}={v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Step Stats if available */}
                  {st.stats && (
                    <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800 grid grid-cols-3 gap-2 text-center text-[10px]">
                      <div className="bg-neutral-50 dark:bg-neutral-800 p-1.5 rounded-lg">
                        <span className="text-neutral-400 block font-semibold">Sent</span>
                        <span className="font-bold text-neutral-900 dark:text-white font-mono text-xs">
                          {st.stats.sent || 0}
                        </span>
                      </div>
                      <div className="bg-neutral-50 dark:bg-neutral-800 p-1.5 rounded-lg">
                        <span className="text-neutral-400 block font-semibold">Delivered</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-xs">
                          {st.stats.delivered || 0}
                        </span>
                      </div>
                      <div className="bg-neutral-50 dark:bg-neutral-800 p-1.5 rounded-lg">
                        <span className="text-neutral-400 block font-semibold">Read</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 font-mono text-xs">
                          {st.stats.read || 0}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Connecting arrow to next step or final node */}
                <div className="flex flex-col items-center my-2">
                  <div className="w-0.5 h-6 bg-neutral-300 dark:bg-neutral-700" />
                  <ArrowDown className="w-4 h-4 text-neutral-400 -mt-1" />
                </div>
              </div>
            );
          })}

          {/* End Completion Goal Node */}
          <div className="flex flex-col items-center">
            <div className="w-full max-w-lg rounded-2xl border-2 border-blue-500/40 bg-blue-50/60 dark:bg-blue-950/30 p-4 shadow-sm text-center">
              <div className="flex items-center justify-center space-x-2 text-blue-700 dark:text-blue-300 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                <span>Sequence Completion & Goal Reached</span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                Contacts who pass all steps exit the drip funnel as Completed Graduates.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 flex items-center justify-between text-xs text-neutral-500">
          <span>Engine polls every 20 seconds for due subscriber steps</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-bold text-xs cursor-pointer shadow-xs"
          >
            Close Flowchart
          </button>
        </div>
      </div>
    </div>
  );
};
