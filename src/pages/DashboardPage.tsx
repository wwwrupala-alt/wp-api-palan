import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  Users,
  Send,
  CheckCircle2,
  Eye,
  AlertCircle,
  Plus,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Zap,
  Calendar,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import {
  subscribeContacts,
  subscribeCampaigns,
  subscribeConversations,
} from '../lib/services.ts';
import type { Contact, Campaign, Conversation } from '../types/index.ts';
import { parseMessagingLimitTier } from '../lib/metaLimits.ts';
import { MaskedIdDisplay } from '../components/MaskedIdDisplay.tsx';

interface DashboardPageProps {
  onOpenConnectModal: () => void;
  onNavigate: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenConnectModal,
  onNavigate,
}) => {
  const { organization } = useAuth();
  const { accounts, activeAccount, loading: accountsLoading } = useWhatsAppAccounts();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!organization?.id) return;

    let mounted = true;

    const unsubContacts = subscribeContacts(
      organization.id,
      (data) => {
        if (mounted) setContacts(data);
      },
      () => {}
    );

    const unsubCampaigns = subscribeCampaigns(
      organization.id,
      (data) => {
        if (mounted) setCampaigns(data);
      },
      () => {}
    );

    const unsubConversations = subscribeConversations(
      organization.id,
      (data) => {
        if (mounted) {
          setConversations(data);
          setLoadingData(false);
        }
      },
      () => {
        if (mounted) setLoadingData(false);
      }
    );

    return () => {
      mounted = false;
      unsubContacts();
      unsubCampaigns();
      unsubConversations();
    };
  }, [organization?.id]);

  // Aggregate metrics strictly from real records
  const totalSent = campaigns.reduce((acc, c) => acc + (c.stats?.sent || 0), 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + (c.stats?.delivered || 0), 0);
  const totalRead = campaigns.reduce((acc, c) => acc + (c.stats?.read || 0), 0);
  const totalFailed = campaigns.reduce((acc, c) => acc + (c.stats?.failed || 0), 0);
  const activeCampaignsCount = campaigns.filter(
    (c) => c.status === 'sending' || c.status === 'scheduled'
  ).length;

  const isConnected = accounts.length > 0 && accounts.some((a) => a.connectionStatus === 'connected');

  // If no WhatsApp account is connected: Show the required empty onboarding state
  if (!accountsLoading && !isConnected) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-8 animate-fadeIn">
        <div className="text-center py-12 px-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto">
            <Smartphone className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Connect your WhatsApp Business account
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Link your official WhatsApp Business Platform number to start managing conversations, launching broadcasts, and automating replies.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={onOpenConnectModal}
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-sm transition-all hover:shadow-md cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>Connect WhatsApp</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-neutral-100 dark:border-neutral-800 text-left max-w-2xl mx-auto">
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">Step 1</span>
              <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Meta Embedded Onboarding</p>
              <p className="text-[11px] text-neutral-500 mt-0.5">Authorize via Meta Facebook login or provide Phone Number ID.</p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">Step 2</span>
              <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Sync Templates</p>
              <p className="text-[11px] text-neutral-500 mt-0.5">Fetch your approved Meta WhatsApp templates or create new ones.</p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">Step 3</span>
              <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Broadcast &amp; Live Chat</p>
              <p className="text-[11px] text-neutral-500 mt-0.5">Engage customers via team inbox and broadcast campaigns.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Connected Account Overview Banner */}
      {activeAccount && (
        <div className="p-5 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-neutral-900 dark:text-white text-base">
                  {activeAccount.verifiedName || 'WhatsApp Business Account'}
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-emerald-100 dark:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300">
                  {activeAccount.qualityRating || 'Active'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <div className="flex items-center space-x-1.5 text-xs font-mono text-neutral-600 dark:text-neutral-400">
                  <span>{activeAccount.displayPhoneNumber} &bull; WABA:</span>
                  <MaskedIdDisplay value={activeAccount.wabaId} />
                </div>
                {(() => {
                  const limitInfo = parseMessagingLimitTier(activeAccount.messagingLimitTier);
                  return (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800">
                      <Zap className="w-3 h-3 text-amber-600 fill-amber-500/20" />
                      <span>Daily Limit: {activeAccount.messagingLimitLabel || limitInfo.label}</span>
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => onNavigate('inbox')}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            >
              Open Inbox
            </button>
            <button
              onClick={() => onNavigate('campaigns')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
            >
              New Campaign
            </button>
          </div>
        </div>
      )}

      {/* Metrics Row - Strictly real data only */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs font-medium mb-2">
            <span>Messages Sent</span>
            <Send className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
            {totalSent.toLocaleString()}
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">Real Meta API dispatch count</p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs font-medium mb-2">
            <span>Delivered</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
            {totalDelivered.toLocaleString()}
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">Webhook delivery receipt count</p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs font-medium mb-2">
            <span>Read</span>
            <Eye className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
            {totalRead.toLocaleString()}
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">Customer read receipts</p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs font-medium mb-2">
            <span>Failed</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
            {totalFailed.toLocaleString()}
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">Policy or delivery errors</p>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Total Contacts</p>
            <p className="text-lg font-bold text-neutral-900 dark:text-white">{contacts.length}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Active Campaigns</p>
            <p className="text-lg font-bold text-neutral-900 dark:text-white">{activeCampaignsCount}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Connected Numbers</p>
            <p className="text-lg font-bold text-neutral-900 dark:text-white">
              {accounts.filter((a) => a.connectionStatus === 'connected').length}
            </p>
          </div>
        </div>
      </div>

      {/* Plan & Remaining Quota Status Card (Requirement 4) */}
      {(() => {
        const sub = organization?.subscription;
        const planName = sub?.planName || 'Enterprise Unlimited';
        const planStatus = sub?.status || 'active';
        const expiresAt = sub?.expiresAt;
        const remainingDays = expiresAt
          ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : 30;

        const maxWhatsApp = sub?.maxWhatsAppNumbers || 10;
        const remainingWhatsApp = Math.max(0, maxWhatsApp - accounts.length);

        const maxBroadcasts = sub?.maxMonthlyBroadcasts || 500000;
        const remainingMessages = Math.max(0, maxBroadcasts - totalSent);

        const maxUsers = sub?.maxUsers || 25;
        const maxCampaigns = 250;
        const remainingCampaigns = Math.max(0, maxCampaigns - campaigns.length);

        return (
          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800/80 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-bold text-sm text-neutral-900 dark:text-white">{planName}</h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      {planStatus}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500">Tenant Subscription &amp; Resource Allocation</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Validity: <strong className="text-neutral-900 dark:text-white">{remainingDays} Days Remaining</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-700/50">
                <span className="text-[11px] text-neutral-500 block mb-0.5">WhatsApp Connections</span>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-base font-bold text-neutral-900 dark:text-white">{accounts.length}</span>
                  <span className="text-xs text-neutral-400">/ {maxWhatsApp}</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {remainingWhatsApp} remaining
                </span>
              </div>

              <div
                onClick={() => onNavigate('users')}
                className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-700/50 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] text-neutral-500">Team Users Quota</span>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold group-hover:underline">Manage &rarr;</span>
                </div>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-base font-bold text-neutral-900 dark:text-white">{maxUsers}</span>
                  <span className="text-xs text-neutral-400">allowed</span>
                </div>
                <span className="text-[10px] text-neutral-500 font-medium">+ Add &amp; manage users</span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-700/50">
                <span className="text-[11px] text-neutral-500 block mb-0.5">Monthly Broadcasts</span>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-base font-bold text-neutral-900 dark:text-white">{totalSent.toLocaleString()}</span>
                  <span className="text-xs text-neutral-400">/ {maxBroadcasts.toLocaleString()}</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {remainingMessages.toLocaleString()} remaining
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/60 dark:border-neutral-700/50">
                <span className="text-[11px] text-neutral-500 block mb-0.5">Campaigns Created</span>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-base font-bold text-neutral-900 dark:text-white">{campaigns.length}</span>
                  <span className="text-xs text-neutral-400">/ {maxCampaigns}</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {remainingCampaigns} remaining
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Recent Activity and Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Conversations */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm text-neutral-900 dark:text-white">Recent Customer Chats</h4>
            <button
              onClick={() => onNavigate('inbox')}
              className="text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline flex items-center space-x-1"
            >
              <span>View Inbox</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {conversations.length === 0 ? (
            <div className="py-8 text-center text-neutral-400 dark:text-neutral-500 text-xs">
              No conversations yet. Incoming customer messages will appear here.
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {conversations.slice(0, 5).map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => onNavigate('inbox')}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                      {conv.contactName ? conv.contactName.charAt(0).toUpperCase() : '#'}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                        {conv.contactName} ({conv.contactPhone})
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate">{conv.lastMessage}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-neutral-400 shrink-0">
                    {new Date(conv.lastMessageAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Campaigns */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm text-neutral-900 dark:text-white">Recent Broadcast Campaigns</h4>
            <button
              onClick={() => onNavigate('campaigns')}
              className="text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline flex items-center space-x-1"
            >
              <span>All Campaigns</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="py-8 text-center text-neutral-400 dark:text-neutral-500 text-xs">
              No campaigns yet. Connect WhatsApp and create an approved template to start broadcasting.
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {campaigns.slice(0, 5).map((cmp) => (
                <div key={cmp.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-neutral-900 dark:text-white">{cmp.name}</p>
                    <p className="text-[11px] text-neutral-500">
                      Template: {cmp.templateName || cmp.templateId} &bull; Recipients: {cmp.recipientCount}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded-md ${
                      cmp.status === 'completed'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                        : cmp.status === 'sending'
                        ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {cmp.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
