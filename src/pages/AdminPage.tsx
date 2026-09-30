import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Users,
  Smartphone,
  RefreshCw,
  Terminal,
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Lock,
  Copy,
  Check,
  UserPlus,
  KeyRound,
  Calendar,
  Layers,
  Settings,
  Trash2,
  Edit,
  Clock,
  Send,
  Zap,
  CheckCircle,
  X,
  AlertTriangle,
  Loader2,
  Database,
  Building,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeManagedUsers,
  createManagedUser,
  updateManagedUserSubscription,
  deleteManagedUser,
} from '../lib/services.ts';
import type { WebhookLog, UserProfile, UserSubscription } from '../types/index.ts';

export const AdminPage: React.FC = () => {
  const { userProfile, organization, currentUser } = useAuth();
  const { accounts, metaStatus, refreshMetaStatus } = useWhatsAppAccounts();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'users' | 'meta_app' | 'logs'>('users');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Managed Users List
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Create User Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPhoneOrEmail, setNewPhoneOrEmail] = useState('');
  const [newPassword, setNewPassword] = useState('12345678');
  const [newPlanName, setNewPlanName] = useState<'trial' | 'basic' | 'pro' | 'enterprise'>('pro');
  const [newValidityDays, setNewValidityDays] = useState(30);
  const [newMaxNumbers, setNewMaxNumbers] = useState(3);
  const [newMaxBroadcasts, setNewMaxBroadcasts] = useState(10000);
  const [newMaxContacts, setNewMaxContacts] = useState(5000);
  const [newCoexistence, setNewCoexistence] = useState(true);
  const [creatingUser, setCreatingUser] = useState(false);

  // Edit / Renew Modal
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editDaysToAdd, setEditDaysToAdd] = useState(30);
  const [editMaxNumbers, setEditMaxNumbers] = useState(1);
  const [editMaxBroadcasts, setEditMaxBroadcasts] = useState(1000);
  const [editPassword, setEditPassword] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'expired' | 'suspended'>('active');
  const [savingEdit, setSavingEdit] = useState(false);

  // Webhook Logs
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const isMasterAdmin =
    userProfile?.role === 'master_admin' ||
    userProfile?.email?.includes('admin') ||
    userProfile?.uid?.includes('admin');

  // Load Users
  useEffect(() => {
    const unsub = subscribeManagedUsers(
      (data) => {
        setUsers(data);
        setLoadingUsers(false);
      },
      (err) => {
        console.warn('Users subscribe error:', err);
        setLoadingUsers(false);
      }
    );
    return () => unsub();
  }, []);

  // Fetch Webhook Logs
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/meta/webhook/logs');
      if (res.ok) {
        const data = await res.json();
        setWebhookLogs(data.logs || []);
      }
    } catch (err) {
      console.warn('Failed to load webhook logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const copyText = (text: string, type: 'url' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  // Handle Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisplayName.trim() || !newPhoneOrEmail.trim() || !newPassword.trim()) {
      toast.showWarning('Missing Info', 'Please provide user name, mobile/email, and password.');
      return;
    }

    setCreatingUser(true);
    try {
      await createManagedUser(currentUser?.uid || 'admin', {
        displayName: newDisplayName.trim(),
        phoneOrEmail: newPhoneOrEmail.trim(),
        password: newPassword.trim(),
        role: 'owner',
        maxWhatsAppNumbers: Number(newMaxNumbers),
        maxMonthlyBroadcasts: Number(newMaxBroadcasts),
        maxContacts: Number(newMaxContacts),
        validityDays: Number(newValidityDays),
        planName: newPlanName,
        coexistenceAllowed: newCoexistence,
      });

      toast.showSuccess(
        'User Created Successfully',
        `User ${newDisplayName} created with separate tenant & ${newValidityDays} days validity.`
      );

      setIsCreateModalOpen(false);
      setNewDisplayName('');
      setNewPhoneOrEmail('');
      setNewPassword('12345678');
    } catch (err: any) {
      toast.showError('User Creation Failed', err?.message || 'Could not create user.');
    } finally {
      setCreatingUser(false);
    }
  };

  // Open Edit/Renew User Modal
  const openEditModal = (u: UserProfile) => {
    setEditingUser(u);
    setEditDaysToAdd(30);
    setEditMaxNumbers(u.subscription?.maxWhatsAppNumbers || 1);
    setEditMaxBroadcasts(u.subscription?.maxMonthlyBroadcasts || 1000);
    setEditPassword(u.loginPassword || '');
    setEditStatus(u.subscription?.status || 'active');
  };

  // Handle Save Edit / Renewal
  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setSavingEdit(true);

    try {
      // Calculate new expiry if days were extended
      let newExpiresAt = editingUser.subscription?.expiresAt;
      if (editDaysToAdd > 0) {
        const currentExp = newExpiresAt ? new Date(newExpiresAt).getTime() : Date.now();
        const base = Math.max(currentExp, Date.now());
        newExpiresAt = new Date(base + editDaysToAdd * 24 * 60 * 60 * 1000).toISOString();
      }

      await updateManagedUserSubscription(editingUser.uid, editingUser.organizationId, {
        loginPassword: editPassword.trim() || undefined,
        maxWhatsAppNumbers: Number(editMaxNumbers),
        maxMonthlyBroadcasts: Number(editMaxBroadcasts),
        expiresAt: newExpiresAt,
        status: editStatus,
      });

      toast.showSuccess(
        'User Settings Updated',
        `Successfully updated limits and subscription for ${editingUser.displayName}.`
      );
      setEditingUser(null);
    } catch (err: any) {
      toast.showError('Update Failed', err?.message || 'Failed to update user.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (u: UserProfile) => {
    if (!confirm(`Are you sure you want to permanently delete user "${u.displayName}" (${u.email || u.phone}) and their isolated database?`)) {
      return;
    }
    try {
      await deleteManagedUser(u.uid, u.organizationId);
      toast.showSuccess('User Deleted', `User ${u.displayName} removed.`);
    } catch (err: any) {
      toast.showError('Delete Failed', err?.message || 'Failed to delete user.');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center space-x-2">
              <span>Admin Management Portal</span>
            </h2>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              {isMasterAdmin ? 'Master Admin' : 'Admin'}
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
              Portal: wp-api-palan.vercel.app
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Create and manage client users, set WhatsApp number limits, expiry dates, renew plans, and audit system events.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create New User</span>
          </button>

          <button
            onClick={() => {
              fetchLogs();
              refreshMetaStatus();
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 space-x-6 text-xs font-medium">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
            activeTab === 'users'
              ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Accounts &amp; Limits ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('meta_app')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
            activeTab === 'meta_app'
              ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Meta App &amp; Webhook Credentials</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
            activeTab === 'logs'
              ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Meta Live Webhook Logs ({webhookLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: USERS & TENANT LIMITS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
              <span className="text-neutral-500">Total Managed Users</span>
              <p className="text-2xl font-bold text-neutral-900 dark:text-white font-mono">{users.length}</p>
              <p className="text-[10px] text-emerald-600">Separate isolated organizations</p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
              <span className="text-neutral-500">Active Subscriptions</span>
              <p className="text-2xl font-bold text-emerald-600 font-mono">
                {users.filter((u) => u.subscription?.status === 'active' || !u.subscription).length}
              </p>
              <p className="text-[10px] text-neutral-400">Can send WhatsApp broadcasts</p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
              <span className="text-neutral-500">Expired / Due for Renew</span>
              <p className="text-2xl font-bold text-amber-500 font-mono">
                {
                  users.filter((u) => {
                    if (!u.subscription?.expiresAt) return false;
                    return new Date(u.subscription.expiresAt).getTime() < Date.now();
                  }).length
                }
              </p>
              <p className="text-[10px] text-neutral-400">Needs admin renewal extension</p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
              <span className="text-neutral-500">Hierarchy Architecture</span>
              <p className="text-sm font-bold text-purple-600">Master Admin Ready</p>
              <p className="text-[10px] text-neutral-400">Multi-tenant ready for Super Admin scaling</p>
            </div>
          </div>

          {/* User Table */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                    <th className="py-3 px-4">User &amp; Organization</th>
                    <th className="py-3 px-4">Login Credentials</th>
                    <th className="py-3 px-4">Plan &amp; Limits</th>
                    <th className="py-3 px-4">Validity / Expiry</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-neutral-400">
                        No users created yet. Click "Create New User" to issue login credentials to a client.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isExpired = u.subscription?.expiresAt
                        ? new Date(u.subscription.expiresAt).getTime() < Date.now()
                        : false;

                      return (
                        <tr key={u.uid} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <p className="font-semibold text-neutral-900 dark:text-white">{u.displayName}</p>
                                {u.role === 'master_admin' && (
                                  <span className="text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold px-1.5 py-0.2 rounded">
                                    ADMIN
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-neutral-500 font-mono">
                                Org: {u.organizationId}
                              </p>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            <div className="space-y-0.5">
                              <p className="text-neutral-800 dark:text-neutral-200">
                                ID: <span className="font-semibold text-emerald-600">{u.phone || u.email}</span>
                              </p>
                              <p className="text-neutral-500 text-[10px]">
                                Pass: <span>{u.loginPassword || '••••••••'}</span>
                              </p>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5 text-[11px]">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                                {u.subscription?.planName || 'Standard'}
                              </span>
                              <p className="text-neutral-600 dark:text-neutral-400 text-[10px]">
                                Max Numbers: <strong>{u.subscription?.maxWhatsAppNumbers ?? 1}</strong>
                              </p>
                              <p className="text-neutral-600 dark:text-neutral-400 text-[10px]">
                                Max Broadcasts: <strong>{u.subscription?.maxMonthlyBroadcasts ?? 1000}</strong>
                              </p>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {u.subscription?.expiresAt ? (
                              <div>
                                <p
                                  className={`font-medium text-[11px] ${
                                    isExpired ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-neutral-700 dark:text-neutral-300'
                                  }`}
                                >
                                  {new Date(u.subscription.expiresAt).toLocaleDateString()}
                                </p>
                                <p className="text-[10px] text-neutral-400">
                                  {isExpired
                                    ? 'Expired'
                                    : `${Math.ceil(
                                        (new Date(u.subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                                      )} days left`}
                                </p>
                              </div>
                            ) : (
                              <span className="text-neutral-400 text-[11px]">No Expiry</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isExpired || u.subscription?.status === 'expired'
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                                  : u.subscription?.status === 'suspended'
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              }`}
                            >
                              {isExpired ? 'EXPIRED' : (u.subscription?.status || 'ACTIVE').toUpperCase()}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => openEditModal(u)}
                                title="Edit limits & Renew validity"
                                className="p-1.5 text-neutral-500 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              {u.uid !== currentUser?.uid && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  title="Delete user and organization"
                                  className="p-1.5 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: META APP & CREDENTIALS CONFIG */}
      {activeTab === 'meta_app' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-5">
            <div>
              <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                Meta WhatsApp Business Platform Connection Credentials
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Aapka official Meta App ID, Secret aur Configuration ID yahan connected hain. Embedded signup form ke zariye clients aur admin dono ka connection yahin se route hota hai.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-neutral-400">Meta App ID</span>
                <p className="font-mono text-neutral-900 dark:text-white font-bold text-sm">
                  {metaStatus?.appId || '28291855670435316'}
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ Connected to CloudWABA Platform</p>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-neutral-400">Configuration ID</span>
                <p className="font-mono text-neutral-900 dark:text-white font-bold text-sm">
                  {metaStatus?.configId || '1030431656687202'}
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ Coexistence Mode Enabled</p>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-neutral-400">Published Portal Domain</span>
                <p className="font-mono text-neutral-900 dark:text-white font-bold text-sm">
                  https://wp-api-palan.vercel.app/
                </p>
                <p className="text-[10px] text-neutral-500">Live Production URL for OAuth &amp; Webhooks</p>
              </div>

              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-neutral-400">Meta Graph API Version</span>
                <p className="font-mono text-neutral-900 dark:text-white font-bold text-sm">
                  {metaStatus?.graphVersion || 'v22.0'}
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ Latest Graph API</p>
              </div>
            </div>

            {/* Webhook Callback & Verify Token Section */}
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 space-y-3">
              <span className="font-semibold text-neutral-900 dark:text-white text-xs block">
                Meta Developer Console Webhook Callback Configuration:
              </span>

              <div className="space-y-2">
                <label className="text-[11px] text-neutral-500 font-medium">Callback URL</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value="https://wp-api-palan.vercel.app/api/meta/webhook"
                    className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs text-neutral-900 dark:text-white"
                  />
                  <button
                    onClick={() => copyText('https://wp-api-palan.vercel.app/api/meta/webhook', 'url')}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] text-neutral-500 font-medium">Verify Token</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value="cloudwaba_verify_token_secure"
                    className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs text-neutral-900 dark:text-white"
                  />
                  <button
                    onClick={() => copyText('cloudwaba_verify_token_secure', 'token')}
                    className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedToken ? 'Copied' : 'Copy Token'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WEBHOOK LOGS */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between text-[11px] text-neutral-400 border-b border-neutral-800 pb-2">
              <span className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Meta Webhook Event Stream (Messages, Deliveries &amp; Statuses)</span>
              </span>
              <span>Endpoint: /api/meta/webhook</span>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 text-xs">
                No webhook events logged yet. Incoming message events, delivery receipts, and status callbacks from Meta WhatsApp Cloud API will stream here in real time.
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {webhookLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg bg-neutral-800/60 border border-neutral-700/50 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span
                        className={`font-bold uppercase ${
                          log.status === 'success'
                            ? 'text-emerald-400'
                            : log.status === 'error'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {log.event}
                      </span>
                      <span className="text-neutral-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-neutral-300 text-xs">{log.details}</p>
                    <p className="text-[10px] text-neutral-500">Source: {log.origin}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-neutral-900 dark:text-white text-base">
                  Create New Client User &amp; Credentials
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Client / Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Ceramics / Shanti Textiles"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Login ID (Mobile or Email) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 9876543210"
                    value={newPhoneOrEmail}
                    onChange={(e) => setNewPhoneOrEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Login Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pass@1234"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Subscription & Limits Config */}
              <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 space-y-3">
                <span className="font-semibold text-purple-900 dark:text-purple-300 block text-xs">
                  User Limitations &amp; Validity Package
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-neutral-600 dark:text-neutral-400 block mb-1">
                      Plan Category
                    </label>
                    <select
                      value={newPlanName}
                      onChange={(e) => setNewPlanName(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white"
                    >
                      <option value="trial">Trial (7 Days)</option>
                      <option value="basic">Basic</option>
                      <option value="pro">Pro (Recommended)</option>
                      <option value="enterprise">Enterprise Unlimited</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-neutral-600 dark:text-neutral-400 block mb-1">
                      Validity (Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={newValidityDays}
                      onChange={(e) => setNewValidityDays(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-neutral-600 dark:text-neutral-400 block mb-1">
                      Max WhatsApp Numbers
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={newMaxNumbers}
                      onChange={(e) => setNewMaxNumbers(Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-neutral-600 dark:text-neutral-400 block mb-1">
                      Max Broadcasts
                    </label>
                    <input
                      type="number"
                      min={100}
                      step={500}
                      value={newMaxBroadcasts}
                      onChange={(e) => setNewMaxBroadcasts(Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-neutral-600 dark:text-neutral-400 block mb-1">
                      Max Contacts
                    </label>
                    <input
                      type="number"
                      min={100}
                      step={500}
                      value={newMaxContacts}
                      onChange={(e) => setNewMaxContacts(Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="coexistence"
                    checked={newCoexistence}
                    onChange={(e) => setNewCoexistence(e.target.checked)}
                    className="rounded border-neutral-300 text-purple-600"
                  />
                  <label htmlFor="coexistence" className="text-[11px] text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    Allow Coexistence Mode (Use WhatsApp Business App + Cloud API simultaneously)
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {creatingUser ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating User &amp; Tenant...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Create Client Account</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT / RENEW USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="font-bold text-neutral-900 dark:text-white text-base">
                  Renew / Edit User: {editingUser.displayName}
                </h3>
                <p className="text-[11px] text-neutral-500 font-mono">
                  ID: {editingUser.phone || editingUser.email}
                </p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Change Login Password
                </label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Extend Validity (Renew Days from Today)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={0}
                    value={editDaysToAdd}
                    onChange={(e) => setEditDaysToAdd(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                  />
                  <span className="text-neutral-500 shrink-0">Days</span>
                </div>
                <p className="text-[10px] text-neutral-400 mt-1">
                  Currently expires:{' '}
                  {editingUser.subscription?.expiresAt
                    ? new Date(editingUser.subscription.expiresAt).toLocaleDateString()
                    : 'Never'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Max Numbers
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editMaxNumbers}
                    onChange={(e) => setEditMaxNumbers(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Max Broadcasts
                  </label>
                  <input
                    type="number"
                    min={100}
                    value={editMaxBroadcasts}
                    onChange={(e) => setEditMaxBroadcasts(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Account Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs"
                >
                  <option value="active">Active (Can Login &amp; Send)</option>
                  <option value="expired">Expired (Requires Renewal)</option>
                  <option value="suspended">Suspended / Blocked</option>
                </select>
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save & Renew'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
