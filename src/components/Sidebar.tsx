import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Smartphone,
  Users,
  FileText,
  Send,
  Bot,
  BarChart3,
  ShieldCheck,
  Crown,
  LogOut,
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const { userProfile, signOut, organization } = useAuth();
  const { activeAccount } = useWhatsAppAccounts();
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inbox', label: 'Inbox', icon: MessageSquare },
    { id: 'whatsapp', label: 'WhatsApp Numbers', icon: Smartphone },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'campaigns', label: 'Campaigns', icon: Send },
    { id: 'analytics', label: 'Campaign Analytics', icon: BarChart3 },
    { id: 'automations', label: 'Automations', icon: Bot },
    {
      id: 'admin',
      label: 'Settings & Meta Cloud API',
      icon: ShieldCheck,
    },
  ];

  const handleNavClick = (tabId: string) => {
    setCurrentTab(tabId);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-xs"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shadow-emerald-500/30">
              <MessageSquare className="w-5 h-5 fill-white/20" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-neutral-900 dark:text-white flex items-center space-x-1.5">
                <span>CloudWABA</span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                  Cloud API
                </span>
              </span>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[140px]">
                {organization?.name || 'WhatsApp SaaS'}
              </p>
            </div>
          </div>
        </div>

        {/* WhatsApp Connection Status Badge */}
        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800/60 bg-neutral-50/50 dark:bg-neutral-900/50">
          {activeAccount && activeAccount.connectionStatus === 'connected' ? (
            <div className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="font-medium text-[11px] leading-tight">Connected Number</p>
                <p className="font-mono text-[10px] opacity-90 truncate">{activeAccount.displayPhoneNumber}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="truncate">
                <p className="font-medium text-[11px] leading-tight">No WhatsApp Connected</p>
                <p className="text-[10px] opacity-80">Setup in WhatsApp tab</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-400 dark:text-neutral-500'}`} />
                  <span>{item.label}</span>
                </div>
                {(item as any).badge && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
                  }`}>
                    {(item as any).badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer: User profile, theme, logout */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2 bg-neutral-50/50 dark:bg-neutral-900/40">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-semibold text-neutral-700 dark:text-neutral-200 shrink-0">
                {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="truncate text-left">
                <p className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                  {userProfile?.displayName || 'User'}
                </p>
                <span className="inline-block text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/70 px-1 rounded">
                  {userProfile?.role || 'owner'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={toggleTheme}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button
                onClick={signOut}
                title="Sign out"
                className="p-1.5 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
