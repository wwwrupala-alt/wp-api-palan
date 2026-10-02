import React from 'react';
import {
  Menu,
  Smartphone,
  Plus,
  ChevronDown,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';

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

  const titles: Record<string, string> = {
    dashboard: 'Dashboard Overview',
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
