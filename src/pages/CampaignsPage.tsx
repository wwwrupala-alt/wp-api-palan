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
  Smartphone,
  Loader2,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeCampaigns,
  subscribeTemplates,
  subscribeContacts,
  subscribeGroups,
} from '../lib/services.ts';
import type { Campaign, Template, Contact, ContactGroup } from '../types/index.ts';
import { CreateCampaignModal } from '../components/CreateCampaignModal.tsx';

export const CampaignsPage: React.FC = () => {
  const { organization } = useAuth();
  const { activeAccount } = useWhatsAppAccounts();
  const toast = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);

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
              Live Preview & Manual Paste
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Send bulk WhatsApp messages with official Meta templates, live WhatsApp bubble preview & Excel number pasting.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
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
      ) : (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-4">Campaign Name</th>
                  <th className="py-3 px-4">Template</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Audience</th>
                  <th className="py-3 px-4">Delivery Stats</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50">
                    <td className="py-3.5 px-4 font-semibold text-neutral-900 dark:text-white">
                      {c.name}
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
                  </tr>
                ))}
              </tbody>
            </table>
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
