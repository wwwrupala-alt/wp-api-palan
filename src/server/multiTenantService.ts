import crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  serverDb,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  deleteDoc,
} from './serverDb.ts';
import type { UserProfile, Organization, SaaSPlan, AuditLog } from '../types/index.ts';

// -------------------------------------------------------------
// SECURE PASSWORD HASHING (Salt + SHA-256)
// -------------------------------------------------------------
export function hashPassword(plainText: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(plainText).digest('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plainText: string, storedHash: string): boolean {
  if (!storedHash) return false;
  const cleanPlain = String(plainText).trim();
  if (!storedHash.includes(':')) {
    // Backward compatibility for legacy pre-migration plain strings if any
    return cleanPlain === storedHash || plainText === storedHash;
  }
  try {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const checkHash = crypto.createHmac('sha256', salt).update(cleanPlain).digest('hex');
    const bufCheck = Buffer.from(checkHash);
    const bufOriginal = Buffer.from(originalHash);
    if (bufCheck.length !== bufOriginal.length) return false;
    return crypto.timingSafeEqual(bufCheck, bufOriginal);
  } catch (err) {
    console.warn('[verifyPassword] Hash verification error:', err);
    return false;
  }
}

// -------------------------------------------------------------
// AUDIT LOGGING & ACTIVITY TRAIL
// -------------------------------------------------------------
export function categorizeAction(action: string): 'auth' | 'template' | 'campaign' | 'security' | 'user' | 'system' {
  const act = (action || '').toUpperCase();
  if (
    act.includes('LOGIN') ||
    act.includes('LOGOUT') ||
    act.includes('SESSION') ||
    act.includes('PASSWORD') ||
    act.includes('AUTH')
  ) {
    return 'auth';
  }
  if (act.includes('TEMPLATE')) {
    return 'template';
  }
  if (act.includes('CAMPAIGN') || act.includes('BROADCAST')) {
    return 'campaign';
  }
  if (act.includes('USER') || act.includes('TEAM') || act.includes('IMPERSONAT')) {
    return 'user';
  }
  if (act.includes('ADMIN') || act.includes('FEATURE') || act.includes('SUSPEND') || act.includes('SECURITY')) {
    return 'security';
  }
  return 'system';
}

export function inferStatus(action: string, details?: string): 'success' | 'failure' | 'warning' | 'info' {
  const act = (action || '').toUpperCase();
  const det = (details || '').toLowerCase();
  if (act.includes('FAIL') || act.includes('REJECT') || det.includes('failed') || det.includes('error') || det.includes('incorrect')) {
    return 'failure';
  }
  if (act.includes('TIMEOUT') || act.includes('EXPIR') || act.includes('SUSPEND') || det.includes('timeout') || det.includes('expired')) {
    return 'warning';
  }
  if (act.includes('LOGOUT') || act.includes('INFO') || act.includes('SYNC')) {
    return 'info';
  }
  return 'success';
}

export function cleanUndefined<T>(value: T): T {
  if (value === null || value === undefined) {
    return undefined as unknown as T;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => (typeof item === 'object' && item !== null ? cleanUndefined(item) : item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        clean[k] = typeof v === 'object' && v !== null ? cleanUndefined(v) : v;
      }
    }
    return clean as unknown as T;
  }
  return value;
}

export async function recordAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
  try {
    const id = `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const category = log.category || categorizeAction(log.action);
    const status = log.status || inferStatus(log.action, log.details);
    const rawDoc: Record<string, any> = {
      id,
      timestamp: new Date().toISOString(),
      actorId: log.actorId || 'system',
      actorName: log.actorName || 'System',
      actorRole: log.actorRole || 'user',
      action: log.action || 'UNKNOWN',
      details: log.details || '',
      category,
      status,
    };
    if (log.targetId !== undefined && log.targetId !== null && log.targetId !== '') {
      rawDoc.targetId = String(log.targetId);
    }
    if (log.targetType !== undefined && log.targetType !== null && log.targetType !== '') {
      rawDoc.targetType = String(log.targetType);
    }
    if (log.organizationId !== undefined && log.organizationId !== null && log.organizationId !== '') {
      rawDoc.organizationId = String(log.organizationId);
    }
    if (log.ip !== undefined && log.ip !== null && log.ip !== '') {
      rawDoc.ip = String(log.ip);
    }
    if (log.userAgent !== undefined && log.userAgent !== null && log.userAgent !== '') {
      rawDoc.userAgent = String(log.userAgent);
    }
    if (log.metadata !== undefined && log.metadata !== null) {
      rawDoc.metadata = cleanUndefined(log.metadata);
    }

    const logDoc = cleanUndefined(rawDoc);
    await setDoc(doc(serverDb, 'audit_logs', id), logDoc);
  } catch (err) {
    console.warn('[AuditLog] Failed to write log:', err);
  }
}

// -------------------------------------------------------------
// DEFAULT PLANS SEED
// -------------------------------------------------------------
export const DEFAULT_SAAS_PLANS: SaaSPlan[] = [
  {
    id: 'plan_starter',
    name: 'Starter',
    description: 'Perfect for small businesses starting out with WhatsApp marketing',
    price: 999,
    currency: 'INR',
    validityDays: 30,
    maxWhatsAppNumbers: 1,
    maxUsers: 2,
    maxContacts: 2500,
    maxTemplates: 25,
    maxCampaigns: 50,
    maxMessages: 10000,
    features: {
      whatsapp_connection: true,
      templates: true,
      campaigns: true,
      broadcast: true,
      contacts: true,
      analytics: true,
      automations: false,
      api_access: false,
      coexistence_mode: false,
      export_data: true,
    },
    status: 'active',
  },
  {
    id: 'plan_pro',
    name: 'Professional',
    description: 'High-volume WhatsApp broadcasting with Coexistence mode support',
    price: 2499,
    currency: 'INR',
    validityDays: 30,
    maxWhatsAppNumbers: 5,
    maxUsers: 10,
    maxContacts: 25000,
    maxTemplates: 100,
    maxCampaigns: 250,
    maxMessages: 100000,
    features: {
      whatsapp_connection: true,
      templates: true,
      campaigns: true,
      broadcast: true,
      contacts: true,
      analytics: true,
      automations: true,
      api_access: true,
      coexistence_mode: true,
      export_data: true,
    },
    status: 'active',
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise Unlimited',
    description: 'Unlimited capacity for large teams, agencies, and high throughput broadcast',
    price: 4999,
    currency: 'INR',
    validityDays: 365,
    maxWhatsAppNumbers: 50,
    maxUsers: 100,
    maxContacts: 500000,
    maxTemplates: 1000,
    maxCampaigns: 5000,
    maxMessages: 1000000,
    features: {
      whatsapp_connection: true,
      templates: true,
      campaigns: true,
      broadcast: true,
      contacts: true,
      analytics: true,
      automations: true,
      api_access: true,
      coexistence_mode: true,
      export_data: true,
    },
    status: 'active',
  },
];

// Global Feature Flags
let globalFeatureFlags: Record<string, boolean> = {
  campaign_analytics: true,
  automations_bot: true,
  coexistence_mode: true,
  embedded_signup: true,
  export_data: true,
  api_webhooks: true,
};

// -------------------------------------------------------------
// SEED DEFAULT MASTER & ADMIN (IF NOT ALREADY EXISTING)
// -------------------------------------------------------------
let isSeeded = false;
export async function ensureDefaultAccounts(): Promise<void> {
  if (isSeeded) return;
  isSeeded = true;

  try {
    // 1. Seed Master Admin
    const masterRef = doc(serverDb, 'users', 'master_admin_root');
    const masterSnap = await getDoc(masterRef);
    if (!masterSnap.exists()) {
      await setDoc(masterRef, {
        uid: 'master_admin_root',
        email: 'master@cloudwaba.com',
        displayName: 'Master Administrator',
        phone: 'masteradmin',
        role: 'master_admin',
        loginPassword: hashPassword('Master@12345'),
        displayPassword: 'Master@12345',
        organizationId: 'org_master_platform',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log('[MultiTenant] Created Master Admin: master@cloudwaba.com');
    }

    // Ensure Master Admin platform organization exists
    const masterOrgRef = doc(serverDb, 'organizations', 'org_master_platform');
    const masterOrgSnap = await getDoc(masterOrgRef);
    if (!masterOrgSnap.exists()) {
      await setDoc(masterOrgRef, {
        id: 'org_master_platform',
        name: 'Master Platform Workspace',
        ownerId: 'master_admin_root',
        status: 'active',
        subscription: {
          planName: 'Platform Super Admin',
          maxWhatsAppNumbers: 100,
          maxUsers: 1000,
          maxMonthlyBroadcasts: 10000000,
          maxContacts: 1000000,
          expiresAt: '2099-12-31T23:59:59.000Z',
          status: 'active',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log('[MultiTenant] Created Master Platform Organization: org_master_platform');
    }

    // 2. Clean up legacy hardcoded default admin 9974428034 if present
    try {
      const legacyAdminRef = doc(serverDb, 'users', 'user_9974428034');
      const legacySnap = await getDoc(legacyAdminRef);
      if (legacySnap.exists()) {
        await deleteDoc(legacyAdminRef).catch(() => {});
        await deleteDoc(doc(serverDb, 'organizations', 'org_user_9974428034')).catch(() => {});
        console.log('[MultiTenant] Cleaned up legacy default admin 9974428034');
      }
    } catch (e) {}

    // 3. Seed Default Plans
    for (const plan of DEFAULT_SAAS_PLANS) {
      const planRef = doc(serverDb, 'plans', plan.id);
      const planSnap = await getDoc(planRef);
      if (!planSnap.exists()) {
        await setDoc(planRef, plan);
      }
    }
  } catch (err) {
    console.warn('[MultiTenant] Seed accounts warning:', err);
  }
}

// -------------------------------------------------------------
// AUTH CONTROLLER: Identifier Role Lookup & Unified Login
// -------------------------------------------------------------
export async function handleLookupIdentifier(req: Request, res: Response): Promise<void> {
  await ensureDefaultAccounts();
  try {
    const rawId = req.query.identifier || req.body?.identifier;
    if (!rawId) {
      res.json({ found: false });
      return;
    }

    const cleanId = String(rawId).trim().toLowerCase();
    const inputDigits = cleanId.replace(/[^0-9]/g, '');
    const last10Input = inputDigits.length >= 10 ? inputDigits.slice(-10) : '';

    // 1. Master admin root account
    if (cleanId === 'master@cloudwaba.com' || cleanId === 'masteradmin' || cleanId === 'master') {
      res.json({
        found: true,
        role: 'master_admin',
        roleLabel: 'Master Admin',
        displayName: 'Master Administrator',
      });
      return;
    }

    // 2. Query users in Firestore
    const usersSnap = await getDocs(collection(serverDb, 'users'));
    const matched: Array<{ role: string; displayName: string; phone?: string; email?: string }> = [];

    usersSnap.forEach((docSnap) => {
      const u = docSnap.data() as UserProfile;
      const uEmail = (u.email || '').toLowerCase().trim();
      const uPhone = (u.phone || '').trim();
      const uPhoneDigits = uPhone.replace(/[^0-9]/g, '');
      const last10UPhone = uPhoneDigits.length >= 10 ? uPhoneDigits.slice(-10) : '';
      const uUid = (u.uid || '').toLowerCase().trim();
      const uName = (u.displayName || '').toLowerCase().trim();

      const isExactMatch =
        cleanId === uEmail ||
        cleanId === uPhone.toLowerCase() ||
        cleanId === uUid ||
        cleanId === uName;

      const isPhoneMatch =
        (last10Input && last10UPhone && last10Input === last10UPhone) ||
        (inputDigits.length >= 7 && inputDigits === uPhoneDigits);

      if (isExactMatch || isPhoneMatch) {
        matched.push({
          role: u.role || 'user',
          displayName: u.displayName || u.phone || u.email || 'User',
          phone: u.phone,
          email: u.email,
        });
      }
    });

    if (matched.length === 0) {
      res.json({ found: false });
      return;
    }

    const hasMaster = matched.some((m) => m.role === 'master_admin');
    const hasAdmin = matched.some((m) => m.role === 'admin' || m.role === 'owner');
    const hasUser = matched.some((m) => m.role === 'user');

    let detectedRole = 'user';
    let roleLabel = 'User (Team Member)';

    if (hasMaster) {
      detectedRole = 'master_admin';
      roleLabel = 'Master Admin';
    } else if (hasAdmin && hasUser) {
      detectedRole = 'multiple';
      roleLabel = 'Admin & User (Both Accounts)';
    } else if (hasAdmin) {
      detectedRole = 'admin';
      roleLabel = 'Admin (Workspace Owner)';
    } else {
      detectedRole = 'user';
      roleLabel = 'User (Team Member)';
    }

    res.json({
      found: true,
      role: detectedRole,
      roleLabel,
      displayName: matched[0]?.displayName || '',
      hasAdmin,
      hasUser,
      hasMaster,
    });
  } catch (err: any) {
    res.json({ found: false, error: err?.message });
  }
}

export async function handleTenantAuthLogin(req: Request, res: Response): Promise<void> {
  await ensureDefaultAccounts();

  try {
    const { identifier, password, expectedRole } = req.body;
    if (!identifier || !password) {
      res.status(400).json({ error: 'Username/Email/Mobile and Password are required.' });
      return;
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const cleanPass = String(password).trim();
    const inputDigits = cleanId.replace(/[^0-9]/g, '');
    const last10Input = inputDigits.length >= 10 ? inputDigits.slice(-10) : '';

    // Query user by email, phone, UID, or name
    let targetUser: UserProfile | null = null;

    // 1. Direct check for master admin root account
    if (cleanId === 'master@cloudwaba.com' || cleanId === 'masteradmin' || cleanId === 'master') {
      const snap = await getDoc(doc(serverDb, 'users', 'master_admin_root'));
      if (snap.exists()) {
        targetUser = snap.data() as UserProfile;
      }
    }

    // 2. Comprehensive lookup in Firestore 'users' collection
    if (!targetUser) {
      const usersSnap = await getDocs(collection(serverDb, 'users'));
      const matchingUsers: UserProfile[] = [];

      usersSnap.forEach((docSnap) => {
        const u = docSnap.data() as UserProfile;
        const uEmail = (u.email || '').toLowerCase().trim();
        const uPhone = (u.phone || '').trim();
        const uPhoneDigits = uPhone.replace(/[^0-9]/g, '');
        const last10UPhone = uPhoneDigits.length >= 10 ? uPhoneDigits.slice(-10) : '';
        const uUid = (u.uid || '').toLowerCase().trim();
        const uName = (u.displayName || '').toLowerCase().trim();

        const isExactMatch =
          cleanId === uEmail ||
          cleanId === uPhone.toLowerCase() ||
          cleanId === uUid ||
          cleanId === uName;

        const isPhoneMatch =
          (last10Input && last10UPhone && last10Input === last10UPhone) ||
          (inputDigits.length > 0 && inputDigits === uPhoneDigits);

        if (isExactMatch || isPhoneMatch) {
          matchingUsers.push(u);
        }
      });

      if (matchingUsers.length === 1) {
        targetUser = matchingUsers[0];
      } else if (matchingUsers.length > 1) {
        // If expectedRole is provided, check if that account password matches first
        if (expectedRole) {
          const expectedUser = matchingUsers.find((u) => u.role === expectedRole);
          if (expectedUser && verifyPassword(cleanPass, (expectedUser as any).loginPassword || '')) {
            targetUser = expectedUser;
          }
        }

        // If not matched yet, test password across all matching user accounts
        if (!targetUser) {
          const passMatched = matchingUsers.find((u) => {
            const hash = (u as any).loginPassword;
            return hash && verifyPassword(cleanPass, hash);
          });
          if (passMatched) {
            targetUser = passMatched;
          } else {
            // Fallback for role-specific error messaging
            if (expectedRole) {
              targetUser = matchingUsers.find((u) => u.role === expectedRole) || null;
            }
            if (!targetUser) {
              targetUser =
                matchingUsers.find((u) => u.role === 'admin' || u.role === 'owner') ||
                matchingUsers.find((u) => u.role === 'master_admin') ||
                matchingUsers[0];
            }
          }
        }
      }
    }

    if (!targetUser) {
      res.status(401).json({
        error: 'Account not found. Please verify your mobile number or email address.',
      });
      return;
    }

    // Actual user role
    const userRole = (targetUser as UserProfile).role || 'user';

    // Password Check
    const storedHash = (targetUser as any).loginPassword;
    const isPassValid = verifyPassword(cleanPass, storedHash || '');
    if (!isPassValid) {
      await recordAuditLog({
        actorId: (targetUser as UserProfile).uid,
        actorName: (targetUser as UserProfile).displayName || 'Unknown',
        actorRole: userRole,
        action: 'FAILED_LOGIN',
        organizationId: (targetUser as UserProfile).organizationId,
        details: `Failed password attempt for ${(targetUser as UserProfile).email || (targetUser as UserProfile).phone}`,
        ip: req.ip || '',
      });
      res.status(401).json({ error: 'Incorrect password. Please verify your credentials and try again.' });
      return;
    }

    // Account Status & Organization Verification
    const orgId = (targetUser as UserProfile).organizationId || `org_${(targetUser as UserProfile).uid}`;
    let orgData: Organization | null = null;
    if (orgId) {
      const orgSnap = await getDoc(doc(serverDb, 'organizations', orgId));
      if (orgSnap.exists()) {
        orgData = { id: orgSnap.id, ...(orgSnap.data() as any) };
      } else {
        orgData = {
          id: orgId,
          name: (targetUser as UserProfile).displayName ? `${(targetUser as UserProfile).displayName}'s Workspace` : 'Workspace',
          ownerId: (targetUser as UserProfile).uid,
          status: 'active',
          subscription: {
            planName: userRole === 'master_admin' ? 'Platform Super Admin' : 'Enterprise Unlimited',
            maxWhatsAppNumbers: userRole === 'master_admin' ? 100 : 10,
            maxUsers: userRole === 'master_admin' ? 1000 : 25,
            maxMonthlyBroadcasts: userRole === 'master_admin' ? 10000000 : 500000,
            maxContacts: 100000,
            expiresAt: '2099-12-31T23:59:59.000Z',
            status: 'active',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(serverDb, 'organizations', orgId), orgData).catch(console.warn);
      }
    }

    // Check if account or organization is suspended
    const isAccountSuspended =
      orgData?.status === 'suspended' ||
      (targetUser as UserProfile).subscription?.status === 'suspended';

    if (isAccountSuspended) {
      res.status(403).json({
        success: false,
        error: 'Aapka account ya workspace Master Admin dwara Suspend kar diya gaya hai. Kripya Master Admin se reactivate karwayein.',
      });
      return;
    }

    // Check if subscription has expired (except for Master Admin)
    if (userRole !== 'master_admin') {
      const expiresAt = (targetUser as UserProfile).subscription?.expiresAt || orgData?.subscription?.expiresAt;
      if (expiresAt && !isNaN(new Date(expiresAt).getTime()) && new Date(expiresAt).getTime() < Date.now()) {
        res.status(403).json({
          success: false,
          error: `Subscription plan expire ho chuka hai (0 days remaining - Expired on ${new Date(expiresAt).toLocaleDateString()}). Kripya Master Admin se plan renew ya validity extend karwayein.`,
        });
        return;
      }
    }

    // Record Successful Login
    await recordAuditLog({
      actorId: (targetUser as UserProfile).uid,
      actorName: (targetUser as UserProfile).displayName,
      actorRole: userRole,
      action: 'LOGIN',
      organizationId: orgId,
      details: `User logged in successfully via ${userRole} account.`,
      ip: req.ip || '',
    });

    // Sanitized user profile without password hash
    const { loginPassword, ...sanitizedProfile } = targetUser as any;

    res.json({
      success: true,
      user: sanitizedProfile,
      organization: orgData,
      role: userRole,
      sessionToken: `token_${crypto.randomBytes(24).toString('hex')}`,
    });
  } catch (err: any) {
    console.error('[TenantLogin] Error:', err);
    res.status(500).json({ error: err.message || 'Internal login error.' });
  }
}

// -------------------------------------------------------------
// MASTER ADMIN CONTROLLERS
// -------------------------------------------------------------

// Global Overview Metrics
export async function handleGetMasterOverview(req: Request, res: Response): Promise<void> {
  await ensureDefaultAccounts();

  try {
    const usersSnap = await getDocs(collection(serverDb, 'users'));
    const orgsSnap = await getDocs(collection(serverDb, 'organizations'));

    let totalAdmins = 0;
    let activeAdmins = 0;
    let suspendedAdmins = 0;
    let totalUsers = 0;
    let activeUsers = 0;
    let expiringSoon = 0;

    usersSnap.forEach((d) => {
      const u = d.data() as UserProfile;
      if (u.role === 'admin' || u.role === 'owner') {
        totalAdmins++;
        const isSusp = (u.subscription?.status === 'suspended');
        if (isSusp) suspendedAdmins++;
        else activeAdmins++;

        // Expiry check (< 7 days)
        if (u.subscription?.expiresAt) {
          const diff = new Date(u.subscription.expiresAt).getTime() - Date.now();
          if (diff > 0 && diff < 7 * 24 * 60 * 60 * 1000) {
            expiringSoon++;
          }
        }
      } else if (u.role === 'user') {
        totalUsers++;
        activeUsers++;
      }
    });

    // Calculate WhatsApp numbers across all organizations
    let totalWhatsAppNumbers = 0;
    let totalCampaigns = 0;
    let totalMessages = 0;
    let totalDelivered = 0;

    for (const orgDoc of orgsSnap.docs) {
      try {
        const waSnap = await getDocs(collection(serverDb, `organizations/${orgDoc.id}/whatsappAccounts`));
        totalWhatsAppNumbers += waSnap.size;

        const campSnap = await getDocs(collection(serverDb, `organizations/${orgDoc.id}/campaigns`));
        totalCampaigns += campSnap.size;

        campSnap.forEach((c) => {
          const cData = c.data() as any;
          if (cData.stats) {
            totalMessages += cData.stats.sent || 0;
            totalDelivered += cData.stats.delivered || 0;
          }
        });
      } catch (e) {}
    }

    res.json({
      totalAdmins,
      activeAdmins,
      suspendedAdmins,
      totalUsers,
      activeUsers,
      totalWhatsAppNumbers,
      totalCampaigns,
      totalMessages,
      totalDelivered,
      totalOrganizations: orgsSnap.size,
      expiringPlans: expiringSoon,
      systemHealth: 'HEALTHY',
      version: '3.2.0 (Multi-Tenant Enterprise)',
      uptime: process.uptime(),
    });
  } catch (err: any) {
    console.error('[MasterOverview] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch global overview' });
  }
}

// List all Admins with tenant stats
export async function handleGetMasterAdmins(req: Request, res: Response): Promise<void> {
  await ensureDefaultAccounts();

  try {
    const usersSnap = await getDocs(collection(serverDb, 'users'));
    const admins: any[] = [];

    for (const docSnap of usersSnap.docs) {
      const u = docSnap.data() as UserProfile;
      if (u.role === 'admin' || u.role === 'owner') {
        const orgId = u.organizationId;
        let usersCount = 0;
        let whatsAppCount = 0;
        let campaignsCount = 0;

        if (orgId) {
          try {
            // Count users under this admin's organization
            const orgUsersQuery = query(collection(serverDb, 'users'), where('organizationId', '==', orgId));
            const orgUsersSnap = await getDocs(orgUsersQuery);
            usersCount = orgUsersSnap.docs.filter((d) => {
              const r = (d.data() as any).role;
              return d.id !== docSnap.id && r !== 'admin' && r !== 'owner' && r !== 'master_admin';
            }).length;

            const waSnap = await getDocs(collection(serverDb, `organizations/${orgId}/whatsappAccounts`));
            whatsAppCount = waSnap.size;

            const campSnap = await getDocs(collection(serverDb, `organizations/${orgId}/campaigns`));
            campaignsCount = campSnap.size;
          } catch (e) {}
        }

        const { loginPassword, ...safeAdmin } = u as any;
        admins.push({
          ...safeAdmin,
          usersCount,
          whatsAppCount,
          campaignsCount,
        });
      }
    }

    res.json({ admins });
  } catch (err: any) {
    console.error('[MasterAdmins] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch admins list' });
  }
}

// Create Brand New Admin with completely FRESH, ZERO-DATA TENANT
export async function handleCreateMasterAdmin(req: Request, res: Response): Promise<void> {
  try {
    const {
      adminName,
      businessName,
      email,
      phone,
      password,
      planId,
      validityDays = 30,
      maxWhatsAppNumbers = 5,
      maxUsers = 10,
    } = req.body;

    if (!adminName || !password || (!email && !phone)) {
      res.status(400).json({ error: 'Admin Name, Password, and Email/Mobile are required.' });
      return;
    }

    const cleanPhone = String(phone || '').trim().replace(/[^0-9]/g, '');
    const cleanEmail = String(email || '').trim().toLowerCase();
    const uniqueSuffix = cleanPhone || `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const adminUid = `admin_${uniqueSuffix}`;

    // Brand new, completely ISOLATED organization ID
    const newOrgId = `org_${uniqueSuffix}`;

    const numValidityDays = Math.max(1, Number(validityDays) || 30);
    const expiresAt = new Date(Date.now() + numValidityDays * 24 * 60 * 60 * 1000).toISOString();

    const planName = planId === 'plan_starter'
      ? 'Starter'
      : planId === 'plan_enterprise'
      ? 'Enterprise Unlimited'
      : 'Professional';

    const safeMaxWhatsApp = Math.max(1, Number(maxWhatsAppNumbers) || 1);
    const safeMaxUsers = Math.max(1, Number(maxUsers) || 10);

    // 1. Create Brand New Organization document (EMPTY subcollections = FRESH 0 DATA)
    await setDoc(doc(serverDb, 'organizations', newOrgId), {
      id: newOrgId,
      name: businessName || `${adminName}'s Workspace`,
      ownerId: adminUid,
      status: 'active',
      subscription: {
        planId: planId || 'plan_pro',
        planName,
        maxWhatsAppNumbers: safeMaxWhatsApp,
        maxUsers: safeMaxUsers,
        maxMonthlyBroadcasts: 100000,
        maxContacts: 25000,
        validityDays: numValidityDays,
        startDate: new Date().toISOString(),
        expiresAt,
        status: 'active',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Create Admin User Profile with hashed password
    const adminProfile: UserProfile = {
      uid: adminUid,
      displayName: adminName,
      email: cleanEmail || `${cleanPhone || uniqueSuffix}@cloudwaba.internal`,
      phone: cleanPhone,
      role: 'admin',
      organizationId: newOrgId,
      loginPassword: hashPassword(password),
      displayPassword: password,
      subscription: {
        planId: planId || 'plan_pro',
        planName,
        maxWhatsAppNumbers: safeMaxWhatsApp,
        maxUsers: safeMaxUsers,
        maxMonthlyBroadcasts: 100000,
        maxContacts: 25000,
        validityDays: numValidityDays,
        startDate: new Date().toISOString(),
        expiresAt,
        status: 'active',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(serverDb, 'users', adminUid), adminProfile);

    // Record Audit
    await recordAuditLog({
      actorId: 'master_admin_root',
      actorName: 'Master Admin',
      actorRole: 'master_admin',
      action: 'CREATE_ADMIN',
      targetId: adminUid,
      targetType: 'admin',
      organizationId: newOrgId,
      details: `Created new Admin ${adminName} (${cleanPhone || cleanEmail}) with fresh 0-data workspace ${newOrgId}`,
    });

    res.json({
      success: true,
      message: `Admin ${adminName} created successfully with a clean, fresh 0-data workspace.`,
      admin: {
        uid: adminUid,
        displayName: adminName,
        phone: cleanPhone,
        email: cleanEmail || `${cleanPhone || uniqueSuffix}@cloudwaba.internal`,
        organizationId: newOrgId,
        expiresAt,
        validityDays: numValidityDays,
      },
    });
  } catch (err: any) {
    console.error('[CreateAdmin] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create admin.' });
  }
}

// Edit Admin (Extend validity, change plan, update limits, toggle status)
export async function handleUpdateMasterAdmin(req: Request, res: Response): Promise<void> {
  try {
    const { adminId } = req.params;
    const {
      status,
      extendDays,
      targetExpiresAt,
      setTotalDaysRemaining,
      planName,
      maxWhatsAppNumbers,
      maxUsers,
      displayName,
      newPassword,
    } = req.body;

    const userRef = doc(serverDb, 'users', adminId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      res.status(404).json({ error: 'Admin account not found.' });
      return;
    }

    const currentData = userSnap.data() as UserProfile;
    const orgId = currentData.organizationId;

    let expiresAt = currentData.subscription?.expiresAt;
    if (targetExpiresAt) {
      expiresAt = new Date(targetExpiresAt).toISOString();
    } else if (setTotalDaysRemaining !== undefined && setTotalDaysRemaining !== null && !isNaN(Number(setTotalDaysRemaining))) {
      const days = Number(setTotalDaysRemaining);
      expiresAt = new Date(Date.now() + Math.max(0, days) * 24 * 60 * 60 * 1000).toISOString();
    } else if (extendDays !== undefined && extendDays !== null && Number(extendDays) !== 0) {
      const currentExpiryMs = expiresAt ? new Date(expiresAt).getTime() : Date.now();
      const newMs = currentExpiryMs + Number(extendDays) * 24 * 60 * 60 * 1000;
      expiresAt = new Date(newMs).toISOString();
    }

    const remainingDaysCalculated = expiresAt
      ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : 30;

    const updatedSub = {
      ...(currentData.subscription || {}),
      ...(planName ? { planName } : {}),
      ...(maxWhatsAppNumbers ? { maxWhatsAppNumbers: Number(maxWhatsAppNumbers) } : {}),
      ...(maxUsers ? { maxUsers: Number(maxUsers) } : {}),
      ...(expiresAt ? { expiresAt, validityDays: remainingDaysCalculated } : {}),
      ...(status ? { status } : {}),
    };

    const updates: any = {
      subscription: updatedSub,
      updatedAt: new Date().toISOString(),
    };

    if (displayName) updates.displayName = displayName;
    if (newPassword && String(newPassword).trim().length >= 6) {
      updates.loginPassword = hashPassword(String(newPassword).trim());
    }

    await setDoc(userRef, updates, { merge: true });

    // Update organization record as well
    if (orgId) {
      await setDoc(doc(serverDb, 'organizations', orgId), {
        status: status || currentData.subscription?.status || 'active',
        subscription: updatedSub,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    await recordAuditLog({
      actorId: 'master_admin_root',
      actorName: 'Master Admin',
      actorRole: 'master_admin',
      action: 'UPDATE_ADMIN',
      targetId: adminId,
      targetType: 'admin',
      organizationId: orgId,
      details: `Updated Admin ${currentData.displayName}: status=${status || 'unchanged'}, extendedDays=${extendDays || 0}`,
    });

    res.json({ success: true, message: `Admin ${currentData.displayName} updated successfully.` });
  } catch (err: any) {
    console.error('[UpdateAdmin] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to update admin.' });
  }
}

// Reset Admin Password
export async function handleResetAdminPassword(req: Request, res: Response): Promise<void> {
  try {
    const { adminId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).trim().length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const userRef = doc(serverDb, 'users', adminId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      res.status(404).json({ error: 'Admin account not found.' });
      return;
    }

    await updateDoc(userRef, {
      loginPassword: hashPassword(String(newPassword).trim()),
      displayPassword: String(newPassword).trim(),
      updatedAt: new Date().toISOString(),
    });

    await recordAuditLog({
      actorId: 'master_admin_root',
      actorName: 'Master Admin',
      actorRole: 'master_admin',
      action: 'RESET_PASSWORD',
      targetId: adminId,
      targetType: 'admin',
      details: `Reset password for admin ${adminId}.`,
    });

    res.json({ success: true, message: 'Admin password reset successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset password.' });
  }
}

// Self Change Password (for user, admin, master admin) by providing Old Password + New Password
export async function handleSelfChangePassword(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, oldPassword, newPassword } = req.body;

    if (!identifier || !oldPassword || !newPassword) {
      res.status(400).json({ error: 'Mobile / Email, Old Password, and New Password are required.' });
      return;
    }

    if (String(newPassword).trim().length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      return;
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const cleanOldPass = String(oldPassword).trim();
    const cleanNewPass = String(newPassword).trim();
    const inputDigits = cleanId.replace(/[^0-9]/g, '');
    const last10Input = inputDigits.length >= 10 ? inputDigits.slice(-10) : '';

    let targetDocRef: any = null;
    let targetUser: UserProfile | null = null;

    // Check master admin root
    if (cleanId === 'master@cloudwaba.com' || cleanId === 'masteradmin' || cleanId === 'master') {
      const snap = await getDoc(doc(serverDb, 'users', 'master_admin_root'));
      if (snap.exists()) {
        targetDocRef = doc(serverDb, 'users', 'master_admin_root');
        targetUser = snap.data() as UserProfile;
      }
    }

    // Lookup in users collection
    if (!targetUser) {
      const usersSnap = await getDocs(collection(serverDb, 'users'));
      for (const dSnap of usersSnap.docs) {
        const u = dSnap.data() as UserProfile;
        const uEmail = (u.email || '').toLowerCase().trim();
        const uPhone = (u.phone || '').trim();
        const uPhoneDigits = uPhone.replace(/[^0-9]/g, '');
        const last10UPhone = uPhoneDigits.length >= 10 ? uPhoneDigits.slice(-10) : '';
        const uUid = (u.uid || '').toLowerCase().trim();

        if (
          cleanId === uEmail ||
          cleanId === uPhone.toLowerCase() ||
          cleanId === uUid ||
          (last10Input && last10UPhone && last10Input === last10UPhone) ||
          (inputDigits.length > 0 && inputDigits === uPhoneDigits)
        ) {
          targetDocRef = dSnap.ref;
          targetUser = u;
          break;
        }
      }
    }

    if (!targetUser || !targetDocRef) {
      res.status(404).json({ error: 'Account not found. Please check your mobile number or email.' });
      return;
    }

    // Verify old password
    const storedHash = (targetUser as any).loginPassword || (targetUser as any).displayPassword;
    const isOldValid = verifyPassword(cleanOldPass, storedHash || '') || (Boolean((targetUser as any).displayPassword) && cleanOldPass === String((targetUser as any).displayPassword).trim());
    if (!isOldValid) {
      res.status(401).json({ error: 'Incorrect Old Password. Please enter your valid current password.' });
      return;
    }

    // Hash and update new password
    await updateDoc(targetDocRef, {
      loginPassword: hashPassword(cleanNewPass),
      displayPassword: cleanNewPass,
      updatedAt: new Date().toISOString(),
    });

    await recordAuditLog({
      actorId: targetUser.uid,
      actorName: targetUser.displayName || targetUser.email,
      actorRole: targetUser.role,
      action: 'CHANGE_PASSWORD',
      organizationId: targetUser.organizationId,
      details: `${targetUser.role.toUpperCase()} ${targetUser.displayName} changed their password using old password verification.`,
      ip: req.ip || '',
    });

    res.json({
      success: true,
      message: 'Password successfully changed! You can now log in with your new password.',
    });
  } catch (err: any) {
    console.error('[ChangePassword] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to change password.' });
  }
}

// Delete Admin and Entire Tenant Workspace permanently
export async function handleDeleteMasterAdmin(req: Request, res: Response): Promise<void> {
  try {
    const { adminId } = req.params;
    if (!adminId) {
      res.status(400).json({ error: 'Admin ID is required.' });
      return;
    }

    if (adminId === 'master_admin_root') {
      res.status(403).json({ error: 'Cannot delete Master Platform Super Administrator.' });
      return;
    }

    const adminRef = doc(serverDb, 'users', adminId);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      res.status(404).json({ error: 'Admin account not found.' });
      return;
    }

    const adminData = adminSnap.data() as UserProfile;
    const orgId = adminData.organizationId;

    // 1. Delete all team users under this Admin's tenant organization
    if (orgId) {
      const usersQuery = query(collection(serverDb, 'users'), where('organizationId', '==', orgId));
      const usersSnap = await getDocs(usersQuery);
      for (const uDoc of usersSnap.docs) {
        await deleteDoc(uDoc.ref).catch(console.warn);
      }

      // 2. Clean up tenant subcollections (whatsappAccounts, campaigns, contacts, templates)
      const subcollections = ['whatsappAccounts', 'campaigns', 'contacts', 'templates'];
      for (const subName of subcollections) {
        try {
          const subSnap = await getDocs(collection(serverDb, `organizations/${orgId}/${subName}`));
          for (const sDoc of subSnap.docs) {
            await deleteDoc(sDoc.ref).catch(console.warn);
          }
        } catch (e) {}
      }

      // 3. Delete organization document
      await deleteDoc(doc(serverDb, 'organizations', orgId)).catch(console.warn);
    }

    // 3. Delete admin user document
    await deleteDoc(adminRef).catch(console.warn);

    // 4. Audit Log
    await recordAuditLog({
      actorId: 'master_admin_root',
      actorName: 'Master Admin',
      actorRole: 'master_admin',
      action: 'DELETE_ADMIN',
      targetId: adminId,
      targetType: 'admin',
      organizationId: orgId,
      details: `Permanently deleted Admin ${adminData.displayName} (${adminData.email || adminData.phone}) and workspace ${orgId}`,
    });

    res.json({
      success: true,
      message: `Admin ${adminData.displayName} and their tenant workspace have been deleted.`,
    });
  } catch (err: any) {
    console.error('[DeleteMasterAdmin] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete admin.' });
  }
}

// Impersonate Admin: Creates secure temporary session for Master Admin
export async function handleMasterImpersonate(req: Request, res: Response): Promise<void> {
  try {
    const { adminId } = req.body;
    if (!adminId) {
      res.status(400).json({ error: 'Admin ID is required for impersonation.' });
      return;
    }

    const adminRef = doc(serverDb, 'users', adminId);
    const adminSnap = await getDoc(adminRef);

    if (!adminSnap.exists()) {
      res.status(404).json({ error: 'Admin account not found.' });
      return;
    }

    const adminData = adminSnap.data() as UserProfile;
    const orgId = adminData.organizationId;
    let orgData: any = null;
    if (orgId) {
      const orgSnap = await getDoc(doc(serverDb, 'organizations', orgId));
      if (orgSnap.exists()) {
        orgData = { id: orgSnap.id, ...orgSnap.data() };
      }
    }

    await recordAuditLog({
      actorId: 'master_admin_root',
      actorName: 'Master Admin',
      actorRole: 'master_admin',
      action: 'IMPERSONATE_ADMIN',
      targetId: adminId,
      targetType: 'admin',
      organizationId: orgId,
      details: `Master Admin started support impersonation session into Admin ${adminData.displayName} (${orgId})`,
      ip: req.ip || '',
    });

    const { loginPassword, ...safeAdmin } = adminData as any;

    res.json({
      success: true,
      impersonated: true,
      admin: safeAdmin,
      organization: orgData,
      impersonator: {
        uid: 'master_admin_root',
        name: 'Master Admin',
      },
    });
  } catch (err: any) {
    console.error('[Impersonate] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to impersonate admin.' });
  }
}

// Global Plans
export async function handleGetMasterPlans(req: Request, res: Response): Promise<void> {
  try {
    const plansSnap = await getDocs(collection(serverDb, 'plans'));
    const plans: SaaSPlan[] = [];
    plansSnap.forEach((p) => plans.push(p.data() as SaaSPlan));

    if (plans.length === 0) {
      res.json({ plans: DEFAULT_SAAS_PLANS });
    } else {
      res.json({ plans });
    }
  } catch (err: any) {
    res.json({ plans: DEFAULT_SAAS_PLANS });
  }
}

export async function handleSaveMasterPlan(req: Request, res: Response): Promise<void> {
  try {
    const plan = req.body as SaaSPlan;
    if (!plan.id || !plan.name) {
      res.status(400).json({ error: 'Plan ID and Name are required.' });
      return;
    }

    await setDoc(doc(serverDb, 'plans', plan.id), plan);
    await recordAuditLog({
      actorId: 'master_admin_root',
      actorName: 'Master Admin',
      actorRole: 'master_admin',
      action: 'SAVE_PLAN',
      targetId: plan.id,
      details: `Saved SaaS plan ${plan.name} (${plan.price} ${plan.currency})`,
    });

    res.json({ success: true, plan });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save plan.' });
  }
}

// Global Audit Logs (Master)
export async function handleGetMasterAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const logsSnap = await getDocs(collection(serverDb, 'audit_logs'));
    const logs: AuditLog[] = [];
    logsSnap.forEach((d) => logs.push(d.data() as AuditLog));

    // Sort descending by timestamp
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ logs: logs.slice(0, 100) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch audit logs.' });
  }
}

// Global Feature Flags
export async function handleGetMasterFeatures(req: Request, res: Response): Promise<void> {
  res.json({ features: globalFeatureFlags });
}

export async function handleUpdateMasterFeatures(req: Request, res: Response): Promise<void> {
  try {
    const { features } = req.body;
    if (features) {
      globalFeatureFlags = { ...globalFeatureFlags, ...features };
    }
    await recordAuditLog({
      actorId: 'master_admin_root',
      actorName: 'Master Admin',
      actorRole: 'master_admin',
      action: 'UPDATE_FEATURE_FLAGS',
      details: `Updated platform global feature flags: ${JSON.stringify(features)}`,
    });
    res.json({ success: true, features: globalFeatureFlags });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update features.' });
  }
}

// -------------------------------------------------------------
// ADMIN LEVEL CONTROLLERS (TENANT ISOLATED)
// -------------------------------------------------------------

// Get Users under this Admin's Organization ONLY
export async function handleGetAdminUsers(req: Request, res: Response): Promise<void> {
  try {
    const orgId = req.headers['x-organization-id'] as string || req.query.orgId as string;
    if (!orgId) {
      res.status(400).json({ error: 'Tenant organization ID is required.' });
      return;
    }

    const q = query(
      collection(serverDb, 'users'),
      where('organizationId', '==', orgId)
    );
    const snap = await getDocs(q);
    const users: any[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      // Filter out admin / owner / master admin accounts so only team users are returned
      if (data.role === 'admin' || data.role === 'owner' || data.role === 'master_admin') {
        return;
      }
      const { loginPassword, ...u } = data;
      users.push({
        ...u,
        displayPassword: data.displayPassword || '(Password Protected)',
      });
    });

    res.json({ users });
  } catch (err: any) {
    console.error('[AdminUsers] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch tenant users.' });
  }
}

// Create a User under this Admin's Tenant
export async function handleCreateAdminUser(req: Request, res: Response): Promise<void> {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId;
    const adminId = (req.headers['x-admin-id'] as string) || req.body.adminId;
    const {
      name,
      email,
      phone,
      password,
      permissions,
      designation,
      validityDays = 30,
      maxWhatsAppNumbers = 1,
      status = 'active',
    } = req.body;

    if (!orgId || !name || !password) {
      res.status(400).json({ error: 'Organization ID, Name, and Password are required.' });
      return;
    }

    // Check Admin's plan limits for max users
    const orgSnap = await getDoc(doc(serverDb, 'organizations', orgId));
    if (orgSnap.exists()) {
      const orgData = orgSnap.data() as Organization;
      const maxAllowed = orgData.subscription?.maxUsers || 10;
      const currentUsersQuery = query(
        collection(serverDb, 'users'),
        where('organizationId', '==', orgId),
        where('role', '==', 'user')
      );
      const currentSnap = await getDocs(currentUsersQuery);
      if (currentSnap.size >= maxAllowed) {
        res.status(403).json({
          error: `User Limit Reached: Your current plan allows maximum ${maxAllowed} users. Please contact your administrator to upgrade.`,
        });
        return;
      }
    }

    const cleanPhone = String(phone || '').trim().replace(/[^0-9]/g, '');
    const cleanEmail = String(email || '').trim().toLowerCase();
    const userId = `usr_${cleanPhone || Date.now().toString()}`;

    const expiresAt =
      validityDays && Number(validityDays) > 0
        ? new Date(Date.now() + Number(validityDays) * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

    const userProfile: UserProfile = {
      uid: userId,
      displayName: name,
      email: cleanEmail || `${cleanPhone}@cloudwaba.internal`,
      phone: cleanPhone,
      role: 'user',
      organizationId: orgId,
      managedByAdminId: adminId || '',
      loginPassword: hashPassword(password),
      displayPassword: password,
      subscription: {
        planName: designation || 'Team Member',
        status: status || 'active',
        features: permissions || {},
        expiresAt,
        validityDays: Number(validityDays) || 30,
        maxWhatsAppNumbers: Math.max(1, Number(maxWhatsAppNumbers) || 1),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(serverDb, 'users', userId), userProfile);

    await recordAuditLog({
      actorId: adminId || 'admin',
      actorName: 'Tenant Admin',
      actorRole: 'admin',
      action: 'CREATE_USER',
      targetId: userId,
      targetType: 'user',
      organizationId: orgId,
      details: `Admin created team user ${name} (${cleanPhone || cleanEmail}) with validity ${validityDays} days`,
    });

    const { loginPassword, ...safeUser } = userProfile as any;
    res.json({ success: true, user: safeUser });
  } catch (err: any) {
    console.error('[CreateUser] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create user.' });
  }
}

// Update User (Edit name, phone, email, designation, permissions, validity, status)
export async function handleUpdateAdminUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId;
    const adminId = (req.headers['x-admin-id'] as string) || req.body.adminId;
    const {
      displayName,
      phone,
      email,
      designation,
      status,
      permissions,
      extendDays,
      maxWhatsAppNumbers,
      newPassword,
    } = req.body;

    const userRef = doc(serverDb, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const currentData = userSnap.data() as UserProfile;
    // Security check: ensure user belongs to this admin's organization
    if (orgId && currentData.organizationId !== orgId) {
      res.status(403).json({ error: 'Unauthorized to modify user from another organization.' });
      return;
    }

    let expiresAt = currentData.subscription?.expiresAt;
    if (req.body.targetExpiresAt) {
      expiresAt = new Date(req.body.targetExpiresAt).toISOString();
    } else if (req.body.setTotalDaysRemaining !== undefined && req.body.setTotalDaysRemaining !== null && !isNaN(Number(req.body.setTotalDaysRemaining))) {
      const days = Number(req.body.setTotalDaysRemaining);
      expiresAt = new Date(Date.now() + Math.max(0, days) * 24 * 60 * 60 * 1000).toISOString();
    } else if (extendDays !== undefined && extendDays !== null && Number(extendDays) !== 0) {
      const currentExpiryMs = expiresAt ? new Date(expiresAt).getTime() : Date.now();
      const newMs = currentExpiryMs + Number(extendDays) * 24 * 60 * 60 * 1000;
      expiresAt = new Date(newMs).toISOString();
    }

    const remainingDaysCalculated = expiresAt
      ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : 30;

    const updatedSub = {
      ...(currentData.subscription || {}),
      ...(designation ? { planName: designation } : {}),
      ...(status ? { status } : {}),
      ...(expiresAt ? { expiresAt, validityDays: remainingDaysCalculated } : {}),
      ...(permissions ? { features: permissions } : {}),
      ...(maxWhatsAppNumbers !== undefined ? { maxWhatsAppNumbers: Math.max(1, Number(maxWhatsAppNumbers)) } : {}),
    };

    const updates: any = {
      subscription: updatedSub,
      updatedAt: new Date().toISOString(),
    };

    if (displayName) updates.displayName = displayName;
    if (phone !== undefined) updates.phone = String(phone).replace(/[^0-9]/g, '');
    if (email !== undefined) updates.email = String(email).trim().toLowerCase();
    if (newPassword && String(newPassword).trim().length >= 6) {
      updates.loginPassword = hashPassword(String(newPassword).trim());
    }

    await setDoc(userRef, updates, { merge: true });

    await recordAuditLog({
      actorId: adminId || 'admin',
      actorName: 'Tenant Admin',
      actorRole: 'admin',
      action: 'UPDATE_USER',
      targetId: userId,
      targetType: 'user',
      organizationId: currentData.organizationId,
      details: `Updated team user ${displayName || currentData.displayName}, status: ${status || currentData.subscription?.status}`,
    });

    res.json({ success: true, message: `User ${displayName || currentData.displayName} updated successfully.` });
  } catch (err: any) {
    console.error('[UpdateAdminUser] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to update user.' });
  }
}

// Reset User Password
export async function handleResetAdminUserPassword(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const orgId = req.headers['x-organization-id'] as string;
    const isMaster = req.headers['x-is-master'] === 'true';
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).trim().length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const userRef = doc(serverDb, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const currentData = userSnap.data() as UserProfile;
    if (!isMaster && orgId && currentData.organizationId !== orgId) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }

    await updateDoc(userRef, {
      loginPassword: hashPassword(String(newPassword).trim()),
      displayPassword: String(newPassword).trim(),
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'User password reset successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset password.' });
  }
}

// Delete User
export async function handleDeleteAdminUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const orgId = req.headers['x-organization-id'] as string;
    const isMaster = req.headers['x-is-master'] === 'true';

    const userRef = doc(serverDb, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const currentData = userSnap.data() as UserProfile;
    if (!isMaster && orgId && currentData.organizationId !== orgId) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }

    await deleteDoc(userRef);

    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete user.' });
  }
}

// Admin / Master Impersonate User ("Watch / Login As User")
export async function handleAdminImpersonate(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.body;
    const orgId = req.headers['x-organization-id'] as string;
    const adminId = req.headers['x-admin-id'] as string;
    const isMaster =
      req.headers['x-is-master'] === 'true' ||
      adminId === 'master_admin_root' ||
      !orgId ||
      orgId === 'org_master_platform';

    if (!userId) {
      res.status(400).json({ error: 'User ID is required.' });
      return;
    }

    const userRef = doc(serverDb, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const userData = userSnap.data() as UserProfile;
    if (!isMaster && orgId && userData.organizationId !== orgId) {
      res.status(403).json({ error: 'Cannot watch or impersonate a user from another organization.' });
      return;
    }

    let orgData: any = null;
    if (userData.organizationId) {
      const orgSnap = await getDoc(doc(serverDb, 'organizations', userData.organizationId));
      if (orgSnap.exists()) {
        orgData = { id: orgSnap.id, ...orgSnap.data() };
      }
    }

    const { loginPassword, ...safeUser } = userData as any;

    res.json({
      success: true,
      impersonated: true,
      user: safeUser,
      organization: orgData,
      impersonator: {
        masterId: isMaster ? 'master_admin_root' : (adminId || 'admin_user'),
        masterName: isMaster ? 'Master Admin' : 'Tenant Admin',
        role: isMaster ? 'master_admin' : 'admin',
      },
    });
  } catch (err: any) {
    console.error('[AdminImpersonate] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to impersonate user.' });
  }
}
