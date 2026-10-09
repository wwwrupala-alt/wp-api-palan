import React from 'react';
import {
  Menu,
  Smartphone,
  Plus,
  ChevronDown,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Crown,
} from 'lucide-react';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface HeaderProps {
  currentTab: string;
  onOpenMobileMenu: () => void;
  onOpenConnectModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onOpenMobileMenu,
  onOpenConnectModal,
}) => {
  const { accounts, activeAccount, setActiveAccount, metaStatus } = useWhatsAppAccounts();
  const { organization, userProfile, isMasterAdmin, impersonatedBy, getServerNow } = useAuth();

  const expiresAt = organization?.subscription?.expiresAt || userProfile?.subscription?.expiresAt;
  const isMaster = isMasterAdmin && !impersonatedBy;

  let validityInfo: { remainingDays: number; formattedDate: string; isExpired: boolean; isNearExpiry: boolean } | null = null;
  if (!isMaster && expiresAt) {
    const expDate = new Date(expiresAt);
    const nowTime = getServerNow ? getServerNow() : Date.now();
    const diffMs = expDate.getTime() - nowTime;
    const remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    validityInfo = {
      remainingDays: Math.max(0, remainingDays),
      formattedDate: expDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      isExpired: remainingDays <= 0,
      isNearExpiry: remainingDays > 0 && remainingDays <= 7,
    };
  }

  const titles: Record<string, string> = {
    master: 'Master Admin - Multi-Tenant Platform Control',
    dashboard: 'Dashboard Overview',
    users: 'Tenant Users & Team Management',
    inbox: 'Team Inbox & Live Chat',
    whatsapp: 'WhatsApp Business Numbers',
    contacts: 'Contact Management',
    templates: 'Message Templates',
    campaigns: 'Broadcast Campaigns',
    analytics: 'Campaign Analytics & Live Tracking',
    automations: 'Bot & Automations',
    admin: 'Settings & Meta Cloud API',
  };

  return (
    <header className="h-16 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-white capitalize">
            {titles[currentTab] || currentTab}
          </h1>
          <p className="hidden sm:block text-[11px] text-neutral-500 dark:text-neutral-400">
            Multi-Tenant Meta WhatsApp Business Platform
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Real-Time Plan Validity Badge */}
        {validityInfo ? (
          <div
            title={`Your Plan Expires on ${validityInfo.formattedDate} (${validityInfo.remainingDays} days remaining from today)`}
            className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold shadow-2xs ${
              validityInfo.isExpired
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : validityInfo.isNearExpiry
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300/80 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            <Clock
              className={`w-3.5 h-3.5 shrink-0 ${
                validityInfo.isExpired
                  ? 'text-rose-600'
                  : validityInfo.isNearExpiry
                  ? 'text-amber-600'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            />
            <span>
              {validityInfo.isExpired ? 'Plan Expired' : `${validityInfo.remainingDays} Days Remaining`}
            </span>
            <span className="hidden lg:inline font-mono text-[10px] opacity-75 font-normal">
              ({validityInfo.formattedDate})
            </span>
          </div>
        ) : isMaster ? (
          <div
            title="Master Admin Root Control"
            className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold"
          >
            <Crown className="w-3.5 h-3.5 text-amber-600" />
            <span>Master Admin</span>
          </div>
        ) : null}

        {/* Meta Status Indicator */}
        {accounts.length > 0 ? (
          <div
            title="WhatsApp Business Account is connected and ready to send messages."
            className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>WhatsApp Ready</span>
          </div>
        ) : metaStatus && !metaStatus.isConfigured ? (
          <div
            title="No WhatsApp number connected yet. Click '+ Connect WhatsApp' to add your Phone Number ID & Token, or configure server variables."
            className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-medium cursor-help"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>No Account Connected</span>
          </div>
        ) : null}

        {/* WhatsApp Account Selector if multiple accounts exist */}
        {accounts.length > 0 ? (
          <div className="relative">
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 text-xs text-neutral-900 dark:text-white">
              <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <select
                aria-label="Active WhatsApp Number"
                value={activeAccount?.id || ''}
                onChange={(e) => {
                  const target = accounts.find((a) => a.id === e.target.value);
                  if (target) setActiveAccount(target);
                }}
                className="bg-transparent border-none text-xs font-medium focus:ring-0 focus:outline-hidden cursor-pointer"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id} className="dark:bg-neutral-900 text-neutral-900 dark:text-white">
                    {acc.displayPhoneNumber} ({acc.verifiedName})
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {/* Connect WhatsApp Button */}
        <button
          onClick={onOpenConnectModal}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-medium shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Connect WhatsApp</span>
        </button>
      </div>
    </header>
  );
};
