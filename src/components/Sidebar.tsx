import React, { useState } from 'react';
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
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  X,
  AlertCircle,
  Workflow,
  Phone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { WhatsAppPinModal } from './WhatsAppPinModal.tsx';

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
  const { userProfile, signOut, organization, isMasterAdmin, isAdmin, isUser, impersonatedBy } = useAuth();
  const { activeAccount } = useWhatsAppAccounts();
  const { theme, toggleTheme } = useTheme();

  // Change Password state for logged in user (User, Admin, Master)
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);

  const handleOpenChangePass = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPassError(null);
    setPassSuccess(null);
    setIsChangePassOpen(true);
  };

  const handleChangePassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    const identifier = userProfile?.phone || userProfile?.email || userProfile?.uid;
    if (!identifier) {
      setPassError('Could not identify user account.');
      return;
    }
    if (!oldPassword.trim()) {
      setPassError('Please enter your current old password.');
      return;
    }
    if (newPassword.length < 6) {
      setPassError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('New password and confirm password do not match.');
      return;
    }

    setPassLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          oldPassword: oldPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to change password.');
      }

      setPassSuccess('Password successfully updated!');
      setTimeout(() => {
        setIsChangePassOpen(false);
      }, 1500);
    } catch (err: any) {
      setPassError(err.message || 'Failed to change password.');
    } finally {
      setPassLoading(false);
    }
  };

  const navItems: Array<{ id: string; label: string; icon: any; badge?: string }> = [];

  // Master Admin Dedicated Control Tab
  if (isMasterAdmin && !impersonatedBy) {
    navItems.push({
      id: 'master',
      label: 'Master Admin Control',
      icon: Crown,
      badge: 'Super',
    });
  }

  // Base Workspace Tabs
  navItems.push({ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard });

  // Check permission for Inbox
  const canAccessInbox =
    isMasterAdmin ||
    (userProfile?.canAccessInbox !== false &&
      (userProfile?.subscription?.features as any)?.canInbox !== false);
  if (canAccessInbox) {
    navItems.push({ id: 'inbox', label: 'Inbox', icon: MessageSquare });
  }

  navItems.push(
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'campaigns', label: 'Campaigns', icon: Send }
  );

  // Check permission for Drip Campaigns
  const canAccessDrip =
    isMasterAdmin ||
    (userProfile?.canAccessDripCampaigns !== false &&
      (userProfile?.subscription?.features as any)?.canDripCampaigns !== false);
  if (canAccessDrip) {
    navItems.push({ id: 'drip', label: 'Drip Campaigns', icon: Workflow, badge: 'Pro' });
  }

  navItems.push({ id: 'analytics', label: 'Campaign Analytics', icon: BarChart3 });

  // Check permission for Automations (Bot & Automations)
  const canAccessAutomations =
    isMasterAdmin ||
    (userProfile?.canAccessAutomations !== false &&
      (userProfile?.subscription?.features as any)?.canAutomations !== false);
  if (canAccessAutomations) {
    navItems.push({ id: 'automations', label: 'Automations', icon: Bot });
  }

  // Admin and Master Admin Tenant Controls (Hidden from standard Users)
  if (isAdmin || isMasterAdmin) {
    navItems.push({ id: 'users', label: 'Users & Team', icon: Users });

    // Only show 'Settings & Meta Cloud API' if Master Admin or permitted
    const canAccessSettings = isMasterAdmin || userProfile?.canAccessSettingsMetaApi !== false;
    if (canAccessSettings) {
      navItems.push({ id: 'admin', label: 'Settings & Meta Cloud API', icon: ShieldCheck });
    }
  }

  // LAST ITEM IN MENU: WhatsApp Numbers (PIN protected)
  navItems.push({ id: 'whatsapp', label: 'WhatsApp Numbers', icon: Smartphone });

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const handleNavClick = (tabId: string) => {
    if (tabId === 'whatsapp') {
      const isMasterUnlocked = sessionStorage.getItem('wa_numbers_master_unlocked') === 'true';
      const isUnlocked = sessionStorage.getItem('wa_numbers_unlocked') === 'true';
      if (!isMasterUnlocked && !isUnlocked) {
        setIsPinModalOpen(true);
        return;
      }
    } else {
      // If leaving WhatsApp Numbers menu, re-lock unless unlocked with master 1646 PIN
      if (sessionStorage.getItem('wa_numbers_master_unlocked') !== 'true') {
        sessionStorage.removeItem('wa_numbers_unlocked');
      }
    }
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
        {/* Brand Header with Admin's Custom Logo & Identity (Flexible for Square & Rectangular Logos) */}
        <div className="h-16 px-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 overflow-hidden w-full">
            {(organization?.logoUrl || userProfile?.adminLogoUrl || userProfile?.logoUrl) ? (
              <div className="h-11 max-w-[145px] min-w-[42px] px-1.5 py-1 rounded-xl bg-white dark:bg-neutral-800/90 border border-neutral-200/90 dark:border-neutral-700/80 flex items-center justify-center shrink-0 shadow-2xs">
                <img
                  src={organization?.logoUrl || userProfile?.adminLogoUrl || userProfile?.logoUrl}
                  alt={(userProfile?.role === 'user' ? (userProfile?.adminBrandName || (organization as any)?.adminBrandName || organization?.name) : organization?.name) || 'Admin Logo'}
                  className="max-h-9 max-w-[135px] w-auto h-auto object-contain rounded-md"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shadow-emerald-500/30 shrink-0">
                <MessageSquare className="w-5 h-5 fill-white/20" />
              </div>
            )}
            <div className="truncate min-w-0 flex-1">
              <span className="font-bold text-sm tracking-tight text-neutral-900 dark:text-white block truncate" title={(userProfile?.role === 'user' && (userProfile?.adminBrandName || (organization as any)?.adminBrandName) ? (userProfile.adminBrandName || (organization as any).adminBrandName) : (organization?.name || 'Workspace'))}>
                {userProfile?.role === 'user' && (userProfile?.adminBrandName || (organization as any)?.adminBrandName)
                  ? (userProfile.adminBrandName || (organization as any).adminBrandName)
                  : (organization?.name || 'Workspace')}
              </span>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                {userProfile?.role === 'user'
                  ? 'Official Customer Portal'
                  : isMasterAdmin
                  ? 'Platform Control Center'
                  : 'WhatsApp Business Portal'}
              </p>
            </div>
          </div>
          {isMobileOpen && (
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg ml-1 shrink-0"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
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

        {/* White-Label Admin Support Desk Card (Call Admin & WhatsApp removed; Business Brand Name displayed) */}
        {(organization?.contactPhone || userProfile?.adminContactPhone || (userProfile?.role === 'user' ? (userProfile?.adminBrandName || (organization as any)?.adminBrandName) : organization?.name)) && (
          <div className="mx-3 my-2 p-2.5 rounded-xl bg-gradient-to-br from-emerald-50/90 to-teal-50/70 dark:from-emerald-950/40 dark:to-teal-950/30 border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Phone className="w-3.5 h-3.5" />
              </div>
              <div className="truncate min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
                  {userProfile?.role === 'user' ? 'Admin Support Helpline' : 'Admin Helpline'}
                </p>
                {(organization?.contactPhone || userProfile?.adminContactPhone) ? (
                  <p className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400 truncate">
                    {organization?.contactPhone || userProfile?.adminContactPhone}
                  </p>
                ) : (
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                    Active Support Desk
                  </p>
                )}
              </div>
            </div>

            {/* Business Brand Name Display */}
            <div className="pt-1.5 border-t border-emerald-200/70 dark:border-emerald-800/50 flex items-center justify-between text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Business Brand
              </span>
              <span
                className="font-bold text-emerald-900 dark:text-emerald-200 truncate max-w-[130px]"
                title={(userProfile?.role === 'user' && (userProfile?.adminBrandName || (organization as any)?.adminBrandName) ? (userProfile.adminBrandName || (organization as any).adminBrandName) : (organization?.name || 'Workspace'))}
              >
                {userProfile?.role === 'user' && (userProfile?.adminBrandName || (organization as any)?.adminBrandName)
                  ? (userProfile.adminBrandName || (organization as any).adminBrandName)
                  : (organization?.name || 'Workspace')}
              </span>
            </div>
          </div>
        )}

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
                  {isMasterAdmin && !impersonatedBy ? 'Master Admin' : isAdmin || userProfile?.role === 'owner' ? 'Admin' : 'User'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={handleOpenChangePass}
                title="Change Password"
                className="p-1.5 text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <button
                onClick={toggleTheme}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button
                onClick={() => signOut()}
                title="Sign out"
                className="p-1.5 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="px-2 pt-1 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-between text-[10px] text-neutral-400 dark:text-neutral-500">
            <a
              href="/privacy-policy"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/privacy-policy');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="hover:text-emerald-600 dark:hover:text-emerald-400 underline"
            >
              Privacy Policy
            </a>
            <span>•</span>
            <a
              href="/terms-of-service"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/terms-of-service');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="hover:text-emerald-600 dark:hover:text-emerald-400 underline"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </aside>

      {/* Change Password Modal for logged-in user */}
      {isChangePassOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-scaleIn">
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/60 dark:bg-neutral-850">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 dark:text-white text-sm">
                    Change Password
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Verify your current password and set a new password
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChangePassOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePassSubmit} className="p-5 space-y-4 text-xs">
              {passError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start space-x-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-semibold text-[11px]">{passError}</span>
                </div>
              )}

              {passSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 flex items-start space-x-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <div className="text-[11px]">
                    <p className="font-bold">{passSuccess}</p>
                    <p className="text-[10px] mt-0.5 opacity-90">Your password has been updated successfully.</p>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                <span className="text-[11px] text-neutral-500 block">Logged In Account:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {userProfile?.displayName} ({userProfile?.phone || userProfile?.email || userProfile?.uid})
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Current / Old Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowOldPass(!showOldPass)}
                    className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {showOldPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showOldPass ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showOldPass ? 'text' : 'password'}
                    required
                    placeholder="Enter current old password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPass(!showOldPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showNewPass ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Enter new password (min 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  Confirm New Password
                </label>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  required
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsChangePassOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center space-x-1.5 disabled:opacity-60"
                >
                  {passLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save New Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4-Digit Security PIN Modal for WhatsApp Numbers access */}
      <WhatsAppPinModal
        isOpen={isPinModalOpen}
        onSuccess={() => {
          setIsPinModalOpen(false);
          setCurrentTab('whatsapp');
          setIsMobileOpen(false);
        }}
        onClose={() => setIsPinModalOpen(false)}
      />
    </>
  );
};
