import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  KeyRound,
  Trash2,
  Edit,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Save,
  Building,
  Eye,
  LogIn,
  Ban,
  UserCheck,
  Calendar,
  Clock,
  Copy,
  Check,
  MessageSquare,
  Send,
  FileText,
  Contact,
  HelpCircle,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { UserProfile } from '../types/index.ts';

export const TenantUsersPage: React.FC = () => {
  const { userProfile, organization, impersonateUser } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('User@12345');
  const [newUserDesignation, setNewUserDesignation] = useState('Sales Executive');
  const [newUserValidityDays, setNewUserValidityDays] = useState<number>(30);
  const [newUserMaxWhatsApp, setNewUserMaxWhatsApp] = useState<number>(1);
  const [newUserStatus, setNewUserStatus] = useState<'active' | 'suspended'>('active');
  const [newUserPermissions, setNewUserPermissions] = useState({
    canChat: true,
    canBroadcast: true,
    canManageContacts: true,
    canTemplates: true,
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // Inspect / Watch User modal
  const [inspectUser, setInspectUser] = useState<UserProfile | null>(null);

  // Edit User modal
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [editExtendDays, setEditExtendDays] = useState<number>(0);
  const [editMaxWhatsApp, setEditMaxWhatsApp] = useState<number>(1);
  const [editPermissions, setEditPermissions] = useState({
    canChat: true,
    canBroadcast: true,
    canManageContacts: true,
    canTemplates: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset Password modal
  const [resettingUser, setResettingUser] = useState<UserProfile | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Delete User modal
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const orgId =
    organization?.id ||
    userProfile?.organizationId ||
    (userProfile?.uid === 'master_admin_root'
      ? 'org_master_platform'
      : userProfile?.uid
      ? `org_${userProfile.uid}`
      : 'org_default');

  const maxUsersAllowed =
    organization?.subscription?.maxUsers || userProfile?.subscription?.maxUsers || 10;

  const adminMaxWhatsApp =
    organization?.subscription?.maxWhatsAppNumbers || userProfile?.subscription?.maxWhatsAppNumbers || 5;

  // Calculate Admin workspace remaining validity
  const adminExpiresAt = organization?.subscription?.expiresAt || userProfile?.subscription?.expiresAt;
  let adminDaysRemaining = 0;
  if (adminExpiresAt) {
    adminDaysRemaining = Math.max(0, Math.ceil((new Date(adminExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  const loadTenantUsers = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?orgId=${encodeURIComponent(orgId)}`, {
        headers: { 'x-organization-id': orgId },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.warn('Failed to load tenant users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenantUsers();
  }, [orgId]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.showSuccess('Copied', `"${text}" copied to clipboard.`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Filter users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q) ||
      (u.subscription?.planName || '').toLowerCase().includes(q);

    const isSuspended = u.subscription?.status === 'suspended';
    if (statusFilter === 'active' && isSuspended) return false;
    if (statusFilter === 'suspended' && !isSuspended) return false;

    return matchesQuery;
  });

  // Calculate live expiry date preview for Create modal
  const calculateExpiryDate = (days: number): { formatted: string; iso: string } => {
    const date = new Date(Date.now() + Math.max(0, Number(days) || 0) * 24 * 60 * 60 * 1000);
    return {
      formatted: date.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      iso: date.toISOString(),
    };
  };

  // Calculate live expiry date for Edit modal
  const calculateEditNewExpiry = (currentExpiry: string | undefined, extendDays: number): string => {
    const baseMs = currentExpiry ? Math.max(Date.now(), new Date(currentExpiry).getTime()) : Date.now();
    const newDate = new Date(baseMs + Math.max(0, Number(extendDays) || 0) * 24 * 60 * 60 * 1000);
    return newDate.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Handle Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserPassword.trim()) {
      toast.showWarning('Missing Info', 'Please enter user name and password.');
      return;
    }

    if (users.length >= maxUsersAllowed) {
      toast.showError(
        'Limit Reached',
        `Your plan allows up to ${maxUsersAllowed} users. Please contact your plan administrator to increase your limit.`
      );
      return;
    }

    setCreatingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
          'x-admin-id': userProfile?.uid || '',
        },
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim(),
          phone: newUserPhone.trim(),
          password: newUserPassword.trim(),
          designation: newUserDesignation.trim(),
          validityDays: Number(newUserValidityDays) || 30,
          maxWhatsAppNumbers: Math.max(1, Number(newUserMaxWhatsApp) || 1),
          status: newUserStatus,
          permissions: newUserPermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create user.');
      }

      toast.showSuccess(
        'User Created',
        `${newUserName} created with ${newUserMaxWhatsApp} WhatsApp connection(s) and ${newUserValidityDays} days validity.`
      );
      setIsCreateOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPhone('');
      setNewUserPassword('User@12345');
      setNewUserValidityDays(30);
      setNewUserMaxWhatsApp(1);
      await loadTenantUsers();
    } catch (err: any) {
      toast.showError('Error', err.message);
    } finally {
      setCreatingUser(false);
    }
  };

  // Handle Edit User Save
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/users/${editingUser.uid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
          'x-admin-id': userProfile?.uid || '',
        },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim(),
          designation: editDesignation.trim(),
          status: editStatus,
          extendDays: Number(editExtendDays) || 0,
          maxWhatsAppNumbers: Math.max(1, Number(editMaxWhatsApp) || 1),
          permissions: editPermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update user.');
      }

      toast.showSuccess('User Updated', `${editDisplayName} updated successfully.`);
      setEditingUser(null);
      await loadTenantUsers();
    } catch (err: any) {
      toast.showError('Update Failed', err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !newPasswordInput.trim()) return;

    setSavingPassword(true);
    try {
      const res = await fetch(`/api/admin/users/${resettingUser.uid}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
        },
        body: JSON.stringify({ newPassword: newPasswordInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reset password.');
      }

      toast.showSuccess('Password Reset', `Password for ${resettingUser.displayName} updated.`);
      setResettingUser(null);
    } catch (err: any) {
      toast.showError('Error', err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // Handle Toggle Status (Suspend / Activate)
  const handleToggleStatus = async (user: UserProfile) => {
    const isCurrentlySuspended = user.subscription?.status === 'suspended';
    const newStatus = isCurrentlySuspended ? 'active' : 'suspended';

    try {
      const res = await fetch(`/api/admin/users/${user.uid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': orgId,
          'x-admin-id': userProfile?.uid || '',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Status update failed');
      toast.showSuccess(
        newStatus === 'active' ? 'User Activated' : 'User Suspended',
        `${user.displayName} is now ${newStatus}.`
      );
      await loadTenantUsers();
    } catch (err: any) {
      toast.showError('Status Error', err.message);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setDeletingLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${deletingUser.uid}`, {
        method: 'DELETE',
        headers: { 'x-organization-id': orgId },
      });

      if (!res.ok) throw new Error('Failed to delete user.');

      toast.showSuccess('User Removed', `${deletingUser.displayName} removed from workspace.`);
      setDeletingUser(null);
      await loadTenantUsers();
    } catch (err: any) {
      toast.showError('Delete Error', err.message);
    } finally {
      setDeletingLoading(false);
    }
  };

  // Handle Watch / Impersonate User
  const handleWatchUser = async (user: UserProfile) => {
    try {
      await impersonateUser(user.uid);
      toast.showSuccess(
        'Watching User Workspace',
        `You are now viewing ${user.displayName}'s workspace portal live. Click "Return to Admin Panel" at the top anytime.`
      );
    } catch (err: any) {
      toast.showError('Watch Failed', err.message);
    }
  };

  const activeCount = users.filter((u) => u.subscription?.status !== 'suspended').length;
  const suspendedCount = users.filter((u) => u.subscription?.status === 'suspended').length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Top Banner / Title & Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center space-x-2">
              <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Team &amp; User Management</span>
            </h2>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              {users.length} / {maxUsersAllowed} Users Allowed
            </span>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center space-x-1">
              <Smartphone className="w-3 h-3" />
              <span>Max {adminMaxWhatsApp} WhatsApp Numbers</span>
            </span>
            {adminExpiresAt && (
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Admin Plan: {adminDaysRemaining} Days Remaining</span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Create team members, assign WhatsApp connection quotas, set validity periods, inspect activity, and watch their portals directly.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={loadTenantUsers}
            title="Refresh Users"
            className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              setNewUserName('');
              setNewUserEmail('');
              setNewUserPhone('');
              setNewUserPassword('User@12345');
              setNewUserDesignation('Sales Executive');
              setNewUserValidityDays(30);
              setNewUserMaxWhatsApp(1);
              setNewUserStatus('active');
              setIsCreateOpen(true);
            }}
            disabled={users.length >= maxUsersAllowed}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add New User</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Total Users</p>
          <p className="text-2xl font-bold font-mono text-neutral-900 dark:text-white mt-1">{users.length}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Active Users</p>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">{activeCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <p className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider">Suspended Users</p>
          <p className="text-2xl font-bold font-mono text-rose-500 mt-1">{suspendedCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Available Seats</p>
          <p className="text-2xl font-bold font-mono text-neutral-900 dark:text-white mt-1">
            {Math.max(0, maxUsersAllowed - users.length)}
          </p>
        </div>
      </div>

      {/* Capacity Progress Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-2 shadow-xs">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-neutral-700 dark:text-neutral-300">Workspace User Capacity</span>
          <span className="font-mono text-neutral-500 font-bold">
            {users.length} of {maxUsersAllowed} Used ({Math.round((users.length / maxUsersAllowed) * 100)}%)
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              users.length >= maxUsersAllowed ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(100, (users.length / maxUsersAllowed) * 100)}%` }}
          />
        </div>
      </div>

      {/* Controls & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by name, designation, mobile or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          {(['all', 'active', 'suspended'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                statusFilter === tab
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="p-12 text-center text-neutral-500 flex flex-col items-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          <span className="text-xs">Loading team users...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-500 space-y-3">
          <p>No team members found matching your search.</p>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
          >
            + Add First Member
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-4">User &amp; Designation</th>
                  <th className="py-3 px-4">Login Credentials</th>
                  <th className="py-3 px-4">WA Connections</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Validity / Expiry</th>
                  <th className="py-3 px-4">Permissions</th>
                  <th className="py-3 px-4 text-right">Actions &amp; Watch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredUsers.map((u) => {
                  const isSuspended = u.subscription?.status === 'suspended';
                  const expiresAt = u.subscription?.expiresAt;
                  let daysRemaining = 0;
                  if (expiresAt) {
                    daysRemaining = Math.max(
                      0,
                      Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    );
                  }

                  const perms = (u.subscription?.features as any) || {};
                  const userWaAllowed = u.subscription?.maxWhatsAppNumbers || 1;

                  return (
                    <tr key={u.uid} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                      {/* Name & Designation */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-xs uppercase shrink-0">
                            {(u.displayName || 'U').substring(0, 2)}
                          </div>
                          <div>
                            <p className="font-bold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                              <span>{u.displayName}</span>
                            </p>
                            <p className="text-[11px] text-neutral-500 font-medium">
                              {u.subscription?.planName || 'Team Agent'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Login Credentials */}
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold truncate max-w-[140px]">
                            {u.phone || u.email}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(u.phone || u.email, `cred_${u.uid}`)}
                            title="Copy Login Mobile/Email"
                            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                          >
                            {copiedKey === `cred_${u.uid}` ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <p className="text-[10px] text-neutral-400">Pass: •••••••• (Protected)</p>
                      </td>

                      {/* WA Connections Allowed */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          <Smartphone className="w-3 h-3 text-blue-600" />
                          <span>{userWaAllowed} Number{userWaAllowed > 1 ? 's' : ''} Allowed</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isSuspended
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                        </span>
                      </td>

                      {/* Validity */}
                      <td className="py-3.5 px-4 text-[11px]">
                        <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'Permanent'}
                        </p>
                        {expiresAt && (
                          <p
                            className={`text-[10px] ${
                              daysRemaining < 5 ? 'text-rose-600 font-bold' : 'text-neutral-400'
                            }`}
                          >
                            {daysRemaining} days remaining
                          </p>
                        )}
                      </td>

                      {/* Permissions */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          <span
                            title="Live Inbox"
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              perms.canChat !== false
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 line-through'
                            }`}
                          >
                            Inbox
                          </span>
                          <span
                            title="Campaigns"
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              perms.canBroadcast !== false
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 line-through'
                            }`}
                          >
                            Broadcast
                          </span>
                          <span
                            title="Contacts"
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              perms.canManageContacts !== false
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 line-through'
                            }`}
                          >
                            Contacts
                          </span>
                        </div>
                      </td>

                      {/* Actions & Watch */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* 1. Watch Details */}
                          <button
                            type="button"
                            onClick={() => setInspectUser(u)}
                            title="Watch User Profile & Details"
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-600" />
                          </button>

                          {/* 2. Login As User (Watch Live) */}
                          <button
                            type="button"
                            onClick={() => handleWatchUser(u)}
                            title="Login As User (Watch Workspace Live)"
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            <span>Watch</span>
                          </button>

                          {/* 3. Edit & Extend Validity */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setEditDisplayName(u.displayName || '');
                              setEditPhone(u.phone || '');
                              setEditEmail(u.email || '');
                              setEditDesignation(u.subscription?.planName || 'Sales Executive');
                              setEditStatus(u.subscription?.status === 'suspended' ? 'suspended' : 'active');
                              setEditExtendDays(0);
                              setEditMaxWhatsApp(u.subscription?.maxWhatsAppNumbers || 1);
                              setEditPermissions({
                                canChat: perms.canChat !== false,
                                canBroadcast: perms.canBroadcast !== false,
                                canManageContacts: perms.canManageContacts !== false,
                                canTemplates: perms.canTemplates !== false,
                              });
                            }}
                            title="Edit User & Extend Validity"
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* 4. Reset Password */}
                          <button
                            type="button"
                            onClick={() => {
                              setResettingUser(u);
                              setNewPasswordInput('');
                            }}
                            title="Reset User Password"
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* 5. Suspend / Activate */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u)}
                            title={isSuspended ? 'Activate User' : 'Suspend User'}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              isSuspended
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            {isSuspended ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>

                          {/* 6. Delete */}
                          <button
                            type="button"
                            onClick={() => setDeletingUser(u)}
                            title="Delete User"
                            className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 transition-colors cursor-pointer"
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

      {/* CREATE NEW USER MODAL (SCROLLABLE UI WITH FIXED HEADER & FOOTER) */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
            {/* Fixed Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 shrink-0 bg-white dark:bg-neutral-900 z-10">
              <div className="flex items-center space-x-2.5 text-neutral-900 dark:text-white font-bold text-base">
                <div className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Add New Team User</h3>
                  <p className="text-[11px] font-normal text-neutral-500">Workspace member quotas &amp; credentials</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form wrapping scrollable body and fixed footer */}
            <form onSubmit={handleCreateUser} className="flex flex-col flex-1 min-h-0">
              {/* Scrollable Form Body */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
                {/* Name & Designation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                      User Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-medium text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                      Role / Designation
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sales Executive"
                      value={newUserDesignation}
                      onChange={(e) => setNewUserDesignation(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                    />
                  </div>
                </div>

                {/* Login Phone & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                      Login Mobile Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                      Login Email
                    </label>
                    <input
                      type="email"
                      placeholder="user@company.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300">
                      Login Password <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setNewUserPassword(`User@${Math.floor(1000 + Math.random() * 9000)}`)}
                      className="text-[11px] text-emerald-600 hover:underline cursor-pointer"
                    >
                      Generate Random
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Min 6 characters"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                  />
                </div>

                {/* MAX WHATSAPP CONNECTIONS ALLOWED FOR THIS USER */}
                <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                      <Smartphone className="w-4 h-4 text-blue-600" />
                      <span>WhatsApp Connections Allowed</span>
                    </label>
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                      {newUserMaxWhatsApp} WhatsApp Connection{newUserMaxWhatsApp > 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Quick Presets */}
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 5, adminMaxWhatsApp]
                      .filter((v, idx, arr) => arr.indexOf(v) === idx && v <= adminMaxWhatsApp)
                      .map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setNewUserMaxWhatsApp(n)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            newUserMaxWhatsApp === n
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100'
                          }`}
                        >
                          {n === 1 ? '1 Connection (Default)' : `${n} Connections`}
                        </button>
                      ))}
                  </div>

                  {/* Manual Number Input */}
                  <div className="flex items-center space-x-2 pt-1">
                    <span className="text-neutral-500 text-[11px]">Or Manual Input:</span>
                    <input
                      type="number"
                      min="1"
                      max={adminMaxWhatsApp}
                      value={newUserMaxWhatsApp}
                      onChange={(e) =>
                        setNewUserMaxWhatsApp(
                          Math.max(1, Math.min(adminMaxWhatsApp, parseInt(e.target.value) || 1))
                        )
                      }
                      className="w-24 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono font-bold text-xs"
                    />
                    <span className="text-neutral-500 text-[11px]">
                      Number(s) (Workspace Limit: {adminMaxWhatsApp})
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800/60 flex items-center justify-between text-xs">
                    <span className="text-neutral-600 dark:text-neutral-300 text-[11px]">
                      Yeh team member workspace me se up to <strong>{newUserMaxWhatsApp} WhatsApp number(s)</strong> use kar payega.
                    </span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded-full shrink-0 ml-2">
                      Limit: {newUserMaxWhatsApp}
                    </span>
                  </div>
                </div>

                {/* MANUAL VALIDITY DAYS SELECTION & LIVE EXPIRY PREVIEW */}
                <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                      <span>Validity Period (Days)</span>
                    </label>
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      {newUserValidityDays} Days Selected
                    </span>
                  </div>

                  {/* Quick Days Selector Buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {[15, 30, 60, 90, 180, 365].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setNewUserValidityDays(d)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          newUserValidityDays === d
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100'
                        }`}
                      >
                        {d} Days
                      </button>
                    ))}
                  </div>

                  {/* Manual Number Input */}
                  <div className="flex items-center space-x-2 pt-1">
                    <span className="text-neutral-500 text-[11px]">Or Manual Input:</span>
                    <input
                      type="number"
                      min="1"
                      max="1825"
                      value={newUserValidityDays}
                      onChange={(e) => setNewUserValidityDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono font-bold text-xs"
                    />
                    <span className="text-neutral-500 text-[11px]">Days</span>
                  </div>

                  {/* LIVE EXPIRY DATE PREVIEW BOX */}
                  <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="text-neutral-500 text-[10px] block">Calculated Expiry Date:</span>
                        <strong className="text-neutral-900 dark:text-white font-mono text-[11px]">
                          {calculateExpiryDate(newUserValidityDays).formatted}
                        </strong>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                      Active for {newUserValidityDays}d
                    </span>
                  </div>
                </div>

                {/* Permissions Checkboxes */}
                <div className="space-y-2">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 block">
                    Permissions &amp; Feature Access:
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <label className="flex items-center space-x-2 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newUserPermissions.canChat}
                        onChange={(e) => setNewUserPermissions({ ...newUserPermissions, canChat: e.target.checked })}
                        className="rounded text-emerald-600"
                      />
                      <span>Live Team Inbox</span>
                    </label>

                    <label className="flex items-center space-x-2 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newUserPermissions.canBroadcast}
                        onChange={(e) =>
                          setNewUserPermissions({ ...newUserPermissions, canBroadcast: e.target.checked })
                        }
                        className="rounded text-emerald-600"
                      />
                      <span>Send Broadcasts</span>
                    </label>

                    <label className="flex items-center space-x-2 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newUserPermissions.canManageContacts}
                        onChange={(e) =>
                          setNewUserPermissions({ ...newUserPermissions, canManageContacts: e.target.checked })
                        }
                        className="rounded text-emerald-600"
                      />
                      <span>Manage Contacts</span>
                    </label>

                    <label className="flex items-center space-x-2 p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newUserPermissions.canTemplates}
                        onChange={(e) =>
                          setNewUserPermissions({ ...newUserPermissions, canTemplates: e.target.checked })
                        }
                        className="rounded text-emerald-600"
                      />
                      <span>Message Templates</span>
                    </label>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                    Initial Status
                  </label>
                  <select
                    value={newUserStatus}
                    onChange={(e) => setNewUserStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                  >
                    <option value="active">ACTIVE (Ready to log in)</option>
                    <option value="suspended">SUSPENDED (Temporarily disabled)</option>
                  </select>
                </div>
              </div>

              {/* Fixed Footer */}
              <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/90 backdrop-blur-xs flex justify-end space-x-2.5 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  {creatingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>Create Team User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WATCH / INSPECT USER MODAL */}
      {inspectUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2 text-neutral-900 dark:text-white font-bold text-base">
                <Eye className="w-5 h-5 text-blue-600" />
                <span>Inspect User: {inspectUser.displayName}</span>
              </div>
              <button
                type="button"
                onClick={() => setInspectUser(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-sm uppercase">
                      {(inspectUser.displayName || 'U').substring(0, 2)}
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white text-sm">{inspectUser.displayName}</h4>
                      <p className="text-[11px] text-neutral-500 font-medium">
                        {inspectUser.subscription?.planName || 'Team Agent'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      inspectUser.subscription?.status === 'suspended'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {inspectUser.subscription?.status === 'suspended' ? 'SUSPENDED' : 'ACTIVE'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-700 text-[11px]">
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Login Mobile/Email:</span>
                    <strong className="text-neutral-900 dark:text-white font-mono">{inspectUser.phone || inspectUser.email}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[10px]">User UID:</span>
                    <strong className="text-neutral-900 dark:text-white font-mono truncate block">{inspectUser.uid}</strong>
                  </div>
                </div>
              </div>

              {/* WhatsApp Connections Allowed */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">WhatsApp Connections Allowed:</span>
                  <strong className="text-neutral-900 dark:text-white font-mono flex items-center space-x-1">
                    <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                    <span>{inspectUser.subscription?.maxWhatsAppNumbers || 1} Connection{(inspectUser.subscription?.maxWhatsAppNumbers || 1) > 1 ? 's' : ''}</span>
                  </strong>
                </div>
                <p className="text-[11px] text-blue-600 font-medium">
                  Is member ko maximum {inspectUser.subscription?.maxWhatsAppNumbers || 1} WhatsApp Business connection(s) use karne ki permission hai.
                </p>
              </div>

              {/* Validity Details */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Account Expiry:</span>
                  <strong className="text-neutral-900 dark:text-white font-mono">
                    {inspectUser.subscription?.expiresAt
                      ? new Date(inspectUser.subscription.expiresAt).toLocaleDateString()
                      : 'Permanent'}
                  </strong>
                </div>
                {inspectUser.subscription?.expiresAt && (
                  <p className="text-[11px] text-emerald-600 font-semibold">
                    Valid for{' '}
                    {Math.max(
                      0,
                      Math.ceil((new Date(inspectUser.subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    )}{' '}
                    more days from today
                  </p>
                )}
              </div>

              {/* Quick Actions */}
              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    const u = inspectUser;
                    setInspectUser(null);
                    handleWatchUser(u);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center space-x-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login As User (Watch Live)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT USER & EXTEND VALIDITY MODAL (SCROLLABLE UI WITH FIXED HEADER & FOOTER) */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
            {/* Fixed Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 shrink-0 bg-white dark:bg-neutral-900 z-10">
              <div className="flex items-center space-x-2.5 text-neutral-900 dark:text-white font-bold text-base">
                <div className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Edit User: {editingUser.displayName}</h3>
                  <p className="text-[11px] font-normal text-neutral-500">Update quotas, validity, and details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form wrapping scrollable body and fixed footer */}
            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0">
              {/* Scrollable Form Body */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">Full Name</label>
                    <input
                      type="text"
                      required
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">Role / Designation</label>
                    <input
                      type="text"
                      value={editDesignation}
                      onChange={(e) => setEditDesignation(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">Mobile Number</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                    />
                  </div>
                </div>

                {/* WHATSAPP CONNECTIONS ALLOWED FOR THIS USER */}
                <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                      <Smartphone className="w-4 h-4 text-blue-600" />
                      <span>WhatsApp Connections Allowed</span>
                    </label>
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                      {editMaxWhatsApp} Connection{editMaxWhatsApp > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 5, adminMaxWhatsApp]
                      .filter((v, idx, arr) => arr.indexOf(v) === idx && v <= adminMaxWhatsApp)
                      .map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setEditMaxWhatsApp(n)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            editMaxWhatsApp === n
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100'
                          }`}
                        >
                          {n === 1 ? '1 Connection' : `${n} Connections`}
                        </button>
                      ))}
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <span className="text-neutral-500 text-[11px]">Or Manual Input:</span>
                    <input
                      type="number"
                      min="1"
                      max={adminMaxWhatsApp}
                      value={editMaxWhatsApp}
                      onChange={(e) =>
                        setEditMaxWhatsApp(
                          Math.max(1, Math.min(adminMaxWhatsApp, parseInt(e.target.value) || 1))
                        )
                      }
                      className="w-24 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono font-bold text-xs"
                    />
                    <span className="text-neutral-500 text-[11px]">
                      Number(s) (Workspace Limit: {adminMaxWhatsApp})
                    </span>
                  </div>
                </div>

                {/* MANUAL VALIDITY EXTENSION WITH LIVE PREVIEW */}
                <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                      <span>Extend Validity (Add Days)</span>
                    </label>
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      +{editExtendDays} Days
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[0, 15, 30, 60, 90, 180, 365].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setEditExtendDays(d)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          editExtendDays === d
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100'
                        }`}
                      >
                        {d === 0 ? 'No Change' : `+${d} Days`}
                      </button>
                    ))}
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-emerald-300 dark:border-emerald-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-neutral-500">
                      <span>Current Expiry:</span>
                      <span className="font-mono">
                        {editingUser.subscription?.expiresAt
                          ? new Date(editingUser.subscription.expiresAt).toLocaleDateString()
                          : 'Permanent'}
                      </span>
                    </div>
                    {editExtendDays > 0 && (
                      <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                        <span>New Expiry After Extension:</span>
                        <span className="font-mono">
                          {calculateEditNewExpiry(editingUser.subscription?.expiresAt, editExtendDays)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">Account Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                  >
                    <option value="active">ACTIVE</option>
                    <option value="suspended">SUSPENDED</option>
                  </select>
                </div>
              </div>

              {/* Fixed Footer */}
              <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/90 backdrop-blur-xs flex justify-end space-x-2.5 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2 text-neutral-900 dark:text-white font-bold text-base">
                <KeyRound className="w-5 h-5 text-emerald-600" />
                <span>Reset User Password</span>
              </div>
              <button
                type="button"
                onClick={() => setResettingUser(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
              <p className="text-neutral-500">
                Set a new secure password for <strong>{resettingUser.displayName}</strong>.
              </p>

              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">New Password</label>
                <input
                  type="text"
                  required
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                />
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setResettingUser(null)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md cursor-pointer flex items-center space-x-1.5"
                >
                  {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>Save Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-2 text-rose-600 font-bold text-base">
              <AlertCircle className="w-5 h-5" />
              <span>Remove Team User?</span>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              Are you sure you want to remove <strong>{deletingUser.displayName}</strong>? This user will immediately lose access and their seat will be freed.
            </p>

            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deletingLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                {deletingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete Member</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
