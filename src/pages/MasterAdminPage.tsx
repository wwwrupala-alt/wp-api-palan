import React, { useEffect, useState } from 'react';
import {
  Crown,
  Users,
  Smartphone,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  RefreshCw,
  Plus,
  Search,
  LogIn,
  Edit,
  Trash2,
  KeyRound,
  Layers,
  Terminal,
  Settings,
  Calendar,
  Zap,
  Activity,
  X,
  Loader2,
  Check,
  ChevronRight,
  UserCheck,
  Ban,
  Building,
  Save,
  Copy,
  Eye,
  EyeOff,
  Minus,
  TrendingDown,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  ArrowUpDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { SaaSPlan, AuditLog } from '../types/index.ts';

interface AdminTenantItem {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  displayPassword?: string;
  role: string;
  organizationId: string;
  subscription?: {
    planId?: string;
    planName?: string;
    maxWhatsAppNumbers?: number;
    maxUsers?: number;
    maxMonthlyBroadcasts?: number;
    expiresAt?: string;
    status?: string;
  };
  usersCount?: number;
  whatsAppCount?: number;
  campaignsCount?: number;
  createdAt: string;
}

export const MasterAdminPage: React.FC = () => {
  const { impersonateAdmin, impersonateUser, userProfile, getServerNow } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'admins' | 'plans' | 'features' | 'audit' | 'system'>('admins');
  const [loading, setLoading] = useState(true);

  // Overview metrics
  const [overview, setOverview] = useState<any>({
    totalAdmins: 0,
    activeAdmins: 0,
    suspendedAdmins: 0,
    totalUsers: 0,
    activeUsers: 0,
    totalWhatsAppNumbers: 0,
    totalCampaigns: 0,
    totalMessages: 0,
    totalDelivered: 0,
    expiringPlans: 0,
    systemHealth: 'HEALTHY',
    version: '3.2.0 (Multi-Tenant Enterprise)',
  });

  // Admins List & Advanced Filters
  const [admins, setAdmins] = useState<AdminTenantItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [validityFilter, setValidityFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [whatsappFilter, setWhatsappFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');

  // Plans List
  const [plans, setPlans] = useState<SaaSPlan[]>([]);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Feature Flags
  const [features, setFeatures] = useState<Record<string, boolean>>({
    campaign_analytics: true,
    automations_bot: true,
    coexistence_mode: true,
    embedded_signup: true,
    export_data: true,
    api_webhooks: true,
  });

  // Modal: Create Admin
  const [isCreateAdminOpen, setIsCreateAdminOpen] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newBusinessName, setNewBusinessName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('Admin@12345');
  const [newPlanId, setNewPlanId] = useState('plan_pro');
  const [newValidityDays, setNewValidityDays] = useState(30);
  const [newMaxWhatsApp, setNewMaxWhatsApp] = useState(1);
  const [newMaxUsers, setNewMaxUsers] = useState(10);

  // Success Dialog: Created Admin Credentials
  const [createdAdminSuccess, setCreatedAdminSuccess] = useState<{
    name: string;
    phone: string;
    email: string;
    password: string;
    uid: string;
    organizationId?: string;
    expiresAt?: string;
    validityDays?: number;
  } | null>(null);
  const [copiedSuccessCredentials, setCopiedSuccessCredentials] = useState(false);

  // Modal: Edit Admin / Renew Plan / Reduce Validity
  const [editingAdmin, setEditingAdmin] = useState<AdminTenantItem | null>(null);
  const [validityMode, setValidityMode] = useState<'adjust_days' | 'set_exact_days' | 'pick_date'>('adjust_days');
  const [adjustType, setAdjustType] = useState<'add' | 'reduce'>('add');
  const [editDaysToAdd, setEditDaysToAdd] = useState(30);
  const [directDaysInput, setDirectDaysInput] = useState(30);
  const [customDateInput, setCustomDateInput] = useState('');
  const [editMaxWhatsApp, setEditMaxWhatsApp] = useState(5);
  const [editMaxUsers, setEditMaxUsers] = useState(10);
  const [editPlanName, setEditPlanName] = useState('');
  const [editStatus, setEditStatus] = useState<string>('active');
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal: Reset Password
  const [resettingAdmin, setResettingAdmin] = useState<AdminTenantItem | null>(null);
  const [newPassInput, setNewPassInput] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  // Modal: Delete Admin
  const [deletingAdmin, setDeletingAdmin] = useState<AdminTenantItem | null>(null);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);

  // Modal: View Team Users of Admin & Direct Watch
  const [viewingAdminUsers, setViewingAdminUsers] = useState<AdminTenantItem | null>(null);
  const [adminUsersList, setAdminUsersList] = useState<any[]>([]);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [revealUserPasswordId, setRevealUserPasswordId] = useState<string | null>(null);

  // Modal: Reset Team User Password (from Master Admin)
  const [resettingTenantUser, setResettingTenantUser] = useState<any | null>(null);
  const [newUserPassInput, setNewUserPassInput] = useState('');
  const [savingUserPass, setSavingUserPass] = useState(false);

  // Reveal Admin password toggle map
  const [revealedAdminPassUids, setRevealedAdminPassUids] = useState<Record<string, boolean>>({});

  // Load all master data
  const loadMasterData = async () => {
    setLoading(true);
    try {
      const [ovRes, admRes, plnRes, audRes, featRes] = await Promise.all([
        fetch('/api/master/overview'),
        fetch('/api/master/admins'),
        fetch('/api/master/plans'),
        fetch('/api/master/audit-logs'),
        fetch('/api/master/features'),
      ]);

      if (ovRes.ok) setOverview(await ovRes.json());
      if (admRes.ok) {
        const d = await admRes.json();
        setAdmins(d.admins || []);
      }
      if (plnRes.ok) {
        const d = await plnRes.json();
        setPlans(d.plans || []);
      }
      if (audRes.ok) {
        const d = await audRes.json();
        setAuditLogs(d.logs || []);
      }
      if (featRes.ok) {
        const d = await featRes.json();
        setFeatures(d.features || {});
      }
    } catch (err) {
      console.warn('Failed to load master admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMasterData();
  }, []);

  // Quick status counts for filter chips
  const nowMs = Date.now();
  const totalCount = admins.length;
  const activeCount = admins.filter((a) => a.subscription?.status !== 'suspended').length;
  const suspendedCount = admins.filter((a) => a.subscription?.status === 'suspended').length;
  const expiredCount = admins.filter((a) => {
    const exp = a.subscription?.expiresAt;
    if (!exp || isNaN(new Date(exp).getTime())) return false;
    const diff = Math.ceil((new Date(exp).getTime() - nowMs) / (1000 * 60 * 60 * 24));
    return new Date(exp).getTime() < nowMs || diff <= 0;
  }).length;
  const expiringSoonCount = admins.filter((a) => {
    const exp = a.subscription?.expiresAt;
    if (!exp || isNaN(new Date(exp).getTime())) return false;
    const diff = Math.ceil((new Date(exp).getTime() - nowMs) / (1000 * 60 * 60 * 24));
    return new Date(exp).getTime() >= nowMs && diff > 0 && diff <= 7;
  }).length;

  // Available unique plans across admins & registered plans
  const availablePlanNames = Array.from(
    new Set(
      admins
        .map((a) => a.subscription?.planName || 'Professional')
        .concat(plans.map((p) => p.name))
        .filter(Boolean)
    )
  );

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    statusFilter !== 'all' ||
    validityFilter !== 'all' ||
    planFilter !== 'all' ||
    whatsappFilter !== 'all' ||
    sortBy !== 'newest';

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setValidityFilter('all');
    setPlanFilter('all');
    setWhatsappFilter('all');
    setSortBy('newest');
  };

  // Filtered & Sorted Admins
  const filteredAdmins = admins
    .filter((adm) => {
      // 1. Search Query
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (adm.displayName || '').toLowerCase().includes(q) ||
        (adm.email || '').toLowerCase().includes(q) ||
        (adm.phone || '').includes(q) ||
        (adm.organizationId || '').toLowerCase().includes(q) ||
        (adm.subscription?.planName || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // 2. Status Filter
      const isSuspended = adm.subscription?.status === 'suspended';
      if (statusFilter === 'active' && isSuspended) return false;
      if (statusFilter === 'suspended' && !isSuspended) return false;

      // 3. Validity Filter
      const expiresAt = adm.subscription?.expiresAt;
      const hasExpiry = Boolean(expiresAt && !isNaN(new Date(expiresAt).getTime()));
      const daysRemaining = hasExpiry
        ? Math.max(0, Math.ceil((new Date(expiresAt!).getTime() - nowMs) / (1000 * 60 * 60 * 24)))
        : null;
      const isExpired = hasExpiry && (new Date(expiresAt!).getTime() < nowMs || daysRemaining === 0);

      if (validityFilter === 'expired' && !isExpired) return false;
      if (validityFilter === 'expiring_7' && (isExpired || daysRemaining === null || daysRemaining > 7)) return false;
      if (validityFilter === 'expiring_15' && (isExpired || daysRemaining === null || daysRemaining > 15)) return false;
      if (validityFilter === 'active_valid' && (isExpired || (daysRemaining !== null && daysRemaining <= 15))) return false;
      if (validityFilter === 'unlimited' && hasExpiry) return false;

      // 4. Plan Filter
      if (planFilter !== 'all') {
        const adminPlan = (adm.subscription?.planName || 'Professional').toLowerCase();
        if (adminPlan !== planFilter.toLowerCase()) return false;
      }

      // 5. WhatsApp Numbers Filter
      const waCount = adm.whatsAppCount || 0;
      if (whatsappFilter === 'with_numbers' && waCount === 0) return false;
      if (whatsappFilter === 'no_numbers' && waCount > 0) return false;

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      if (sortBy === 'validity_asc') {
        const expA = a.subscription?.expiresAt ? new Date(a.subscription.expiresAt).getTime() : 9999999999999;
        const expB = b.subscription?.expiresAt ? new Date(b.subscription.expiresAt).getTime() : 9999999999999;
        return expA - expB;
      }
      if (sortBy === 'validity_desc') {
        const expA = a.subscription?.expiresAt ? new Date(a.subscription.expiresAt).getTime() : 0;
        const expB = b.subscription?.expiresAt ? new Date(b.subscription.expiresAt).getTime() : 0;
        return expB - expA;
      }
      if (sortBy === 'users_desc') {
        return (b.usersCount || 0) - (a.usersCount || 0);
      }
      if (sortBy === 'name_asc') {
        return (a.displayName || '').localeCompare(b.displayName || '');
      }
      return 0;
    });

  // Handle Create Admin
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminName.trim() || !newAdminPassword.trim() || (!newAdminEmail.trim() && !newAdminPhone.trim())) {
      toast.showWarning('Missing Details', 'Please fill name, email/mobile and initial password.');
      return;
    }

    setCreatingAdmin(true);
    try {
      const res = await fetch('/api/master/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminName: newAdminName.trim(),
          businessName: newBusinessName.trim() || `${newAdminName}'s Workspace`,
          email: newAdminEmail.trim(),
          phone: newAdminPhone.trim(),
          password: newAdminPassword.trim(),
          planId: newPlanId,
          validityDays: Number(newValidityDays),
          maxWhatsAppNumbers: Number(newMaxWhatsApp),
          maxUsers: Number(newMaxUsers),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create Admin.');
      }

      toast.showSuccess(
        'Admin Created Successfully!',
        `${newAdminName} has been provisioned with a fresh 0-data tenant workspace.`
      );
      
      const createdInfo = {
        name: newAdminName.trim(),
        phone: data.admin?.phone || newAdminPhone.trim(),
        email: data.admin?.email || newAdminEmail.trim(),
        password: newAdminPassword.trim(),
        uid: data.admin?.uid || '',
        organizationId: data.admin?.organizationId,
        expiresAt: data.admin?.expiresAt,
        validityDays: data.admin?.validityDays || Number(newValidityDays) || 30,
      };

      setCreatedAdminSuccess(createdInfo);
      setIsCreateAdminOpen(false);
      setNewAdminName('');
      setNewBusinessName('');
      setNewAdminEmail('');
      setNewAdminPhone('');
      setNewAdminPassword('Admin@12345');
      setNewMaxWhatsApp(1);
      setNewValidityDays(30);
      await loadMasterData();
    } catch (err: any) {
      toast.showError('Creation Error', err.message || 'Could not create Admin.');
    } finally {
      setCreatingAdmin(false);
    }
  };

  // Open Edit Admin Modal with initial values
  const handleOpenEditAdmin = (adm: AdminTenantItem) => {
    setEditingAdmin(adm);
    setValidityMode('adjust_days');
    setAdjustType('add');
    setEditDaysToAdd(30);

    const currentExpiry = adm.subscription?.expiresAt;
    const currentDaysLeft = currentExpiry
      ? Math.max(0, Math.ceil((new Date(currentExpiry).getTime() - Date.now()) / 86400000))
      : 30;
    setDirectDaysInput(currentDaysLeft);

    if (currentExpiry) {
      const d = new Date(currentExpiry);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      setCustomDateInput(`${yyyy}-${mm}-${dd}`);
    } else {
      const d = new Date(Date.now() + 30 * 86400000);
      setCustomDateInput(d.toISOString().split('T')[0]);
    }

    setEditMaxWhatsApp(adm.subscription?.maxWhatsAppNumbers || 5);
    setEditMaxUsers(adm.subscription?.maxUsers || 10);
    setEditPlanName(adm.subscription?.planName || 'Professional');
    setEditStatus(adm.subscription?.status || 'active');
  };

  // Handle Edit Admin / Renew / Reduce Validity
  const handleSaveEditAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;

    setSavingEdit(true);
    try {
      const payload: any = {
        status: editStatus,
        planName: editPlanName,
        maxWhatsAppNumbers: Number(editMaxWhatsApp),
        maxUsers: Number(editMaxUsers),
      };

      if (validityMode === 'pick_date' && customDateInput) {
        payload.targetExpiresAt = new Date(`${customDateInput}T23:59:59.999Z`).toISOString();
      } else if (validityMode === 'set_exact_days') {
        payload.setTotalDaysRemaining = Math.max(0, Number(directDaysInput));
      } else {
        // adjust_days
        const delta = adjustType === 'reduce' ? -Math.abs(Number(editDaysToAdd)) : Math.abs(Number(editDaysToAdd));
        payload.extendDays = delta;
      }

      const res = await fetch(`/api/master/admins/${editingAdmin.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update Admin.');
      }

      const actionText =
        validityMode === 'adjust_days' && adjustType === 'reduce'
          ? `validity reduced by ${Math.abs(Number(editDaysToAdd))} days`
          : validityMode === 'pick_date'
          ? `expiry date updated to ${customDateInput}`
          : validityMode === 'set_exact_days'
          ? `validity set to ${directDaysInput} days`
          : 'validity extended and plan updated';

      toast.showSuccess('Admin Updated', `${editingAdmin.displayName}: ${actionText}.`);
      setEditingAdmin(null);
      await loadMasterData();
    } catch (err: any) {
      toast.showError('Update Error', err.message || 'Could not update Admin.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Password Reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingAdmin || !newPassInput.trim()) return;

    setSavingPass(true);
    try {
      const res = await fetch(`/api/master/admins/${resettingAdmin.uid}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPassInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reset password.');
      }

      toast.showSuccess('Password Reset', `New password saved securely for ${resettingAdmin.displayName}.`);
      setResettingAdmin(null);
    } catch (err: any) {
      toast.showError('Reset Error', err.message || 'Could not reset password.');
    } finally {
      setSavingPass(false);
    }
  };

  // Toggle Suspend / Activate
  const handleToggleAdminStatus = async (adm: AdminTenantItem) => {
    const isCurrentlySuspended = adm.subscription?.status === 'suspended';
    const newStatus = isCurrentlySuspended ? 'active' : 'suspended';

    try {
      const res = await fetch(`/api/master/admins/${adm.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Status update failed');
      toast.showSuccess(
        newStatus === 'active' ? 'Admin Activated' : 'Admin Suspended',
        `${adm.displayName} is now ${newStatus}.`
      );
      await loadMasterData();
    } catch (err: any) {
      toast.showError('Status Error', err.message);
    }
  };

  // Handle Impersonation ("LOGIN AS ADMIN")
  const handleImpersonate = async (adm: AdminTenantItem) => {
    try {
      await impersonateAdmin(adm.uid);
      toast.showSuccess(
        'Impersonation Started',
        `You are now viewing ${adm.displayName}'s tenant dashboard. A top bar is provided to return to Master Admin anytime.`
      );
    } catch (err: any) {
      toast.showError('Impersonation Failed', err.message);
    }
  };

  // Handle Delete Admin Confirm
  const handleDeleteAdminConfirm = async () => {
    if (!deletingAdmin) return;
    setIsDeletingAdmin(true);
    try {
      const res = await fetch(`/api/master/admins/${deletingAdmin.uid}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete admin.');
      }
      toast.showSuccess('Admin Deleted', `${deletingAdmin.displayName} and workspace deleted successfully.`);
      setDeletingAdmin(null);
      await loadMasterData();
    } catch (err: any) {
      toast.showError('Delete Failed', err.message);
    } finally {
      setIsDeletingAdmin(false);
    }
  };

  // Open Team Users under an Admin
  const handleOpenAdminUsers = async (adm: AdminTenantItem) => {
    setViewingAdminUsers(adm);
    setLoadingAdminUsers(true);
    try {
      const res = await fetch(`/api/admin/users?orgId=${encodeURIComponent(adm.organizationId)}`, {
        headers: {
          'x-organization-id': adm.organizationId,
          'x-is-master': 'true',
        },
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setAdminUsersList(data.users);
      } else {
        setAdminUsersList([]);
      }
    } catch (err) {
      setAdminUsersList([]);
    } finally {
      setLoadingAdminUsers(false);
    }
  };

  // Direct Watch Team User under an Admin ("uska bi tenants dekh shake dairek")
  const handleDirectWatchUser = async (user: any) => {
    try {
      await impersonateUser(user.uid);
      setViewingAdminUsers(null);
      toast.showSuccess(
        'Watching Team User',
        `Logged in as ${user.displayName || user.name}. You are viewing their live tenant workspace. Use top banner to return.`
      );
    } catch (err: any) {
      toast.showError('Watch Failed', err.message);
    }
  };

  // Save Team User Password (from Master Admin modal)
  const handleSaveUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingTenantUser || !newUserPassInput.trim()) return;
    setSavingUserPass(true);
    try {
      const res = await fetch(`/api/admin/users/${resettingTenantUser.uid}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': resettingTenantUser.organizationId,
          'x-is-master': 'true',
        },
        body: JSON.stringify({ newPassword: newUserPassInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update user password.');
      }
      toast.showSuccess('Password Updated', `New password saved for ${resettingTenantUser.displayName || 'user'}.`);
      setResettingTenantUser(null);
      if (viewingAdminUsers) {
        await handleOpenAdminUsers(viewingAdminUsers);
      }
    } catch (err: any) {
      toast.showError('Error', err.message);
    } finally {
      setSavingUserPass(false);
    }
  };

  // Delete Team User from Master Admin
  const handleDeleteTenantUser = async (user: any) => {
    if (!window.confirm(`Are you sure you want to delete user ${user.displayName || user.name || user.email || 'this user'}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.uid}`, {
        method: 'DELETE',
        headers: {
          'x-organization-id': user.organizationId || (viewingAdminUsers ? viewingAdminUsers.organizationId : ''),
          'x-is-master': 'true',
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete user.');
      }
      toast.showSuccess('User Deleted', `${user.displayName || 'User'} removed.`);
      if (viewingAdminUsers) {
        await handleOpenAdminUsers(viewingAdminUsers);
      }
      await loadMasterData();
    } catch (err: any) {
      toast.showError('Delete Failed', err.message);
    }
  };

  // Toggle Global Feature Flag
  const handleToggleFeature = async (featureKey: string) => {
    const updated = {
      ...features,
      [featureKey]: !features[featureKey],
    };
    setFeatures(updated);

    try {
      await fetch('/api/master/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: updated }),
      });
      toast.showSuccess('Feature Updated', `Global flag for ${featureKey} has been synchronized across all tenants.`);
    } catch (err) {
      console.warn('Feature flag update warning:', err);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Top Banner: Master Control */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-600 via-amber-700 to-orange-700 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-bold text-white shadow-xs shrink-0">
            <Crown className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold tracking-tight">Master Admin Control Panel</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/25 text-white tracking-wide uppercase">
                Global Level 1
              </span>
            </div>
            <p className="text-xs text-amber-100/90 mt-0.5">
              Multi-Tenant WhatsApp Platform Governance • Admins, Subscriptions, Global Features &amp; Isolated Tenants
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={loadMasterData}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold backdrop-blur-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh All</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCreateAdminOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white text-amber-900 hover:bg-amber-50 text-xs font-bold shadow-md transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-600" />
            <span>+ Create New Admin</span>
          </button>
        </div>
      </div>

      {/* Global Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
          <span className="text-neutral-500 font-medium">Total Admins</span>
          <p className="text-2xl font-bold text-amber-600 font-mono">{overview.totalAdmins}</p>
          <span className="text-[10px] text-emerald-600 font-semibold">{overview.activeAdmins} Active</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
          <span className="text-neutral-500 font-medium">Total Users</span>
          <p className="text-2xl font-bold text-purple-600 font-mono">{overview.totalUsers}</p>
          <span className="text-[10px] text-neutral-400">Under Admin Tenants</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
          <span className="text-neutral-500 font-medium">WhatsApp Numbers</span>
          <p className="text-2xl font-bold text-emerald-600 font-mono">{overview.totalWhatsAppNumbers}</p>
          <span className="text-[10px] text-emerald-600 font-semibold">Active Connections</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
          <span className="text-neutral-500 font-medium">Total Campaigns</span>
          <p className="text-2xl font-bold text-blue-600 font-mono">{overview.totalCampaigns}</p>
          <span className="text-[10px] text-neutral-400">Broadcast executions</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
          <span className="text-neutral-500 font-medium">Messages Sent</span>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white font-mono">{overview.totalMessages}</p>
          <span className="text-[10px] text-emerald-600 font-semibold">{overview.totalDelivered} Delivered</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1 shadow-xs">
          <span className="text-neutral-500 font-medium">System Health</span>
          <p className="text-sm font-bold text-emerald-600 flex items-center space-x-1 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>100% Operational</span>
          </p>
          <span className="text-[10px] text-neutral-400 font-mono">v3.2.0 Enterprise</span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 space-x-6 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('admins')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
            activeTab === 'admins'
              ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Admin Tenants Management ({admins.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('plans')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
            activeTab === 'plans'
              ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>SaaS Plans &amp; Limits</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('features')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
            activeTab === 'features'
              ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Global Feature Flags</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`pb-3 border-b-2 flex items-center space-x-1.5 transition-colors cursor-pointer ${
            activeTab === 'audit'
              ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>System Audit Logs ({auditLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: ADMIN TENANTS MANAGEMENT */}
      {activeTab === 'admins' && (
        <div className="space-y-4">
          {/* Quick Status Filter Chips */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setValidityFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold border transition-all cursor-pointer shrink-0 flex items-center space-x-1.5 ${
                statusFilter === 'all' && validityFilter === 'all'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300'
              }`}
            >
              <span>All Admins</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                statusFilter === 'all' && validityFilter === 'all' ? 'bg-amber-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
              }`}>
                {totalCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('active');
                setValidityFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold border transition-all cursor-pointer shrink-0 flex items-center space-x-1.5 ${
                statusFilter === 'active' && validityFilter === 'all'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-emerald-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Active</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                statusFilter === 'active' && validityFilter === 'all' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
              }`}>
                {activeCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('suspended');
                setValidityFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold border transition-all cursor-pointer shrink-0 flex items-center space-x-1.5 ${
                statusFilter === 'suspended' && validityFilter === 'all'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-rose-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Suspended</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                statusFilter === 'suspended' && validityFilter === 'all' ? 'bg-rose-700 text-white' : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
              }`}>
                {suspendedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setValidityFilter('expired');
                setStatusFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold border transition-all cursor-pointer shrink-0 flex items-center space-x-1.5 ${
                validityFilter === 'expired'
                  ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                  : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-rose-300'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${validityFilter === 'expired' ? 'text-white' : 'text-rose-500'}`} />
              <span>Expired (0 Days)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                validityFilter === 'expired' ? 'bg-rose-800 text-white' : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
              }`}>
                {expiredCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setValidityFilter('expiring_7');
                setStatusFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold border transition-all cursor-pointer shrink-0 flex items-center space-x-1.5 ${
                validityFilter === 'expiring_7'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-amber-300'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${validityFilter === 'expiring_7' ? 'text-white' : 'text-amber-500'}`} />
              <span>Expiring Soon (&lt;7d)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                validityFilter === 'expiring_7' ? 'bg-amber-700 text-white' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
              }`}>
                {expiringSoonCount}
              </span>
            </button>
          </div>

          {/* Search, Multi-Filter & Sort Toolbar */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
              {/* Search Bar */}
              <div className="relative w-full sm:flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search by Admin name, mobile, email, Org ID, plan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sort By Dropdown */}
              <div className="flex items-center space-x-1.5 w-full sm:w-auto shrink-0">
                <span className="text-[11px] text-neutral-400 font-medium flex items-center space-x-1 shrink-0">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>Sort:</span>
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="newest">🆕 Newest Created First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="validity_asc">⏳ Validity: Expiring Soonest</option>
                  <option value="validity_desc">⏳ Validity: Max Days Remaining</option>
                  <option value="users_desc">👥 Most Team Users</option>
                  <option value="name_asc">🔤 Admin Name (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Filter Dropdowns Grid */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
              <div className="flex items-center space-x-1 text-[11px] font-bold text-neutral-500 dark:text-neutral-400 mr-1">
                <Filter className="w-3.5 h-3.5 text-amber-500" />
                <span>Filters:</span>
              </div>

              {/* 1. Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer ${
                  statusFilter !== 'all'
                    ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-bold'
                    : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <option value="all">Status: All ({admins.length})</option>
                <option value="active">Active Only ({activeCount})</option>
                <option value="suspended">Suspended Only ({suspendedCount})</option>
              </select>

              {/* 2. Validity / Expiry Filter */}
              <select
                value={validityFilter}
                onChange={(e) => setValidityFilter(e.target.value)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer ${
                  validityFilter !== 'all'
                    ? 'border-rose-400 bg-rose-50/60 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold'
                    : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <option value="all">Validity: All</option>
                <option value="expired">⚠️ Expired (0 Days Remaining) ({expiredCount})</option>
                <option value="expiring_7">⏳ Expiring in ≤ 7 Days ({expiringSoonCount})</option>
                <option value="expiring_15">🗓️ Expiring in ≤ 15 Days</option>
                <option value="active_valid">✅ Valid (&gt; 15 Days)</option>
                <option value="unlimited">♾️ Unlimited Validity</option>
              </select>

              {/* 3. SaaS Plan Filter */}
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer ${
                  planFilter !== 'all'
                    ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-bold'
                    : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <option value="all">Plan: All Plans</option>
                {availablePlanNames.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              {/* 4. WhatsApp Numbers Filter */}
              <select
                value={whatsappFilter}
                onChange={(e) => setWhatsappFilter(e.target.value)}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer ${
                  whatsappFilter !== 'all'
                    ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold'
                    : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                <option value="all">WhatsApp: All</option>
                <option value="with_numbers">📱 Connected Number (≥ 1)</option>
                <option value="no_numbers">🚫 No Number Connected (0)</option>
              </select>

              {/* Reset All Filters Button */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100 transition-colors cursor-pointer ml-auto"
                  title="Clear all active filters"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear Filters</span>
                </button>
              )}
            </div>

            {/* Active Results Summary */}
            <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1">
              <p>
                Showing <strong>{filteredAdmins.length}</strong> of <strong>{admins.length}</strong> Admin Tenants
                {hasActiveFilters && <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1.5">(Filtered)</span>}
              </p>
            </div>
          </div>

          {/* Admins Table */}
          {loading ? (
            <div className="p-12 text-center text-neutral-500 flex flex-col items-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="text-xs">Loading Admin tenants...</span>
            </div>
          ) : filteredAdmins.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-500 space-y-3">
              <p>No Admin accounts found matching your filters or search.</p>
              <div className="flex items-center justify-center space-x-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-semibold cursor-pointer flex items-center space-x-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear All Filters</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCreateAdminOpen(true)}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer"
                >
                  + Create New Admin
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] tracking-wider font-semibold">
                      <th className="py-3 px-4">Admin / Workspace</th>
                      <th className="py-3 px-4">Login Mobile / Email</th>
                      <th className="py-3 px-4">SaaS Plan</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Tenant Usage</th>
                      <th className="py-3 px-4">Validity</th>
                      <th className="py-3 px-4 text-right">Master Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredAdmins.map((adm) => {
                      const isSuspended = adm.subscription?.status === 'suspended';
                      const expiresAt = adm.subscription?.expiresAt;
                      let daysRemaining = 0;
                      if (expiresAt) {
                        const nowMs = getServerNow ? getServerNow() : Date.now();
                        daysRemaining = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / (1000 * 60 * 60 * 24)));
                      }

                      return (
                        <tr key={adm.uid} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                          {/* Name & Org */}
                          <td className="py-3.5 px-4">
                            <div>
                              <p className="font-bold text-neutral-900 dark:text-white flex items-center space-x-1.5">
                                <span>{adm.displayName}</span>
                              </p>
                              <p className="text-[10px] font-mono text-neutral-400">Org: {adm.organizationId}</p>
                            </div>
                          </td>

                          {/* Credentials */}
                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-amber-700 dark:text-amber-400 font-semibold">{adm.phone || adm.email}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(adm.phone || adm.email);
                                  toast.showSuccess('Copied', 'Login ID copied to clipboard.');
                                }}
                                title="Copy Login ID"
                                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-center space-x-1.5 text-[10px] text-neutral-400 mt-0.5">
                              <span>Pass: {revealedAdminPassUids[adm.uid] ? (adm.displayPassword || '••••••••') : '••••••••'}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setRevealedAdminPassUids((prev) => ({
                                    ...prev,
                                    [adm.uid]: !prev[adm.uid],
                                  }));
                                }}
                                className="hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                                title="Reveal/Hide Password"
                              >
                                {revealedAdminPassUids[adm.uid] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                              {adm.displayPassword && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(adm.displayPassword || '');
                                    toast.showSuccess('Copied', 'Password copied.');
                                  }}
                                  className="hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                                  title="Copy Password"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Plan */}
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              {adm.subscription?.planName || 'Professional'}
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

                          {/* Usage Counters */}
                          <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300 text-[11px]">
                            <div className="space-y-1">
                              <button
                                type="button"
                                onClick={() => handleOpenAdminUsers(adm)}
                                className="inline-flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-neutral-800 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-300 transition-colors font-medium cursor-pointer border border-neutral-200 dark:border-neutral-700 shadow-2xs"
                                title="Click to view all Team Users, Passwords & Direct Watch"
                              >
                                <span>👥</span>
                                <strong>{adm.usersCount || 0}</strong>
                                <span>Users (Max {adm.subscription?.maxUsers || 10})</span>
                                <Eye className="w-3 h-3 text-blue-500" />
                              </button>
                              <p className="text-[10px] text-neutral-500">
                                📱 <strong>{adm.whatsAppCount || 0}</strong> Numbers (Max {adm.subscription?.maxWhatsAppNumbers || 5})
                              </p>
                            </div>
                          </td>

                          {/* Validity */}
                          <td className="py-3.5 px-4 text-[11px]">
                            <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                              {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'Unlimited'}
                            </p>
                            {expiresAt && (
                              <p className={`text-[10px] ${daysRemaining < 7 ? 'text-rose-600 font-bold' : 'text-neutral-400'}`}>
                                {daysRemaining} days remaining
                              </p>
                            )}
                          </td>

                          {/* Master Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {/* 1. LOGIN AS ADMIN (IMPERSONATION) */}
                              <button
                                type="button"
                                onClick={() => handleImpersonate(adm)}
                                title="Login As Admin (Enter Tenant Dashboard)"
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 hover:bg-amber-100 font-bold text-[11px] transition-colors cursor-pointer"
                              >
                                <LogIn className="w-3.5 h-3.5" />
                                <span>Login As Admin</span>
                              </button>

                              {/* 2. VIEW TEAM USERS & PASSWORDS & DIRECT WATCH */}
                              <button
                                type="button"
                                onClick={() => handleOpenAdminUsers(adm)}
                                title={`View ${adm.usersCount || 0} Team Users, ID, Password & Direct Watch`}
                                className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 font-semibold text-[11px] transition-colors cursor-pointer"
                              >
                                <Users className="w-3.5 h-3.5" />
                                <span>Users ({adm.usersCount || 0})</span>
                              </button>

                              {/* 3. Edit / Renew / Reduce Validity */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditAdmin(adm)}
                                title="Edit Admin, Adjust or Reduce Validity"
                                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              {/* 4. Reset Password */}
                              <button
                                type="button"
                                onClick={() => {
                                  setResettingAdmin(adm);
                                  setNewPassInput('');
                                }}
                                title="Reset Admin Password"
                                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>

                              {/* 5. Suspend / Activate */}
                              <button
                                type="button"
                                onClick={() => handleToggleAdminStatus(adm)}
                                title={isSuspended ? 'Activate Admin' : 'Suspend Admin'}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  isSuspended
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                }`}
                              >
                                {isSuspended ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                              </button>

                              {/* 6. DELETE ADMIN */}
                              <button
                                type="button"
                                onClick={() => setDeletingAdmin(adm)}
                                title="Delete Admin and Workspace Permanently"
                                className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer"
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

      {/* TAB 2: SAAS PLANS & LIMITS */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((p) => (
              <div
                key={p.id}
                className="p-5 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4 shadow-xs flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-neutral-900 dark:text-white">{p.name}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {p.validityDays} Days
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{p.description}</p>
                  <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-white">
                    {p.currency} {p.price.toLocaleString()}
                    <span className="text-xs font-normal text-neutral-400"> / {p.validityDays}d</span>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">WhatsApp Numbers:</span>
                      <strong className="font-mono">{p.maxWhatsAppNumbers} Numbers</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Max Users Under Admin:</span>
                      <strong className="font-mono">{p.maxUsers} Users</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Max Contacts:</span>
                      <strong className="font-mono">{p.maxContacts.toLocaleString()}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Broadcast Messages:</span>
                      <strong className="font-mono">{p.maxMessages.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
                  <span>Status: <strong className="text-emerald-600">Active</strong></span>
                  <span className="text-amber-600 font-semibold">Configured for SaaS</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: GLOBAL FEATURE FLAGS */}
      {activeTab === 'features' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-5 shadow-xs">
          <div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-white flex items-center space-x-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <span>Central Feature Management &amp; Release Control</span>
            </h3>
            <p className="text-xs text-neutral-500 mt-1">
              When Master Admin toggles a feature here, all eligible Admin tenants and their users immediately receive the update without any manual account modifications.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {Object.entries(features).map(([key, isEnabled]) => (
              <div
                key={key}
                className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-800/40 flex items-center justify-between"
              >
                <div>
                  <p className="font-bold text-neutral-900 dark:text-white uppercase tracking-wider text-[11px]">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    {isEnabled ? 'Enabled across all active Admin tenants' : 'Disabled platform-wide'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleFeature(key)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                    isEnabled
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {isEnabled ? 'ACTIVE' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SYSTEM AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-neutral-900 dark:text-white flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-purple-600" />
              <span>Global Audit &amp; Impersonation Log</span>
            </h3>
            <span className="text-xs text-neutral-400">Real-time platform action tracking</span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] uppercase font-semibold text-neutral-400">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor / Role</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Details</th>
                  <th className="py-2.5 px-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-[11px] font-mono">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-400">
                      No audit logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="py-2 px-3 text-neutral-400">{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td className="py-2 px-3 font-semibold text-amber-700 dark:text-amber-400">
                        {log.actorName} ({log.actorRole})
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-neutral-700 dark:text-neutral-300">{log.details}</td>
                      <td className="py-2 px-3 text-neutral-400">{log.ip || 'internal'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW ADMIN (PROVISIONS 100% FRESH 0-DATA TENANT) */}
      {isCreateAdminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-600 font-bold text-base">
                <Building className="w-5 h-5" />
                <span>Create New Admin (Fresh 0-Data Tenant)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateAdminOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-500 leading-relaxed">
              New Admin account creates an isolated organization. This admin will log in to a <strong>completely clean, fresh panel with zero pre-existing data</strong>.
            </p>

            <form onSubmit={handleCreateAdmin} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  Admin Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  Business / Company Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Marketing Agency"
                  value={newBusinessName}
                  onChange={(e) => setNewBusinessName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                    Login Mobile Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 9876543210"
                    value={newAdminPhone}
                    onChange={(e) => setNewAdminPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                    Login Email
                  </label>
                  <input
                    type="email"
                    placeholder="admin@agency.com"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  Initial Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                    Plan
                  </label>
                  <select
                    value={newPlanId}
                    onChange={(e) => {
                      setNewPlanId(e.target.value);
                      if (e.target.value === 'plan_starter') setNewMaxWhatsApp(1);
                      else if (e.target.value === 'plan_pro') setNewMaxWhatsApp(5);
                      else if (e.target.value === 'plan_enterprise') setNewMaxWhatsApp(50);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-semibold"
                  >
                    <option value="plan_starter">Starter (1 Number)</option>
                    <option value="plan_pro">Pro (5 Numbers)</option>
                    <option value="plan_enterprise">Enterprise (50 Numbers)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                    Max WhatsApp Numbers
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newMaxWhatsApp}
                    onChange={(e) => setNewMaxWhatsApp(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs font-bold"
                  />
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">Default: 1 number allowed</span>
                </div>
              </div>

              {/* Manual Validity Days Selection & Live Expiry Preview */}
              <div className="space-y-2 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 block text-xs">
                    Admin Plan Validity (Manual Days)
                  </label>
                  <span className="text-[10px] text-neutral-400">Type days or click quick presets</span>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={1}
                    placeholder="Enter days e.g. 30"
                    value={newValidityDays || ''}
                    onChange={(e) => setNewValidityDays(Math.max(1, Number(e.target.value)))}
                    className="w-28 px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs font-bold"
                  />
                  <div className="flex items-center space-x-1 flex-1 overflow-x-auto">
                    {[15, 30, 60, 90, 180, 365].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setNewValidityDays(d)}
                        className={`px-2 py-1.5 rounded-lg border text-[11px] font-mono font-semibold transition-colors cursor-pointer shrink-0 ${
                          newValidityDays === d
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold'
                            : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Expiry Date Display */}
                {(() => {
                  const d = Number(newValidityDays) || 0;
                  const expDate = new Date(Date.now() + d * 86400000);
                  return (
                    <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          Live Expiry Date: <strong className="text-neutral-900 dark:text-white font-bold">{expDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                        </span>
                      </div>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-200/60 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300 font-bold">
                        {d} Days from Today
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateAdminOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAdmin}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  {creatingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>Provision New Admin</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL: CREATED ADMIN CREDENTIALS & INSTANT LOGIN */}
      {createdAdminSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 font-bold text-base">
                <CheckCircle2 className="w-5 h-5" />
                <span>Admin Created Successfully!</span>
              </div>
              <button
                type="button"
                onClick={() => setCreatedAdminSuccess(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 text-xs space-y-2.5">
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                Aapka Naya Admin Ready Hai! Yeh Admin credentials use karke login kar sakte hain:
              </p>

              <div className="space-y-1.5 font-mono text-[11px] bg-white dark:bg-neutral-900 p-3 rounded-xl border border-emerald-200/50 dark:border-emerald-800/50">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Admin Name:</span>
                  <span className="font-bold text-neutral-900 dark:text-white">{createdAdminSuccess.name}</span>
                </div>
                {createdAdminSuccess.phone && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Mobile (User ID):</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{createdAdminSuccess.phone}</span>
                  </div>
                )}
                {createdAdminSuccess.email && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Email:</span>
                    <span className="font-bold text-neutral-900 dark:text-white truncate max-w-[200px]">{createdAdminSuccess.email}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-neutral-500">Password:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{createdAdminSuccess.password}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Plan Validity:</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">{createdAdminSuccess.validityDays} Days</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = `CloudWABA Admin Login Credentials:\nName: ${createdAdminSuccess.name}\nMobile / Username: ${createdAdminSuccess.phone || createdAdminSuccess.email}\nPassword: ${createdAdminSuccess.password}\nLogin Portal: ${window.location.origin}`;
                    navigator.clipboard.writeText(text);
                    setCopiedSuccessCredentials(true);
                    toast.showSuccess('Copied!', 'Admin credentials copied to clipboard.');
                    setTimeout(() => setCopiedSuccessCredentials(false), 2500);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs"
                >
                  {copiedSuccessCredentials ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-neutral-500" />
                      <span>Copy Credentials</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (createdAdminSuccess.uid) {
                      impersonateAdmin(createdAdminSuccess.uid);
                      setCreatedAdminSuccess(null);
                    }
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login / Test Now</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCreatedAdminSuccess(null)}
                className="w-full py-2 px-3 rounded-xl text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 text-xs font-medium cursor-pointer"
              >
                Close &amp; Return to List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT ADMIN / RENEW PLAN */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2 text-neutral-900 dark:text-white font-bold text-base">
                <Edit className="w-5 h-5 text-amber-600" />
                <span>Edit Admin: {editingAdmin.displayName}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingAdmin(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAdmin} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  Account Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-semibold"
                >
                  <option value="active">Active (Normal Access)</option>
                  <option value="suspended">Suspended (Blocked Access)</option>
                </select>
              </div>

              {/* VALIDITY MANAGEMENT: EXTEND, REDUCE OR SET EXACT DATE */}
              <div className="space-y-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-neutral-800 dark:text-neutral-200 block text-xs">
                    Subscription Validity &amp; Expiry
                  </label>
                  <span className="text-[10px] text-neutral-400">Extend, reduce (kam karein) or set date</span>
                </div>

                {/* Mode Selector Tabs */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-neutral-200/70 dark:bg-neutral-800 rounded-xl text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setValidityMode('adjust_days')}
                    className={`py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                      validityMode === 'adjust_days'
                        ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs font-bold'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                    }`}
                  >
                    ➕ / ➖ Add / Reduce
                  </button>
                  <button
                    type="button"
                    onClick={() => setValidityMode('set_exact_days')}
                    className={`py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                      validityMode === 'set_exact_days'
                        ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs font-bold'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                    }`}
                  >
                    🔢 Set Total Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setValidityMode('pick_date')}
                    className={`py-1.5 px-2 rounded-lg transition-all text-center cursor-pointer ${
                      validityMode === 'pick_date'
                        ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xs font-bold'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                    }`}
                  >
                    📅 Pick Date
                  </button>
                </div>

                {/* MODE 1: ADJUST (EXTEND OR REDUCE) */}
                {validityMode === 'adjust_days' && (
                  <div className="space-y-2.5">
                    {/* Add vs Reduce Toggle */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustType('add')}
                        className={`py-2 px-3 rounded-xl border flex items-center justify-center space-x-1.5 text-xs font-bold transition-all cursor-pointer ${
                          adjustType === 'add'
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shadow-xs'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5 text-emerald-600" />
                        <span>➕ Extend Validity</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAdjustType('reduce')}
                        className={`py-2 px-3 rounded-xl border flex items-center justify-center space-x-1.5 text-xs font-bold transition-all cursor-pointer ${
                          adjustType === 'reduce'
                            ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 shadow-xs'
                            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100'
                        }`}
                      >
                        <Minus className="w-3.5 h-3.5 text-rose-600" />
                        <span>➖ Reduce Validity</span>
                      </button>
                    </div>

                    {/* Number input & quick presets */}
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2">
                        <div className="relative">
                          <input
                            type="number"
                            min={1}
                            placeholder="Enter days"
                            value={editDaysToAdd || ''}
                            onChange={(e) => setEditDaysToAdd(Math.max(1, Number(e.target.value)))}
                            className={`w-32 px-3 py-1.5 rounded-xl border bg-white dark:bg-neutral-800 font-mono text-xs font-bold ${
                              adjustType === 'reduce'
                                ? 'border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                                : 'border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                            }`}
                          />
                          <span className="absolute right-2.5 top-1.5 text-[10px] text-neutral-400 font-semibold">
                            days
                          </span>
                        </div>

                        <div className="flex items-center space-x-1 flex-1 overflow-x-auto pb-0.5">
                          {[7, 15, 30, 60, 90, 180].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setEditDaysToAdd(d)}
                              className={`px-2 py-1.5 rounded-lg border text-[11px] font-mono font-semibold transition-colors cursor-pointer shrink-0 ${
                                editDaysToAdd === d
                                  ? adjustType === 'reduce'
                                    ? 'border-rose-500 bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 font-bold'
                                    : 'border-emerald-500 bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 font-bold'
                                  : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                              }`}
                            >
                              {adjustType === 'reduce' ? `-${d}d` : `+${d}d`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODE 2: SET EXACT TOTAL DAYS */}
                {validityMode === 'set_exact_days' && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          placeholder="e.g. 15"
                          value={directDaysInput}
                          onChange={(e) => setDirectDaysInput(Math.max(0, Number(e.target.value)))}
                          className="w-32 px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs font-bold"
                        />
                        <span className="absolute right-2.5 top-1.5 text-[10px] text-neutral-400 font-semibold">
                          days
                        </span>
                      </div>
                      <span className="text-[11px] text-neutral-500">Total days from today</span>
                    </div>

                    <div className="flex items-center space-x-1 flex-wrap gap-1">
                      {[0, 5, 7, 15, 30, 45, 60, 90, 365].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDirectDaysInput(d)}
                          className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                            directDaysInput === d
                              ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold'
                              : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          {d === 0 ? '0d (Expire)' : `${d}d`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* MODE 3: PICK EXACT EXPIRY DATE */}
                {validityMode === 'pick_date' && (
                  <div className="space-y-2">
                    <div>
                      <input
                        type="date"
                        value={customDateInput}
                        onChange={(e) => setCustomDateInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs font-semibold"
                      />
                    </div>
                    <div className="flex items-center space-x-1 flex-wrap gap-1">
                      {[
                        { label: 'Today', days: 0 },
                        { label: '+7d', days: 7 },
                        { label: '+15d', days: 15 },
                        { label: '+30d', days: 30 },
                        { label: '+90d', days: 90 },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            const d = new Date(Date.now() + item.days * 86400000);
                            setCustomDateInput(d.toISOString().split('T')[0]);
                          }}
                          className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-[11px] font-mono font-medium text-neutral-600 dark:text-neutral-300 cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* LIVE CALCULATED PREVIEW BOX */}
                {(() => {
                  const currentExpiryMs = editingAdmin.subscription?.expiresAt
                    ? new Date(editingAdmin.subscription.expiresAt).getTime()
                    : Date.now();
                  const currentRemaining = editingAdmin.subscription?.expiresAt
                    ? Math.ceil((new Date(editingAdmin.subscription.expiresAt).getTime() - Date.now()) / 86400000)
                    : 0;

                  let targetTime = Date.now();
                  if (validityMode === 'pick_date') {
                    targetTime = customDateInput ? new Date(`${customDateInput}T23:59:59`).getTime() : currentExpiryMs;
                  } else if (validityMode === 'set_exact_days') {
                    targetTime = Date.now() + Math.max(0, Number(directDaysInput) || 0) * 86400000;
                  } else {
                    // adjust_days
                    const deltaDays =
                      adjustType === 'reduce'
                        ? -Math.abs(Number(editDaysToAdd) || 0)
                        : Math.abs(Number(editDaysToAdd) || 0);
                    const base = adjustType === 'add' ? Math.max(Date.now(), currentExpiryMs) : currentExpiryMs;
                    targetTime = base + deltaDays * 86400000;
                  }

                  const targetDate = new Date(targetTime);
                  const totalRemainingDays = Math.ceil((targetTime - Date.now()) / 86400000);
                  const isExpired = totalRemainingDays <= 0;

                  return (
                    <div
                      className={`p-2.5 rounded-xl border text-[11px] space-y-1.5 transition-colors ${
                        validityMode === 'adjust_days' && adjustType === 'reduce'
                          ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
                          : isExpired
                          ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
                          : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>
                            New Expiry Date:{' '}
                            <strong className="text-neutral-900 dark:text-white font-bold">
                              {targetDate.toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </strong>
                          </span>
                        </div>
                        <span
                          className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold ${
                            isExpired
                              ? 'bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100'
                              : 'bg-amber-200/70 dark:bg-amber-900 text-amber-900 dark:text-amber-200'
                          }`}
                        >
                          {isExpired ? '0d (EXPIRED)' : `${totalRemainingDays} Days Remaining`}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400 pt-0.5 border-t border-neutral-200/50 dark:border-neutral-700/50">
                        <span>
                          Current:{' '}
                          {editingAdmin.subscription?.expiresAt
                            ? new Date(editingAdmin.subscription.expiresAt).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'None'}{' '}
                          ({currentRemaining}d remaining)
                        </span>
                        <span className="font-semibold">
                          {validityMode === 'adjust_days' && adjustType === 'reduce' && (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">
                              🔻 Reducing by {editDaysToAdd} days
                            </span>
                          )}
                          {validityMode === 'adjust_days' && adjustType === 'add' && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              🟢 Adding +{editDaysToAdd} days
                            </span>
                          )}
                          {validityMode === 'set_exact_days' && (
                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                              🎯 Setting {directDaysInput} days
                            </span>
                          )}
                          {validityMode === 'pick_date' && (
                            <span className="text-blue-600 dark:text-blue-400 font-bold">
                              📅 Direct date
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                    Max WhatsApp Numbers
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editMaxWhatsApp}
                    onChange={(e) => setEditMaxWhatsApp(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                    Max Users
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editMaxUsers}
                    onChange={(e) => setEditMaxUsers(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resettingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2 text-neutral-900 dark:text-white font-bold text-base">
                <KeyRound className="w-5 h-5 text-amber-600" />
                <span>Reset Admin Password</span>
              </div>
              <button
                type="button"
                onClick={() => setResettingAdmin(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Set a new secure password for <strong>{resettingAdmin.displayName}</strong>. Password will be securely hashed with salt.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  New Password
                </label>
                <input
                  type="text"
                  required
                  placeholder="Min 6 characters"
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                />
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setResettingAdmin(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPass}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
                >
                  {savingPass ? 'Resetting...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: DELETE ADMIN CONFIRMATION */}
      {deletingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-white">Delete Admin &amp; Workspace</h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">Permanent Removal</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs space-y-2 text-rose-800 dark:text-rose-200">
              <p className="font-semibold text-rose-900 dark:text-rose-100">
                Are you sure you want to permanently delete this Admin?
              </p>
              <div className="p-3 rounded-xl bg-white/90 dark:bg-neutral-900/90 border border-rose-200 dark:border-rose-800 space-y-1 font-mono text-[11px] text-neutral-800 dark:text-neutral-200">
                <div><strong>Admin Name:</strong> {deletingAdmin.displayName}</div>
                <div><strong>Login ID / Phone:</strong> {deletingAdmin.phone || deletingAdmin.uid}</div>
                <div><strong>Email:</strong> {deletingAdmin.email}</div>
                <div><strong>Org ID:</strong> {deletingAdmin.organizationId}</div>
                <div><strong>Team Users Count:</strong> {deletingAdmin.usersCount || 0} Users</div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-900 dark:text-amber-200 flex items-start space-x-2">
                <span className="text-sm">💡</span>
                <div>
                  <strong>Tip: Data Safe Rakhna Chahte Hain?</strong>
                  <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                    Agar aap chahte hain ki Admin ka access block ho jaye lekin contacts/data storage me safe rahe, to delete mat kijiye, balki <strong>Suspend</strong> kijiye.
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold">
                ⚠️ Permanent Delete par click karne par Admin, unke sabhi users aur unka data storage se hamesha ke liye wipe ho jayega!
              </p>
            </div>

            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={isDeletingAdmin}
                onClick={() => {
                  handleToggleAdminStatus(deletingAdmin);
                  setDeletingAdmin(null);
                }}
                className="px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 font-bold text-xs hover:bg-amber-100 transition-colors cursor-pointer flex items-center space-x-1.5"
                title="Admin ko block karein par data storage me safe rakhein"
              >
                <Ban className="w-3.5 h-3.5 text-amber-600" />
                <span>🚫 Suspend Instead (Keep Data)</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={isDeletingAdmin}
                  onClick={() => setDeletingAdmin(null)}
                  className="px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingAdmin}
                  onClick={handleDeleteAdminConfirm}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  {isDeletingAdmin ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Yes, Delete Permanently</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VIEW TEAM USERS UNDER ADMIN, ID, PASSWORD & DIRECT WATCH */}
      {viewingAdminUsers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-3xl shadow-2xl p-5 sm:p-6 space-y-4 my-auto max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                      Team Users under {viewingAdminUsers.displayName}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      {adminUsersList.length} Users Found
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Org: <span className="font-mono">{viewingAdminUsers.organizationId}</span> • View Login ID, Passwords &amp; Direct Watch
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingAdminUsers(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 shrink-0 text-xs">
              <div className="flex items-center space-x-2 text-neutral-600 dark:text-neutral-300">
                <span>🔑 <strong>ID &amp; Password:</strong> Click eye icon to reveal or copy password.</span>
              </div>
              <button
                type="button"
                onClick={() => handleImpersonate(viewingAdminUsers)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                title="Login as Admin to create new team users or configure workspace"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Login As Admin (Enter Workspace)</span>
              </button>
            </div>

            {/* Content Body: Scrollable */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingAdminUsers ? (
                <div className="py-12 text-center space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
                  <p className="text-xs text-neutral-500">Loading team users for this tenant...</p>
                </div>
              ) : adminUsersList.length === 0 ? (
                <div className="py-10 px-4 text-center space-y-3 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700">
                  <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto text-neutral-400">
                    <Users className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-neutral-800 dark:text-neutral-200">No Team Users Created Yet</h4>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto">
                    This admin ({viewingAdminUsers.displayName}) has not added any sub-users yet. You can login as this admin to add team users for them.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleImpersonate(viewingAdminUsers)}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Login As {viewingAdminUsers.displayName} &amp; Add Users</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {adminUsersList.map((user: any, index: number) => {
                    const isRevealed = revealUserPasswordId === user.uid;
                    const loginId = user.phone || user.email || user.uid;
                    const passwordVal = user.displayPassword || '(Password Protected)';
                    const isSuspended = user.subscription?.status === 'suspended';
                    const expiresAt = user.subscription?.expiresAt;
                    const daysRemaining = expiresAt
                      ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : null;

                    return (
                      <div
                        key={user.uid || index}
                        className="p-4 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-3 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                      >
                        {/* Top row: Name, Designation, Status */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                              {(user.displayName || user.name || 'U').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h4 className="font-bold text-sm text-neutral-900 dark:text-white">
                                  {user.displayName || user.name || 'Unnamed User'}
                                </h4>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                                  {user.subscription?.planName || 'Team Member'}
                                </span>
                              </div>
                              <p className="text-[11px] text-neutral-500">
                                UID: <span className="font-mono">{user.uid}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isSuspended
                                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                            </span>
                            {expiresAt && (
                              <span className="text-[10px] text-neutral-400 font-medium">
                                {daysRemaining !== null ? `${daysRemaining}d left` : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle row: Credentials Box (ID & Password) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700 text-xs">
                          {/* User ID */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold uppercase text-neutral-400 tracking-wider">
                              Login ID / Mobile / Email
                            </span>
                            <div className="flex items-center justify-between bg-white dark:bg-neutral-800 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
                              <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100 truncate mr-2">
                                {loginId}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(loginId);
                                  setCopiedUserId(user.uid);
                                  setTimeout(() => setCopiedUserId(null), 2000);
                                  toast.showSuccess('Copied', `Login ID ${loginId} copied to clipboard.`);
                                }}
                                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer p-0.5"
                                title="Copy Login ID"
                              >
                                {copiedUserId === user.uid ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Password */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold uppercase text-neutral-400 tracking-wider">
                              Password
                            </span>
                            <div className="flex items-center justify-between bg-white dark:bg-neutral-800 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
                              <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100 truncate mr-2">
                                {isRevealed ? passwordVal : '••••••••'}
                              </span>
                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealUserPasswordId(isRevealed ? null : user.uid)
                                  }
                                  className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer p-0.5"
                                  title={isRevealed ? 'Hide Password' : 'Show Password'}
                                >
                                  {isRevealed ? (
                                    <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(passwordVal);
                                    toast.showSuccess('Password Copied', 'Team user password copied.');
                                  }}
                                  className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer p-0.5"
                                  title="Copy Password"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Bottom row: Direct Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="text-[11px] text-neutral-500">
                            📱 Max WhatsApp: <strong>{user.subscription?.maxWhatsAppNumbers || 1}</strong>
                          </div>

                          <div className="flex items-center space-x-2">
                            {/* 1. DIRECT WATCH / ENTER USER TENANT WORKSPACE */}
                            <button
                              type="button"
                              onClick={() => handleDirectWatchUser(user)}
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                              title="Directly enter and watch this user's live tenant dashboard"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              <span>Direct Watch Workspace</span>
                            </button>

                            {/* 2. Reset Password */}
                            <button
                              type="button"
                              onClick={() => {
                                setResettingTenantUser(user);
                                setNewUserPassInput('');
                              }}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-semibold transition-colors cursor-pointer"
                              title="Reset password for this user"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                              <span>Reset Pass</span>
                            </button>

                            {/* 3. Delete Sub-User */}
                            <button
                              type="button"
                              onClick={() => handleDeleteTenantUser(user)}
                              className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer"
                              title="Delete this team user"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setViewingAdminUsers(null)}
                className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: RESET TEAM USER PASSWORD (FROM MASTER ADMIN) */}
      {resettingTenantUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div className="flex items-center space-x-2 text-neutral-900 dark:text-white font-bold text-base">
                <KeyRound className="w-5 h-5 text-amber-600" />
                <span>Reset User Password</span>
              </div>
              <button
                type="button"
                onClick={() => setResettingTenantUser(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Set new password for <strong>{resettingTenantUser.displayName || resettingTenantUser.name || 'User'}</strong> (ID: {resettingTenantUser.phone || resettingTenantUser.email || resettingTenantUser.uid}).
            </p>

            <form onSubmit={handleSaveUserPassword} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  New Password
                </label>
                <input
                  type="text"
                  required
                  placeholder="Min 6 characters"
                  value={newUserPassInput}
                  onChange={(e) => setNewUserPassInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 font-mono text-xs"
                />
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setResettingTenantUser(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUserPass}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
                >
                  {savingUserPass ? 'Saving...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
