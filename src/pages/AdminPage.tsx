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
  Crown,
  Save,
  Globe,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Eye,
  EyeOff,
  FolderTree,
  UserCheck,
  Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useWhatsAppAccounts } from '../context/WhatsAppAccountsContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  subscribeManagedUsers,
  subscribeOrganizations,
  createManagedUser,
  updateManagedUserSubscription,
  deleteManagedUser,
  saveOrganizationMetaConfig,
  cleanupAdminAndSuperAdminData,
  reassignUserToAdmin,
  subscribeGlobalMetaConfig,
} from '../lib/services.ts';
import type { WebhookLog, UserProfile, UserSubscription, Organization } from '../types/index.ts';
import { MaskedIdDisplay } from '../components/MaskedIdDisplay.tsx';

export const AdminPage: React.FC = () => {
  const { userProfile, organization, currentUser, refreshProfile } = useAuth();
  const { accounts, metaStatus, refreshMetaStatus } = useWhatsAppAccounts();
  const toast = useToast();

  const isSuperMaster = true; // Final active user has full authority over settings and Meta configuration

  const [activeTab, setActiveTab] = useState<'users' | 'meta_app' | 'logs'>('users');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  // Managed Users List
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Search & Filter for Master Admin
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'admins' | 'clients'>('all');
  const [viewMode, setViewMode] = useState<'hierarchy' | 'flat'>('hierarchy');

  // Expand/collapse individual Admin cards in hierarchical view
  const [expandedAdmins, setExpandedAdmins] = useState<Record<string, boolean>>({});

  // Show/hide passwords
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Reassign User to Admin Modal
  const [reassigningUser, setReassigningUser] = useState<UserProfile | null>(null);
  const [reassignTargetAdminId, setReassignTargetAdminId] = useState<string>('');
  const [savingReassign, setSavingReassign] = useState(false);

  // Create User / Admin Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRole, setNewRole] = useState<'admin' | 'owner'>('owner');
  const [newAssignedAdminId, setNewAssignedAdminId] = useState<string>('');
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
  const [editAssignedAdminId, setEditAssignedAdminId] = useState<string>('');
  const [editDaysToAdd, setEditDaysToAdd] = useState(30);
  const [editMaxNumbers, setEditMaxNumbers] = useState(1);
  const [editMaxBroadcasts, setEditMaxBroadcasts] = useState(1000);
  const [editPassword, setEditPassword] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'expired' | 'suspended'>('active');
  const [savingEdit, setSavingEdit] = useState(false);

  // Meta App Custom Config Fields for this Admin Tenant
  const [metaAppIdInput, setMetaAppIdInput] = useState(
    organization?.metaAppConfig?.appId || ''
  );
  const [metaAppSecretInput, setMetaAppSecretInput] = useState(
    organization?.metaAppConfig?.appSecret || ''
  );
  const [metaConfigIdInput, setMetaConfigIdInput] = useState(
    organization?.metaAppConfig?.configId || ''
  );
  const [metaSystemTokenInput, setMetaSystemTokenInput] = useState(
    organization?.metaAppConfig?.systemUserToken || ''
  );
  const [metaWabaIdInput, setMetaWabaIdInput] = useState(
    organization?.metaAppConfig?.wabaId || ''
  );
  const [syncGlobally, setSyncGlobally] = useState(true);
  const [savingMetaConfig, setSavingMetaConfig] = useState(false);

  // Sync inputs whenever organization metadata updates
  useEffect(() => {
    if (organization?.metaAppConfig) {
      if (organization.metaAppConfig.appId) setMetaAppIdInput(organization.metaAppConfig.appId);
      if (organization.metaAppConfig.appSecret) setMetaAppSecretInput(organization.metaAppConfig.appSecret);
      if (organization.metaAppConfig.configId) setMetaConfigIdInput(organization.metaAppConfig.configId);
      if (organization.metaAppConfig.systemUserToken) setMetaSystemTokenInput(organization.metaAppConfig.systemUserToken);
      if (organization.metaAppConfig.wabaId) setMetaWabaIdInput(organization.metaAppConfig.wabaId);
    }
  }, [organization?.metaAppConfig]);

  // Webhook Logs
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Load Users & Organizations in real-time
  useEffect(() => {
    cleanupAdminAndSuperAdminData().catch(() => {});

    const unsubUsers = subscribeManagedUsers(
      (data) => {
        const cleanUsers = data.filter(
          (u) =>
            u.uid !== 'super_master_admin_9974428034' &&
            u.uid !== 'admin_master_12345689' &&
            u.phone !== '12345689' &&
            !u.email?.includes('wp-api-palan.vercel.app')
        );
        setUsers(cleanUsers);
        setLoadingUsers(false);
      },
      (err) => {
        console.warn('Users subscribe error:', err);
        setLoadingUsers(false);
      }
    );

    const unsubOrgs = subscribeOrganizations(
      (data) => {
        setOrganizations(data);
      },
      (err) => {
        console.warn('Organizations subscribe error:', err);
      }
    );

    const unsubGlobal = subscribeGlobalMetaConfig((gConfig) => {
      if (gConfig) {
        if (!metaAppIdInput && gConfig.appId) setMetaAppIdInput(gConfig.appId);
        if (!metaConfigIdInput && gConfig.configId) setMetaConfigIdInput(gConfig.configId);
        if (!metaAppSecretInput && gConfig.appSecret) setMetaAppSecretInput(gConfig.appSecret);
        if (!metaSystemTokenInput && gConfig.systemUserToken) setMetaSystemTokenInput(gConfig.systemUserToken);
        if (!metaWabaIdInput && gConfig.wabaId) setMetaWabaIdInput(gConfig.wabaId);
      }
    });

    return () => {
      unsubUsers();
      unsubOrgs();
      unsubGlobal();
    };
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

  const copyText = (text: string, type: 'url' | 'token' | 'redirect') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else if (type === 'token') {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 2000);
    }
  };

  // Handle Save Custom Meta App Details
  const handleSaveMetaAppConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanAppId = metaAppIdInput.trim();
    const cleanConfigId = metaConfigIdInput.trim();
    const cleanSecret = metaAppSecretInput.trim();
    const cleanToken = metaSystemTokenInput.trim();
    const cleanWaba = metaWabaIdInput.trim();

    if (!cleanConfigId && !cleanAppId) {
      toast.showWarning('Details Missing', 'Kripya Configuration ID aur Meta App ID enter karein.');
      return;
    }

    const targetOrgId =
      organization?.id ||
      userProfile?.organizationId ||
      `org_${currentUser?.uid || 'user'}`;

    setSavingMetaConfig(true);

    try {
      await saveOrganizationMetaConfig(
        targetOrgId,
        {
          appId: cleanAppId,
          appSecret: cleanSecret || undefined,
          configId: cleanConfigId,
          systemUserToken: cleanToken || undefined,
          wabaId: cleanWaba || undefined,
        },
        syncGlobally
      );

      if (refreshProfile) {
        await refreshProfile().catch(() => {});
      }
      if (refreshMetaStatus) {
        await refreshMetaStatus().catch(() => {});
      }

      toast.showSuccess(
        'Meta App Configuration Saved Globally!',
        `Configuration ID (${cleanConfigId || 'Configured'}) aur Meta App ID (${cleanAppId || 'Configured'}) successfully save ho chuke hain aur sabhi Admin panels me synchronize ho chuke hain.`
      );
    } catch (err: any) {
      toast.showError('Save Failed', err?.message || 'Failed to save Meta App configuration.');
    } finally {
      setSavingMetaConfig(false);
    }
  };

  // Helper to open create modal for specific Sub-Admin
  const openCreateModalForAdmin = (adminUid: string) => {
    setNewRole('owner');
    setNewAssignedAdminId(adminUid);
    setNewDisplayName('');
    setNewPhoneOrEmail('');
    setNewPassword('12345678');
    setNewMaxNumbers(3);
    setNewMaxBroadcasts(10000);
    setNewPlanName('pro');
    setIsCreateModalOpen(true);
  };

  // Helper to open create modal for a new Sub-Admin
  const openCreateAdminModal = () => {
    setNewRole('admin');
    setNewAssignedAdminId('');
    setNewDisplayName('');
    setNewPhoneOrEmail('');
    setNewPassword('12345678');
    setNewMaxNumbers(50);
    setNewMaxBroadcasts(500000);
    setNewPlanName('enterprise');
    setIsCreateModalOpen(true);
  };

  const toggleAdminExpand = (adminUid: string) => {
    setExpandedAdmins((prev) => ({
      ...prev,
      [adminUid]: prev[adminUid] === false ? true : false,
    }));
  };

  const togglePasswordReveal = (uid: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [uid]: !prev[uid],
    }));
  };

  // Handle Create User or Sub-Admin
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisplayName.trim() || !newPhoneOrEmail.trim() || !newPassword.trim()) {
      toast.showWarning('Missing Info', 'Please provide name, mobile/email, and password.');
      return;
    }

    setCreatingUser(true);
    try {
      const managingAdminId =
        newRole === 'admin'
          ? undefined
          : isSuperMaster
          ? (newAssignedAdminId || allSubAdmins[0]?.uid || currentUser?.uid)
          : currentUser?.uid;

      await createManagedUser(currentUser?.uid || 'user', {
        displayName: newDisplayName.trim(),
        phoneOrEmail: newPhoneOrEmail.trim(),
        password: newPassword.trim(),
        role: newRole,
        maxWhatsAppNumbers: Number(newMaxNumbers),
        maxMonthlyBroadcasts: Number(newMaxBroadcasts),
        maxContacts: Number(newMaxContacts),
        validityDays: Number(newValidityDays),
        planName: newPlanName,
        coexistenceAllowed: newCoexistence,
        managedByAdminId: managingAdminId,
      });

      toast.showSuccess(
        newRole === 'admin' ? 'Sub-Admin Created' : 'Client User Created',
        `${newDisplayName} account created successfully under ${newRole === 'admin' ? 'Platform' : allSubAdmins.find(a => a.uid === managingAdminId)?.displayName || 'Admin'}.`
      );

      setIsCreateModalOpen(false);
      setNewDisplayName('');
      setNewPhoneOrEmail('');
      setNewPassword('12345678');
      setNewAssignedAdminId('');
    } catch (err: any) {
      toast.showError('Creation Failed', err?.message || 'Could not create account.');
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
    setEditStatus((u.subscription?.status as 'active' | 'expired' | 'suspended') || 'active');
    setEditAssignedAdminId(u.managedByAdminId || '');
  };

  // Handle Save Edit / Renewal
  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setSavingEdit(true);

    try {
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
        managedByAdminId: isSuperMaster ? (editAssignedAdminId || undefined) : undefined,
      });

      toast.showSuccess(
        'Account Updated',
        `Successfully updated limits and renewed plan for ${editingUser.displayName}.`
      );
      setEditingUser(null);
    } catch (err: any) {
      toast.showError('Update Failed', err?.message || 'Failed to update account.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (u: UserProfile) => {
    if (!confirm(`Are you sure you want to permanently delete "${u.displayName}" (${u.email || u.phone}) and their isolated database?`)) {
      return;
    }
    try {
      await deleteManagedUser(u.uid, u.organizationId);
      toast.showSuccess('Deleted', `Account ${u.displayName} removed.`);
    } catch (err: any) {
      toast.showError('Delete Failed', err?.message || 'Failed to delete account.');
    }
  };

  // List of all Sub-Admins / Reseller Admins
  const allSubAdmins: UserProfile[] = React.useMemo(() => {
    return users.filter(
      (u) =>
        u.uid !== 'admin_master_12345689' &&
        u.uid !== 'super_master_admin_9974428034' &&
        u.phone !== '12345689' &&
        (u.role === 'admin' || (u.role as string) === 'sub_admin')
    );
  }, [users]);

  const matchesSearch = (str?: string) => {
    if (!searchQuery.trim()) return true;
    return (str || '').toLowerCase().includes(searchQuery.toLowerCase().trim());
  };

  // Client users under a specific Admin
  const getClientsFor = (adm: UserProfile) => {
    return users.filter((u) => {
      if (u.role === 'master_admin' || u.role === 'admin' || u.uid === adm.uid) return false;
      const isUnder =
        u.managedByAdminId === adm.uid ||
        (adm.phone && u.managedByAdminId === adm.phone) ||
        (adm.email && u.managedByAdminId === adm.email) ||
        u.organizationId === adm.organizationId;
      if (!isUnder) return false;
      if (!searchQuery.trim()) return true;
      return (
        matchesSearch(u.displayName) ||
        matchesSearch(u.phone) ||
        matchesSearch(u.email) ||
        matchesSearch(adm.displayName)
      );
    });
  };

  // Direct platform users not claimed by any Sub-Admin
  const directUsers = users.filter((u) => {
    if (u.role === 'master_admin' || u.role === 'admin') return false;
    const isUnderAnyAdmin = allSubAdmins.some((adm) =>
      u.managedByAdminId === adm.uid ||
      (adm.phone && u.managedByAdminId === adm.phone) ||
      (adm.email && u.managedByAdminId === adm.email) ||
      u.organizationId === adm.organizationId
    );
    if (isUnderAnyAdmin) return false;
    return matchesSearch(u.displayName) || matchesSearch(u.phone) || matchesSearch(u.email);
  });

  // Client users for regular Sub-Admin (isolated to their own tenant)
  const subAdminMyUsers = users.filter((u) => {
    if (u.role === 'master_admin' || u.role === 'admin') return false;
    const isMine =
      u.managedByAdminId === currentUser?.uid ||
      (userProfile?.phone && u.managedByAdminId === userProfile.phone) ||
      u.organizationId === userProfile?.organizationId;
    if (!isMine) return false;
    if (!searchQuery.trim()) return true;
    return matchesSearch(u.displayName) || matchesSearch(u.phone) || matchesSearch(u.email);
  });

  // Filtered Sub-Admins for Super Master hierarchy view
  const filteredSubAdmins = allSubAdmins.filter((adm) => {
    if (!searchQuery.trim()) return true;
    const adminMatches =
      matchesSearch(adm.displayName) ||
      matchesSearch(adm.phone) ||
      matchesSearch(adm.email) ||
      matchesSearch(adm.organizationId);
    const underUsersMatch = users.some(
      (u) =>
        (u.managedByAdminId === adm.uid ||
          (adm.phone && u.managedByAdminId === adm.phone) ||
          (adm.email && u.managedByAdminId === adm.email) ||
          u.organizationId === adm.organizationId) &&
        (matchesSearch(u.displayName) || matchesSearch(u.phone) || matchesSearch(u.email))
    );
    return adminMatches || underUsersMatch;
  });

  // Handle reassigning user to an Admin
  const handleReassignUser = async () => {
    if (!reassigningUser || !reassignTargetAdminId) return;
    setSavingReassign(true);
    try {
      await reassignUserToAdmin(reassigningUser.uid, reassignTargetAdminId);
      const targetAdmin = allSubAdmins.find((a) => a.uid === reassignTargetAdminId);
      toast.showSuccess(
        'User Reassigned',
        `${reassigningUser.displayName} has been assigned to ${targetAdmin?.displayName || 'selected Admin'}.`
      );
      setReassigningUser(null);
    } catch (err: any) {
      toast.showError('Reassign Failed', err?.message || 'Could not reassign user.');
    } finally {
      setSavingReassign(false);
    }
  };

  const handleAssignAllUnassignedToPrimaryAdmin = async (unassignedList: UserProfile[]) => {
    if (unassignedList.length === 0 || allSubAdmins.length === 0) return;
    try {
      const targetAdmin = allSubAdmins[0]?.uid;
      if (!targetAdmin) return;
      for (const u of unassignedList) {
        await reassignUserToAdmin(u.uid, targetAdmin);
      }
      toast.showSuccess(
        'Assigned Successfully',
        `${unassignedList.length} users assigned successfully.`
      );
    } catch (err: any) {
      toast.showError('Assign Failed', err?.message || 'Failed to assign users.');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Workspace Settings &amp; Meta Cloud API</span>
            </h2>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800">
              Active Workspace
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Configure Meta Cloud API credentials, Embedded Signup settings, and real-time webhook logs.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{isSuperMaster ? 'Assign New Admin / User' : 'Create New User'}</span>
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
          <span>{isSuperMaster ? 'Admins & Client Accounts' : 'User Accounts & Limits'} ({users.length})</span>
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
          <span>Admin Meta App &amp; Embedded Signup Setup</span>
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

      {/* TAB 1: USERS & ADMINS LIST */}
      {activeTab === 'users' && (
        <div className="space-y-5">
          {/* Top Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
              <span className="text-neutral-500 font-medium">Sub-Admins (Resellers)</span>
              <p className="text-2xl font-bold text-purple-600 font-mono">
                {users.filter((u) => u.role === 'admin' || (u.role as string) === 'sub_admin').length}
              </p>
              <p className="text-[10px] text-neutral-400">Can manage their own client networks</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
              <span className="text-neutral-500 font-medium">Users Under Admins</span>
              <p className="text-2xl font-bold text-emerald-600 font-mono">
                {users.filter((u) => u.role !== 'admin' && u.role !== 'master_admin').length}
              </p>
              <p className="text-[10px] text-emerald-600">Client WhatsApp workspaces</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
              <span className="text-neutral-500 font-medium">Total Organizations</span>
              <p className="text-2xl font-bold text-neutral-900 dark:text-white font-mono">
                {organizations.length || users.length}
              </p>
              <p className="text-[10px] text-neutral-400">100% separate isolated databases</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
              <span className="text-neutral-500 font-medium">Expired / Due Renew</span>
              <p className="text-2xl font-bold text-amber-500 font-mono">
                {
                  users.filter((u) => {
                    if (!u.subscription?.expiresAt) return false;
                    return new Date(u.subscription.expiresAt).getTime() < Date.now();
                  }).length
                }
              </p>
              <p className="text-[10px] text-neutral-400">Quick 30/60/90 days extension</p>
            </div>
          </div>

          {/* Search, Filter & View Controls */}
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Admin name, Client name, Mobile, Org ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs font-bold"
                >
                  &times;
                </button>
              )}
            </div>

            {/* View Switcher & Action Buttons for Super Master Admin */}
            <div className="flex flex-wrap items-center gap-2">
              {isSuperMaster && (
                <div className="flex items-center p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                  <button
                    onClick={() => setViewMode('hierarchy')}
                    className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                      viewMode === 'hierarchy'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                    }`}
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                    <span>Hierarchy (Admins &amp; Users)</span>
                  </button>
                  <button
                    onClick={() => setViewMode('flat')}
                    className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                      viewMode === 'flat'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Flat Table</span>
                  </button>
                </div>
              )}

              {isSuperMaster && (
                <button
                  onClick={openCreateAdminModal}
                  className="px-3 py-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 hover:bg-purple-200 font-semibold border border-purple-200 dark:border-purple-800 flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>+ Assign New Admin</span>
                </button>
              )}

              <button
                onClick={() => {
                  setNewRole('owner');
                  setNewAssignedAdminId('');
                  setIsCreateModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Create Client User</span>
              </button>
            </div>
          </div>

          {/* VIEW 1: HIERARCHICAL TREE VIEW (ADMINS AND USERS UNDER EACH ADMIN) */}
          {isSuperMaster && viewMode === 'hierarchy' && (
            <div className="space-y-4">
              {(() => {
                const subAdmins = allSubAdmins;
                const matchesSearch = (str?: string) => {
                  if (!searchQuery.trim()) return true;
                  return (str || '').toLowerCase().includes(searchQuery.toLowerCase().trim());
                };

                const filteredSubAdmins = subAdmins.filter((adm) => {
                  if (!searchQuery.trim()) return true;
                  const adminMatches =
                    matchesSearch(adm.displayName) ||
                    matchesSearch(adm.phone) ||
                    matchesSearch(adm.email) ||
                    matchesSearch(adm.organizationId);
                  const underUsersMatch = users.some(
                    (u) =>
                      (u.managedByAdminId === adm.uid ||
                        (adm.phone && u.managedByAdminId === adm.phone) ||
                        (adm.email && u.managedByAdminId === adm.email) ||
                        u.organizationId === adm.organizationId) &&
                      (matchesSearch(u.displayName) || matchesSearch(u.phone) || matchesSearch(u.email))
                  );
                  return adminMatches || underUsersMatch;
                });

                // Client users under each admin
                const getClientsFor = (adm: UserProfile) => {
                  return users.filter((u) => {
                    if (u.role === 'master_admin' || u.role === 'admin' || (u.role as string) === 'sub_admin' || u.uid === adm.uid) return false;
                    const isExplicitlyUnder =
                      u.managedByAdminId === adm.uid ||
                      (adm.phone && u.managedByAdminId === adm.phone) ||
                      (adm.email && u.managedByAdminId === adm.email) ||
                      u.organizationId === adm.organizationId;

                    // If user is not under another sub-admin, and this adm is the primary admin (or only admin), group under this admin
                    const isUnderAnotherAdmin = subAdmins.some(
                      (other) =>
                        other.uid !== adm.uid &&
                        (u.managedByAdminId === other.uid ||
                          (other.phone && u.managedByAdminId === other.phone) ||
                          (other.email && u.managedByAdminId === other.email) ||
                          u.organizationId === other.organizationId)
                    );
                    const isDefaultAdminFallback =
                      !isUnderAnotherAdmin && subAdmins.length === 1;

                    const isUnder = isExplicitlyUnder || isDefaultAdminFallback;
                    if (!isUnder) return false;
                    if (!searchQuery.trim()) return true;
                    return (
                      matchesSearch(u.displayName) ||
                      matchesSearch(u.phone) ||
                      matchesSearch(u.email) ||
                      matchesSearch(adm.displayName)
                    );
                  });
                };

                // Direct Platform users (only if not under any sub-admin and not defaulted)
                const directUsers = users.filter((u) => {
                  if (u.role === 'master_admin' || u.role === 'admin' || (u.role as string) === 'sub_admin') return false;
                  const isUnderAnyAdmin = subAdmins.some((adm) => {
                    return (
                      u.managedByAdminId === adm.uid ||
                      (adm.phone && u.managedByAdminId === adm.phone) ||
                      (adm.email && u.managedByAdminId === adm.email) ||
                      u.organizationId === adm.organizationId
                    );
                  });
                  if (isUnderAnyAdmin) return false;
                  return matchesSearch(u.displayName) || matchesSearch(u.phone) || matchesSearch(u.email);
                });

                if (filteredSubAdmins.length === 0 && directUsers.length === 0) {
                  return (
                    <div className="p-12 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-center space-y-3 shadow-xs">
                      <ShieldCheck className="w-10 h-10 text-purple-400 mx-auto opacity-60" />
                      <p className="font-bold text-neutral-800 dark:text-neutral-200">
                        {searchQuery ? 'No Admins or Users match your search.' : 'No Sub-Admins created yet.'}
                      </p>
                      <p className="text-xs text-neutral-500 max-w-md mx-auto">
                        Super Master Admin can assign new Sub-Admins. Each Sub-Admin gets their own admin portal, isolated database, and can connect their own Meta App.
                      </p>
                      <button
                        onClick={openCreateAdminModal}
                        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs inline-flex items-center space-x-1.5 cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>+ Assign First Sub-Admin</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {/* SUB-ADMINS & CLIENTS UNDER THEM */}
                    {filteredSubAdmins.map((admin) => {
                      const clients = getClientsFor(admin);
                      const isExpanded = expandedAdmins[admin.uid] !== false;
                      const adminOrg = organizations.find((o) => o.id === admin.organizationId);
                      const metaConfig = adminOrg?.metaAppConfig;
                      const isMetaConfigured = Boolean(metaConfig?.appId && metaConfig?.configId);
                      const isPasswordShown = Boolean(revealedPasswords[admin.uid]);

                      return (
                        <div
                          key={admin.uid}
                          className="rounded-2xl border-2 border-purple-200/90 dark:border-purple-900/60 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden transition-all"
                        >
                          {/* ADMIN HEADER CARD */}
                          <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-50/80 via-neutral-50/50 to-white dark:from-purple-950/30 dark:via-neutral-900 dark:to-neutral-900 border-b border-purple-100 dark:border-neutral-800">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                              {/* Left: Admin identity, badges, and credentials */}
                              <div className="flex items-start space-x-3">
                                <button
                                  type="button"
                                  onClick={() => toggleAdminExpand(admin.uid)}
                                  className="p-1 rounded-lg text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors cursor-pointer mt-0.5"
                                  title={isExpanded ? 'Collapse Users List' : 'Expand Users List'}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-5 h-5" />
                                  ) : (
                                    <ChevronRight className="w-5 h-5" />
                                  )}
                                </button>

                                <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-base shrink-0 border border-purple-200 dark:border-purple-800 shadow-xs">
                                  {admin.displayName[0] || 'A'}
                                </div>

                                <div className="space-y-1.5 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-bold text-sm sm:text-base text-neutral-900 dark:text-white flex items-center space-x-1.5">
                                      <span>{admin.displayName}</span>
                                    </h3>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                      SUB-ADMIN
                                    </span>
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                      Org: {admin.organizationId}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                                      👥 {clients.length} Client User{clients.length === 1 ? '' : 's'} Under this Admin
                                    </span>
                                  </div>

                                  {/* Credentials & Meta status preview */}
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-300">
                                    <div className="flex items-center space-x-1 font-mono">
                                      <span className="text-neutral-400 text-[11px]">Login ID:</span>
                                      <strong className="text-purple-700 dark:text-purple-400">{admin.phone || admin.email}</strong>
                                    </div>

                                    <div className="flex items-center space-x-1 font-mono">
                                      <span className="text-neutral-400 text-[11px]">Pass:</span>
                                      <span>{isPasswordShown ? admin.loginPassword || '••••••••' : '••••••••'}</span>
                                      <button
                                        type="button"
                                        onClick={() => togglePasswordReveal(admin.uid)}
                                        className="p-0.5 text-neutral-400 hover:text-purple-600 cursor-pointer"
                                        title={isPasswordShown ? 'Hide Password' : 'Show Password'}
                                      >
                                        {isPasswordShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>

                                    {/* Meta App Config Status for this Admin */}
                                    <div className="flex items-center space-x-1">
                                      {isMetaConfigured ? (
                                        <div className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                          <span>Meta App Configured (App:</span>
                                          <MaskedIdDisplay
                                            value={metaConfig?.appId}
                                            label="Meta App ID"
                                            digitsToShow={1}
                                          />
                                          <span>)</span>
                                        </div>
                                      ) : (
                                        <span className="inline-flex items-center space-x-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                                          <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                                          <span>Meta App Pending Setup</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Sub-Admin limits badge */}
                                  <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-neutral-500">
                                    <span>Plan: <strong className="uppercase text-neutral-700 dark:text-neutral-300">{admin.subscription?.planName || 'Enterprise'}</strong></span>
                                    <span>&bull;</span>
                                    <span>Max Numbers: <strong className="text-neutral-700 dark:text-neutral-300">{admin.subscription?.maxWhatsAppNumbers ?? 50}</strong></span>
                                    <span>&bull;</span>
                                    <span>Broadcasts: <strong className="text-neutral-700 dark:text-neutral-300">{(admin.subscription?.maxMonthlyBroadcasts ?? 500000).toLocaleString()}</strong></span>
                                  </div>
                                </div>
                              </div>

                              {/* Right: Actions for this Sub-Admin */}
                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openCreateModalForAdmin(admin.uid)}
                                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>+ Add User under this Admin</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openEditModal(admin)}
                                  title="Edit Sub-Admin Limits & Renew"
                                  className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 transition-colors cursor-pointer"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>

                                {admin.uid !== currentUser?.uid && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(admin)}
                                    title="Delete Sub-Admin and their tenant"
                                    className="p-2 text-neutral-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-neutral-200 dark:border-neutral-700 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* USERS UNDER THIS SUB-ADMIN (NESTED TABLE) */}
                          {isExpanded && (
                            <div className="p-4 sm:p-5 bg-neutral-50/50 dark:bg-neutral-900/50 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Users className="w-4 h-4 text-purple-600" />
                                  <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                                    Client Users under {admin.displayName} ({clients.length})
                                  </h4>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openCreateModalForAdmin(admin.uid)}
                                  className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center space-x-1 cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Add Client User</span>
                                </button>
                              </div>

                              {clients.length === 0 ? (
                                <div className="p-6 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 text-center space-y-2 bg-white dark:bg-neutral-900">
                                  <p className="text-xs text-neutral-500">
                                    Is Sub-Admin ke under abhi koi client user nahi hai.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => openCreateModalForAdmin(admin.uid)}
                                    className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold cursor-pointer inline-flex items-center space-x-1 shadow-xs"
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    <span>+ Create First Client User for {admin.displayName}</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead>
                                        <tr className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 text-[10px] uppercase font-semibold border-b border-neutral-200 dark:border-neutral-800">
                                          <th className="py-2.5 px-3.5">Client User Name</th>
                                          <th className="py-2.5 px-3.5">Login Mobile / Pass</th>
                                          <th className="py-2.5 px-3.5">Plan &amp; Limits</th>
                                          <th className="py-2.5 px-3.5">Validity</th>
                                          <th className="py-2.5 px-3.5">Status</th>
                                          <th className="py-2.5 px-3.5 text-right">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                                        {clients.map((client) => {
                                          const isExpired = client.subscription?.expiresAt
                                            ? new Date(client.subscription.expiresAt).getTime() < Date.now()
                                            : false;
                                          const isPassShown = Boolean(revealedPasswords[client.uid]);

                                          return (
                                            <tr
                                              key={client.uid}
                                              className="hover:bg-purple-50/30 dark:hover:bg-neutral-800/50 transition-colors"
                                            >
                                              <td className="py-3 px-3.5">
                                                <div>
                                                  <div className="flex items-center space-x-1.5">
                                                    <p className="font-bold text-neutral-900 dark:text-white">
                                                      {client.displayName}
                                                    </p>
                                                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                                      CLIENT
                                                    </span>
                                                  </div>
                                                  <p className="text-[10px] text-neutral-400 font-mono">
                                                    Tenant Org: {client.organizationId}
                                                  </p>
                                                </div>
                                              </td>

                                              <td className="py-3 px-3.5 font-mono text-[11px]">
                                                <div className="space-y-0.5">
                                                  <p className="text-neutral-800 dark:text-neutral-200">
                                                    ID: <span className="font-semibold text-emerald-600">{client.phone || client.email}</span>
                                                  </p>
                                                  <p className="text-neutral-500 text-[10px] flex items-center space-x-1">
                                                    <span>Pass:</span>
                                                    <span>{isPassShown ? client.loginPassword || '••••••••' : '••••••••'}</span>
                                                    <button
                                                      type="button"
                                                      onClick={() => togglePasswordReveal(client.uid)}
                                                      className="p-0.5 text-neutral-400 hover:text-purple-600 cursor-pointer"
                                                    >
                                                      {isPassShown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                    </button>
                                                  </p>
                                                </div>
                                              </td>

                                              <td className="py-3 px-3.5">
                                                <div className="space-y-0.5 text-[11px]">
                                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                                                    {client.subscription?.planName || 'Pro'}
                                                  </span>
                                                  <p className="text-neutral-600 dark:text-neutral-400 text-[10px]">
                                                    Numbers: <strong>{client.subscription?.maxWhatsAppNumbers ?? 1}</strong> &bull; Broadcasts: <strong>{(client.subscription?.maxMonthlyBroadcasts ?? 1000).toLocaleString()}</strong>
                                                  </p>
                                                </div>
                                              </td>

                                              <td className="py-3 px-3.5">
                                                {client.subscription?.expiresAt ? (
                                                  <div>
                                                    <p
                                                      className={`font-medium text-[11px] ${
                                                        isExpired ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-neutral-700 dark:text-neutral-300'
                                                      }`}
                                                    >
                                                      {new Date(client.subscription.expiresAt).toLocaleDateString()}
                                                    </p>
                                                    <p className="text-[10px] text-neutral-400">
                                                      {isExpired
                                                        ? 'Expired'
                                                        : `${Math.ceil(
                                                            (new Date(client.subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                                                          )} days left`}
                                                    </p>
                                                  </div>
                                                ) : (
                                                  <span className="text-neutral-400 text-[11px]">No Expiry</span>
                                                )}
                                              </td>

                                              <td className="py-3 px-3.5">
                                                <span
                                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                    isExpired || client.subscription?.status === 'expired'
                                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                                                      : client.subscription?.status === 'suspended'
                                                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                                  }`}
                                                >
                                                  {isExpired ? 'EXPIRED' : (client.subscription?.status || 'ACTIVE').toUpperCase()}
                                                </span>
                                              </td>

                                              <td className="py-3 px-3.5 text-right">
                                                <div className="flex items-center justify-end space-x-1.5">
                                                  <button
                                                    type="button"
                                                    onClick={() => openEditModal(client)}
                                                    title="Edit limits & Renew validity"
                                                    className="p-1.5 text-neutral-500 hover:text-purple-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                                                  >
                                                    <Edit className="w-3.5 h-3.5" />
                                                  </button>

                                                  {isSuperMaster && allSubAdmins.length > 1 && (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setReassigningUser(client);
                                                        setReassignTargetAdminId(admin.uid);
                                                      }}
                                                      title="Move to another Admin"
                                                      className="p-1.5 text-neutral-500 hover:text-purple-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                                                    >
                                                      <FolderTree className="w-3.5 h-3.5" />
                                                    </button>
                                                  )}

                                                  <button
                                                    type="button"
                                                    onClick={() => handleDeleteUser(client)}
                                                    title="Delete client account"
                                                    className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
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
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* DIRECT PLATFORM USERS (USERS NOT UNDER ANY SUB-ADMIN) */}
                    {directUsers.length > 0 && (
                      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3 shadow-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Crown className="w-4 h-4 text-amber-500" />
                            <h4 className="font-bold text-xs uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                              Direct Platform Users (Super Master Admin Direct Clients) ({directUsers.length})
                            </h4>
                          </div>
                          <span className="text-[11px] text-neutral-500">Not assigned under any Sub-Admin</span>
                        </div>

                        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 text-[10px] uppercase font-semibold border-b border-neutral-200 dark:border-neutral-800">
                                <th className="py-2.5 px-3.5">User Name</th>
                                <th className="py-2.5 px-3.5">Login Mobile / Pass</th>
                                <th className="py-2.5 px-3.5">Plan &amp; Limits</th>
                                <th className="py-2.5 px-3.5">Validity</th>
                                <th className="py-2.5 px-3.5">Status</th>
                                <th className="py-2.5 px-3.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                              {directUsers.map((du) => {
                                const isExpired = du.subscription?.expiresAt
                                  ? new Date(du.subscription.expiresAt).getTime() < Date.now()
                                  : false;
                                const isPassShown = Boolean(revealedPasswords[du.uid]);

                                return (
                                  <tr key={du.uid} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50">
                                    <td className="py-3 px-3.5">
                                      <p className="font-bold text-neutral-900 dark:text-white">{du.displayName}</p>
                                      <p className="text-[10px] text-neutral-400 font-mono">Org: {du.organizationId}</p>
                                    </td>
                                    <td className="py-3 px-3.5 font-mono text-[11px]">
                                      <p className="text-emerald-600 font-semibold">{du.phone || du.email}</p>
                                      <p className="text-neutral-500 text-[10px] flex items-center space-x-1">
                                        <span>Pass:</span>
                                        <span>{isPassShown ? du.loginPassword || '••••••••' : '••••••••'}</span>
                                        <button
                                          type="button"
                                          onClick={() => togglePasswordReveal(du.uid)}
                                          className="p-0.5 text-neutral-400 hover:text-purple-600 cursor-pointer"
                                        >
                                          {isPassShown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                        </button>
                                      </p>
                                    </td>
                                    <td className="py-3 px-3.5 text-[11px]">
                                      <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                                        {du.subscription?.planName || 'Standard'}
                                      </span>
                                      <p className="text-[10px] text-neutral-500 mt-0.5">
                                        {du.subscription?.maxWhatsAppNumbers ?? 1} Numbers &bull; {(du.subscription?.maxMonthlyBroadcasts ?? 1000).toLocaleString()} Broadcasts
                                      </p>
                                    </td>
                                    <td className="py-3 px-3.5 text-[11px]">
                                      {du.subscription?.expiresAt
                                        ? new Date(du.subscription.expiresAt).toLocaleDateString()
                                        : 'No Expiry'}
                                    </td>
                                    <td className="py-3 px-3.5">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                          isExpired
                                            ? 'bg-rose-50 text-rose-700'
                                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                        }`}
                                      >
                                        {isExpired ? 'EXPIRED' : (du.subscription?.status || 'ACTIVE').toUpperCase()}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3.5 text-right">
                                      <div className="flex items-center justify-end space-x-1.5">
                                        <button
                                          type="button"
                                          onClick={() => openEditModal(du)}
                                          title="Reassign to Sub-Admin or Edit Limits"
                                          className="p-1.5 text-neutral-500 hover:text-purple-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                                        >
                                          <Edit className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteUser(du)}
                                          title="Delete user"
                                          className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
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
                  </div>
                );
              })()}
            </div>
          )}

          {/* VIEW 2: FLAT TABLE VIEW OR SUB-ADMIN VIEW */}
          {(!isSuperMaster || viewMode === 'flat') && (
            <div className="space-y-4">
              {/* Filter Pills */}
              {isSuperMaster && (
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-neutral-400 text-[11px]">Filter Category:</span>
                  <button
                    onClick={() => setUserFilter('all')}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      userFilter === 'all'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    All ({users.length})
                  </button>
                  <button
                    onClick={() => setUserFilter('admins')}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      userFilter === 'admins'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Admins Only ({users.filter((u) => u.role === 'admin' || u.role === 'master_admin').length})
                  </button>
                  <button
                    onClick={() => setUserFilter('clients')}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      userFilter === 'clients'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    Client Users ({users.filter((u) => u.role === 'owner' || u.role === 'agent').length})
                  </button>
                </div>
              )}

              {/* User Flat Table */}
              {(() => {
                const filteredUsers: UserProfile[] = users.filter((u: UserProfile) => {
                  if (!isSuperMaster) {
                    if (u.uid === currentUser?.uid) return true;
                    return (
                      u.managedByAdminId === currentUser?.uid ||
                      (userProfile?.phone && u.managedByAdminId === userProfile.phone) ||
                      (currentUser?.email && u.managedByAdminId === currentUser.email) ||
                      u.organizationId === userProfile?.organizationId
                    );
                  }
                  if (userFilter === 'admins') {
                    if (u.role !== 'admin' && u.role !== 'master_admin' && (u.role as string) !== 'sub_admin') return false;
                  } else if (userFilter === 'clients') {
                    if (u.role === 'admin' || u.role === 'master_admin' || (u.role as string) === 'sub_admin') return false;
                  }
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase().trim();
                  return (
                    (u.displayName || '').toLowerCase().includes(q) ||
                    (u.phone || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.organizationId || '').toLowerCase().includes(q)
                  );
                });

                return (
                  <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                            <th className="py-3 px-4">Account &amp; Hierarchy</th>
                            <th className="py-3 px-4">Login Credentials</th>
                            <th className="py-3 px-4">Assigned Admin</th>
                            <th className="py-3 px-4">Plan &amp; Limits</th>
                            <th className="py-3 px-4">Validity / Expiry</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                          {filteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-10 text-center text-neutral-400">
                                No accounts found in this category.
                              </td>
                            </tr>
                          ) : (
                            filteredUsers.map((u: UserProfile) => {
                          const isExpired = u.subscription?.expiresAt
                            ? new Date(u.subscription.expiresAt).getTime() < Date.now()
                            : false;
                          const assignedAdmin = users.find(
                            (a) => a.uid === u.managedByAdminId || a.phone === u.managedByAdminId
                          );

                          return (
                            <tr key={u.uid} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors">
                              <td className="py-3.5 px-4">
                                <div>
                                  <div className="flex items-center space-x-1.5">
                                    <p className="font-semibold text-neutral-900 dark:text-white">{u.displayName}</p>
                                    {u.role === 'master_admin' ? (
                                      <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold px-1.5 py-0.2 rounded border border-amber-200">
                                        MASTER
                                      </span>
                                    ) : u.role === 'admin' ? (
                                      <span className="text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold px-1.5 py-0.2 rounded border border-purple-200">
                                        SUB-ADMIN
                                      </span>
                                    ) : (
                                      <span className="text-[9px] bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 font-semibold px-1.5 py-0.2 rounded">
                                        CLIENT
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
                                {u.role === 'master_admin' ? (
                                  <span className="text-amber-600 font-medium text-[11px]">Root Platform</span>
                                ) : u.role === 'admin' ? (
                                  <span className="text-purple-600 font-semibold text-[11px]">Sub-Admin Portal</span>
                                ) : assignedAdmin ? (
                                  <span className="text-neutral-800 dark:text-neutral-200 font-medium text-[11px]">
                                    {assignedAdmin.displayName}
                                  </span>
                                ) : (
                                  <span className="text-neutral-400 text-[11px]">Super Master Direct</span>
                                )}
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="space-y-0.5 text-[11px]">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                                    {u.subscription?.planName || 'Standard'}
                                  </span>
                                  <p className="text-neutral-600 dark:text-neutral-400 text-[10px]">
                                    Numbers: <strong>{u.subscription?.maxWhatsAppNumbers ?? 1}</strong> &bull; Broadcasts: <strong>{(u.subscription?.maxMonthlyBroadcasts ?? 1000).toLocaleString()}</strong>
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
                                      title="Delete account and isolated database"
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
            );
          })()}
        </div>
          )}
        </div>
      )}

      {/* TAB 2: META APP & EMBEDDED SIGNUP (DETAILS PROVIDED BY PLATFORM & BLANK FIELDS FOR ADMIN'S OWN META APP) */}
      {activeTab === 'meta_app' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveMetaAppConfig} className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
            <div>
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                  Admin Meta App &amp; Embedded Signup Integration Settings
                </h3>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Yahan aap apna <strong>khud ka Meta App</strong> connect kar sakte hain. Website ki taraf se jo details Meta Console me daalni hoti hain wo neeche <strong>Read-Only</strong> di gayi hain, aur aapke Meta App ki details ke liye <strong>Input Fields blank</strong> chhod di gayi hain taaki aap apni details fill karke save kar sakein.
              </p>
            </div>

            {/* SECTION A: ADMIN META APP INPUT FIELDS (FILL YOUR DETAILS HERE) */}
            <div className="p-5 rounded-2xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center space-x-1.5">
                  <Lock className="w-4 h-4" />
                  <span>1. Fill Your Meta App Details (Meta Developer Console Se Le Kar Daalein)</span>
                </span>
                <span className="text-[11px] text-neutral-500">Embedded Signup ke liye Configuration ID &amp; App ID zaroori hain</span>
              </div>

              {/* Status Banner */}
              {metaConfigIdInput.trim() && metaAppIdInput.trim() ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start space-x-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      Embedded Signup Setup Ready! (Dono Details Filled)
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                      <div className="flex items-center space-x-1">
                        <span>Config ID:</span>
                        <MaskedIdDisplay
                          value={metaConfigIdInput.trim()}
                          label="Configuration ID"
                          digitsToShow={1}
                          badgeClassName="font-mono font-bold text-emerald-900 dark:text-emerald-200"
                        />
                      </div>
                      <span>|</span>
                      <div className="flex items-center space-x-1">
                        <span>App ID:</span>
                        <MaskedIdDisplay
                          value={metaAppIdInput.trim()}
                          label="Meta App ID"
                          digitsToShow={1}
                          badgeClassName="font-mono font-bold text-emerald-900 dark:text-emerald-200"
                        />
                      </div>
                      {metaAppSecretInput.trim() ? (
                        <>
                          <span>|</span>
                          <span>App Secret: (Saved)</span>
                        </>
                      ) : (
                        <>
                          <span>|</span>
                          <span>App Secret: (Optional - direct connect token bhi chalega)</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start space-x-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      Embedded Signup ke liye dono details (Configuration ID + Meta App ID) fill karke Save karein.
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      Agar aapke paas App Secret nahi hai, tab bhi aap Configuration ID aur Meta App ID daal kar Save kar sakte hain!
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* 1. Configuration ID */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 block">
                    <span>Facebook Login for Business: Configuration ID <span className="text-red-500">*</span></span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={metaConfigIdInput}
                    onChange={(e) => setMetaConfigIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Meta Developers &gt; WhatsApp &gt; Quickstart &gt; Configuration ID (Coexistence onboarding ke liye).
                  </p>
                </div>

                {/* 2. Meta App ID */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 block">
                    <span>Meta App ID <span className="text-red-500">*</span></span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={metaAppIdInput}
                    onChange={(e) => setMetaAppIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Aapke Meta App dashboard ke top-left me diya gaya App ID.
                  </p>
                </div>

                {metaConfigIdInput.trim() === metaAppIdInput.trim() && metaConfigIdInput.trim().length > 0 && (
                  <div className="md:col-span-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-semibold">Dhyaan Dein: Configuration ID aur Meta App ID same nahi hote!</span>
                      <p className="leading-relaxed">
                        Aapne dono me ek hi number (<code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">{metaAppIdInput.trim()}</code>) daala hua hai. 
                        Isi wajah se Facebook popup me <strong>&quot;Invalid parameter: config_id is required&quot;</strong> error aata hai.
                        Apne Meta Developer Dashboard me jakar <strong>WhatsApp &gt; Quickstart</strong> ya <strong>Facebook Login for Business &gt; Configurations</strong> me se apna asli <strong>Configuration ID</strong> copy karein aur pehle box me paste karein.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. App Secret */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-between">
                    <span>Meta App Secret <span className="text-neutral-400 font-normal">(Optional / Server Token Exchange ke liye)</span></span>
                  </label>
                  <input
                    type="password"
                    placeholder="•••••••••••••••••••••••••••••••• (Leave blank if not ready)"
                    value={metaAppSecretInput}
                    onChange={(e) => setMetaAppSecretInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    App Settings &gt; Basic &gt; App Secret (Popup authorization ke baad auto token exchange ke liye zaroori hota hai).
                  </p>
                </div>

                {/* 4. System User Access Token */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-between">
                    <span>System User Access Token (Permanent Token)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="EAAB..."
                    value={metaSystemTokenInput}
                    onChange={(e) => setMetaSystemTokenInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Business Manager &gt; System Users &gt; Generate Token (Permanent broadcast sending).
                  </p>
                </div>

                {/* 5. Default WABA ID */}
                <div className="space-y-1 md:col-span-2">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 block">
                    <span>WhatsApp Business Account ID (WABA ID) (Optional)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={metaWabaIdInput}
                    onChange={(e) => setMetaWabaIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-neutral-500">
                    Aapka main WABA ID jahan approved templates create aur manage hote hain.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingMetaConfig}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs flex items-center space-x-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingMetaConfig ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Meta App...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Meta App Configuration</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* SECTION B: DETAILS PROVIDED BY OUR WEBSITE TO PASTE IN META CONSOLE */}
            <div className="p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 space-y-4">
              <span className="font-bold text-xs uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center space-x-1.5">
                <Globe className="w-4 h-4" />
                <span>2. Details Provided By Website (Copy &amp; Paste in Your Meta Developer Console)</span>
              </span>

              <div className="space-y-3.5 text-xs">
                {/* 1. Valid OAuth Redirect URIs */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Valid OAuth Redirect URIs (Facebook Login for Business &gt; Settings)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://wp-api-palan.vercel.app/'}
                      className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs text-neutral-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => copyText(typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://wp-api-palan.vercel.app/', 'redirect')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center space-x-1 cursor-pointer shrink-0"
                    >
                      {copiedRedirect ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedRedirect ? 'Copied' : 'Copy URI'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    Meta App Console &gt; Facebook Login for Business &gt; Settings &gt; Valid OAuth Redirect URIs me ise paste karein.
                  </p>
                </div>

                {/* 2. Webhook Callback URL */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Webhook Callback URL (WhatsApp &gt; Configuration &gt; Webhook)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== 'undefined' ? `${window.location.origin}/api/meta/webhook` : 'https://wp-api-palan.vercel.app/api/meta/webhook'}
                      className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs text-neutral-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => copyText(typeof window !== 'undefined' ? `${window.location.origin}/api/meta/webhook` : 'https://wp-api-palan.vercel.app/api/meta/webhook', 'url')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center space-x-1 cursor-pointer shrink-0"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUrl ? 'Copied' : 'Copy Callback'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    Meta App Console &gt; WhatsApp &gt; Configuration &gt; Callback URL me ise paste karein.
                  </p>
                </div>

                {/* 3. Webhook Verify Token */}
                <div className="space-y-1">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Verify Token (Webhook Verification)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value="cloudwaba_verify_token_secure"
                      className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs text-neutral-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('cloudwaba_verify_token_secure', 'token')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center space-x-1 cursor-pointer shrink-0"
                    >
                      {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedToken ? 'Copied' : 'Copy Token'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500">
                    Webhook setup karte waqt Meta Verify Token me <code>cloudwaba_verify_token_secure</code> paste karein.
                  </p>
                </div>

                {/* 4. App Domains & URLs for Basic Settings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 space-y-1">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">App Domain</span>
                    <p className="font-mono text-xs text-neutral-900 dark:text-white select-all">
                      {typeof window !== 'undefined' ? window.location.hostname : 'wp-api-palan.vercel.app'}
                    </p>
                    <p className="text-[10px] text-neutral-400">Settings &gt; Basic &gt; App Domains</p>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 space-y-1">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase">Privacy Policy URL</span>
                    <p className="font-mono text-xs text-neutral-900 dark:text-white select-all">
                      {typeof window !== 'undefined' ? `${window.location.origin}/privacy` : 'https://wp-api-palan.vercel.app/privacy'}
                    </p>
                    <p className="text-[10px] text-neutral-400">Settings &gt; Basic &gt; Privacy Policy URL</p>
                  </div>
                </div>
              </div>
            </div>
          </form>
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

      {/* CREATE NEW ADMIN OR USER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-neutral-900 dark:text-white text-base">
                  {isSuperMaster ? 'Create Account (Sub-Admin or Client)' : 'Create New Client User'}
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
              {/* Account Role Selector if Master Admin */}
              {isSuperMaster && (
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Account Type / Role <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewRole('admin')}
                      className={`p-3 rounded-xl border text-left flex items-start space-x-2 transition-all cursor-pointer ${
                        newRole === 'admin'
                          ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-950/40 text-purple-950 dark:text-purple-300'
                          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-xs">Sub-Administrator</p>
                        <p className="text-[10px] text-neutral-500">Can manage users &amp; add their own Meta App</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewRole('owner')}
                      className={`p-3 rounded-xl border text-left flex items-start space-x-2 transition-all cursor-pointer ${
                        newRole === 'owner'
                          ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-300'
                          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600'
                      }`}
                    >
                      <Users className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-xs">Client User</p>
                        <p className="text-[10px] text-neutral-500">Normal WhatsApp Business account</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Name / Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Admin / Global Marketing"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Login Mobile Number or Email <span className="text-red-500">*</span>
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
                  Limitations &amp; Validity Package
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
                      Max Numbers
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
                    Allow Coexistence Mode (WhatsApp App + Cloud API simultaneously)
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
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Create Account</span>
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
                  Renew / Edit Account: {editingUser.displayName}
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

              {isSuperMaster && editingUser.role !== 'master_admin' && (
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Managing Admin (Assigned Under)
                  </label>
                  <select
                    value={editAssignedAdminId}
                    onChange={(e) => setEditAssignedAdminId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium"
                  >
                    <option value="">-- Platform Direct (Default Primary Admin) --</option>
                    {allSubAdmins.map((adm) => (
                      <option key={adm.uid} value={adm.uid}>
                        {adm.displayName} ({adm.phone || adm.email}) - Org: {adm.organizationId}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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

      {/* REASSIGN TO ADMIN MODAL */}
      {reassigningUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center space-x-2">
                <FolderTree className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-sm text-neutral-900 dark:text-white">
                  Move User Under Another Admin
                </h3>
              </div>
              <button
                onClick={() => setReassigningUser(null)}
                className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <p className="text-neutral-600 dark:text-neutral-400">
                Move user account <strong className="text-neutral-900 dark:text-white">{reassigningUser.displayName}</strong> ({reassigningUser.phone || reassigningUser.email}) under a different Sub-Admin.
              </p>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Select New Managing Admin
                </label>
                <select
                  value={reassignTargetAdminId}
                  onChange={(e) => setReassignTargetAdminId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-medium"
                >
                  <option value="">-- Choose Admin --</option>
                  {allSubAdmins.map((adm) => (
                    <option key={adm.uid} value={adm.uid}>
                      {adm.displayName} ({adm.phone || adm.email}) - Org: {adm.organizationId}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setReassigningUser(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReassignUser}
                  disabled={savingReassign || !reassignTargetAdminId}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {savingReassign ? 'Moving...' : 'Confirm Move to Admin'}
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
