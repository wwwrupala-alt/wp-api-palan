import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db, googleProvider, testConnection } from '../lib/firebase.ts';
import type { UserProfile, Organization, UserRole } from '../types/index.ts';

export interface CustomUser {
  uid: string;
  email: string;
  displayName: string;
}

export interface ImpersonationInfo {
  masterId: string;
  masterName: string;
  role?: 'master_admin' | 'admin';
}

// Session security timeouts
export const IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours (10,800,000 ms) of inactivity
export const IDLE_WARNING_BUFFER_MS = 5 * 60 * 1000; // Show warning modal when 5 minutes remaining

export const STORAGE_SESSION_START = 'cw_session_start_time';
export const STORAGE_LAST_ACTIVITY = 'cw_last_activity_time';
export const STORAGE_LOGOUT_NOTICE = 'cw_logout_notice';

const clearAllSessionStorage = () => {
  localStorage.removeItem(STORAGE_SESSION_START);
  localStorage.removeItem(STORAGE_LAST_ACTIVITY);
  localStorage.removeItem(STORAGE_LOGOUT_NOTICE);
  localStorage.removeItem('cw_logout_notice');
  localStorage.removeItem('cw_multi_tenant_session');
  localStorage.removeItem('cw_custom_session');
  localStorage.removeItem('cw_impersonation_session');
  localStorage.removeItem('cw_master_backup_session');
  localStorage.removeItem('cw_admin_backup_session');
  localStorage.removeItem('cw_admin_backup_org');
};

interface AuthContextType {
  currentUser: FirebaseUser | CustomUser | null;
  userProfile: UserProfile | null;
  organization: Organization | null;
  impersonatedBy: ImpersonationInfo | null;
  isMasterAdmin: boolean;
  isAdmin: boolean;
  isUser: boolean;
  loading: boolean;
  dbConnected: boolean;
  isIdleWarningOpen: boolean;
  idleSecondsRemaining: number;
  resetIdleTimer: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithCredentials: (identifier: string, password: string, expectedRole?: UserRole) => Promise<void>;
  impersonateAdmin: (adminId: string) => Promise<void>;
  impersonateUser: (userId: string) => Promise<void>;
  returnToMasterAdmin: () => Promise<void>;
  signOut: (reason?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  getServerNow: () => number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | CustomUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [impersonatedBy, setImpersonatedBy] = useState<ImpersonationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(true);
  const [serverOffset, setServerOffset] = useState<number>(0);

  // Inactivity warning state (triggers when 5 minutes or less remain before 3-hour timeout)
  const [isIdleWarningOpen, setIsIdleWarningOpen] = useState(false);
  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState(0);

  const resetIdleTimer = () => {
    const now = Date.now();
    localStorage.setItem(STORAGE_LAST_ACTIVITY, String(now));
    setIsIdleWarningOpen(false);
    setIdleSecondsRemaining(0);
  };

  // Sync with Cloud Server UTC standard time to prevent client PC clock manipulation
  useEffect(() => {
    fetch('/api/server-time')
      .then((res) => res.json())
      .then((data) => {
        if (data.timestamp) {
          setServerOffset(data.timestamp - Date.now());
        }
      })
      .catch(() => {});
  }, []);

  const getServerNow = () => Date.now() + serverOffset;

  const isMasterAdmin = userProfile?.role === 'master_admin';
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'owner';
  const isUser = userProfile?.role === 'user';

  // Validate Firestore server connection on boot
  useEffect(() => {
    testConnection().then((connected) => {
      setDbConnected(connected);
    });
  }, []);

  const loadUserData = async (user: { uid: string; email?: string | null; displayName?: string | null }) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const profile = userSnap.data() as UserProfile;
        setUserProfile(profile);

        const targetOrgId = profile.organizationId || (user.uid === 'master_admin_root' ? 'org_master_platform' : `org_${user.uid}`);
        const fallbackOrg: Organization = {
          id: targetOrgId,
          name: profile.displayName ? `${profile.displayName}'s Workspace` : 'Workspace',
          ownerId: user.uid,
          status: 'active',
          createdAt: profile.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Guarantee organization is non-null immediately
        setOrganization((prev) => prev || fallbackOrg);

        const orgRef = doc(db, 'organizations', targetOrgId);
        onSnapshot(orgRef, (orgSnap) => {
          if (orgSnap.exists()) {
            const rawData = orgSnap.data() as Organization;
            setOrganization({
              ...rawData,
              id: orgSnap.id,
            } as Organization);
          } else {
            setOrganization(fallbackOrg);
          }
        });
      }
    } catch (error) {
      console.warn('Profile load resilient fallback:', error);
    }
  };

  useEffect(() => {
    // Clear any residual session expired notices immediately
    localStorage.removeItem(STORAGE_LOGOUT_NOTICE);
    localStorage.removeItem('cw_logout_notice');

    const now = Date.now();
    const sessionStartStr = localStorage.getItem(STORAGE_SESSION_START);

    const hasStoredSession =
      Boolean(localStorage.getItem('cw_impersonation_session')) ||
      Boolean(localStorage.getItem('cw_multi_tenant_session')) ||
      Boolean(localStorage.getItem('cw_custom_session'));

    if (hasStoredSession) {
      if (!sessionStartStr) {
        localStorage.setItem(STORAGE_SESSION_START, String(now));
      }
      localStorage.setItem(STORAGE_LAST_ACTIVITY, String(now));
    }

    // 1. Check if an impersonation session is active
    const savedImpersonation = localStorage.getItem('cw_impersonation_session');
    if (savedImpersonation) {
      try {
        const impData = JSON.parse(savedImpersonation);
        if (impData.admin && impData.impersonator) {
          setCurrentUser(impData.admin);
          setUserProfile(impData.admin);
          setOrganization(impData.organization || null);
          setImpersonatedBy(impData.impersonator);
          setLoading(false);
          return;
        }
      } catch (e) {
        localStorage.removeItem('cw_impersonation_session');
      }
    }

    // 2. Check if custom multi-tenant session was saved
    const savedSession = localStorage.getItem('cw_multi_tenant_session') || localStorage.getItem('cw_custom_session');
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed.uid) {
          setCurrentUser(parsed);
          setUserProfile(parsed);
          if (parsed.organizationId) {
            setOrganization({
              id: parsed.organizationId,
              name: parsed.displayName ? `${parsed.displayName}'s Workspace` : 'Tenant Workspace',
              ownerId: parsed.uid,
              status: 'active',
              createdAt: parsed.createdAt || new Date().toISOString(),
              updatedAt: parsed.updatedAt || new Date().toISOString(),
            });
          }
          loadUserData(parsed).finally(() => setLoading(false));
          return;
        }
      } catch (err) {
        localStorage.removeItem('cw_multi_tenant_session');
        localStorage.removeItem('cw_custom_session');
      }
    }

    // 3. Fallback to Firebase Auth
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await loadUserData(user);
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setOrganization(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Monitor idle activity and fixed session duration when user is authenticated
  useEffect(() => {
    if (!currentUser) {
      setIsIdleWarningOpen(false);
      setIdleSecondsRemaining(0);
      return;
    }

    let lastRecordedActivity = Date.now();

    // Throttled interaction tracker (at most once every 5 seconds)
    const handleUserActivity = () => {
      const current = Date.now();
      if (current - lastRecordedActivity >= 5000) {
        lastRecordedActivity = current;
        localStorage.setItem(STORAGE_LAST_ACTIVITY, String(current));
        if (isIdleWarningOpen) {
          setIsIdleWarningOpen(false);
          setIdleSecondsRemaining(0);
        }
      }
    };

    // Evaluate idle limits
    const evaluateSessionStatus = () => {
      const currentNow = Date.now();
      const lastActivity = Number(localStorage.getItem(STORAGE_LAST_ACTIVITY)) || currentNow;

      // Idle 3-hour inactivity timeout check
      const idleElapsed = currentNow - lastActivity;
      if (idleElapsed >= IDLE_TIMEOUT_MS) {
        signOut('inactivity');
        return;
      }

      // 3. Inactivity warning modal when within 5 minutes of 3-hour timeout
      const remainingIdle = IDLE_TIMEOUT_MS - idleElapsed;
      if (remainingIdle <= IDLE_WARNING_BUFFER_MS && remainingIdle > 0) {
        setIsIdleWarningOpen(true);
        setIdleSecondsRemaining(Math.ceil(remainingIdle / 1000));
      } else if (remainingIdle > IDLE_WARNING_BUFFER_MS && isIdleWarningOpen) {
        setIsIdleWarningOpen(false);
        setIdleSecondsRemaining(0);
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    // Check status every 10 seconds
    const intervalId = setInterval(evaluateSessionStatus, 10000);

    // Immediate check on tab focus or visibility change (e.g., wake from sleep)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        evaluateSessionStatus();
      }
    };

    // Cross-tab synchronization
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cw_multi_tenant_session' && !e.newValue) {
        signOut();
      } else if (e.key === STORAGE_LAST_ACTIVITY) {
        evaluateSessionStatus();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [currentUser, isIdleWarningOpen]);

  const signInWithCredentials = async (identifier: string, pass: string, expectedRole?: UserRole) => {
    const cleanId = identifier.trim();
    const cleanPass = pass.trim();

    // Call server-side multi-tenant login API endpoint
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: cleanId,
        password: cleanPass,
        expectedRole,
      }),
    });

    let data: any = null;
    const responseText = await response.text();
    try {
      data = JSON.parse(responseText);
    } catch {
      // response was not JSON (e.g. HTML error page or proxy error)
    }

    if (!response.ok || !data || !data.success) {
      const serverMsg = data?.error || (typeof data === 'string' ? data : null);
      if (serverMsg) {
        throw new Error(serverMsg);
      }
      if (response.status === 403) {
        throw new Error('Subscription plan expire ho chuka hai (0 days remaining) ya account suspended hai. Kripya Master Admin se plan renew ya validity extend karwayein.');
      }
      throw new Error(`Authentication failed (${response.status}). Please verify credentials.`);
    }

    const user: UserProfile = data.user;
    const org: Organization = data.organization;

    // Clear any leftover impersonation state
    localStorage.removeItem('cw_impersonation_session');
    localStorage.removeItem('cw_master_backup_session');
    setImpersonatedBy(null);

    // Save session timestamps for 24h fixed expiry and 3h idle timeout
    const now = Date.now();
    localStorage.setItem(STORAGE_SESSION_START, String(now));
    localStorage.setItem(STORAGE_LAST_ACTIVITY, String(now));
    localStorage.removeItem(STORAGE_LOGOUT_NOTICE);

    // Save session
    localStorage.setItem('cw_multi_tenant_session', JSON.stringify(user));
    setCurrentUser(user);
    setUserProfile(user);
    setOrganization(org);

    // If client requested specific tab, route cleanly
    await loadUserData(user);
  };

  const impersonateAdmin = async (adminId: string) => {
    if (!isMasterAdmin && !localStorage.getItem('cw_master_backup_session')) {
      throw new Error('Only Master Administrator can initiate impersonation.');
    }

    const response = await fetch('/api/master/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to start impersonation session.');
    }

    // Backup current Master Admin session
    if (userProfile && userProfile.role === 'master_admin') {
      localStorage.setItem('cw_master_backup_session', JSON.stringify(userProfile));
    }

    // Save impersonation session
    const impInfo: ImpersonationInfo = data.impersonator || {
      masterId: 'master_admin_root',
      masterName: 'Master Admin',
    };

    localStorage.setItem(
      'cw_impersonation_session',
      JSON.stringify({
        admin: data.admin,
        organization: data.organization,
        impersonator: impInfo,
      })
    );

    setCurrentUser(data.admin);
    setUserProfile(data.admin);
    setOrganization(data.organization);
    setImpersonatedBy(impInfo);
  };

  const impersonateUser = async (userId: string) => {
    if (!isAdmin && !isMasterAdmin && !localStorage.getItem('cw_admin_backup_session')) {
      throw new Error('Only Administrator can watch or test team user accounts.');
    }

    const isMaster = isMasterAdmin || userProfile?.role === 'master_admin';
    const orgId = organization?.id || userProfile?.organizationId;
    const response = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-organization-id': orgId || '',
        'x-admin-id': userProfile?.uid || '',
        'x-is-master': isMaster ? 'true' : 'false',
      },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to start user watch session.');
    }

    // Backup current session for return
    if (isMaster) {
      if (userProfile) {
        localStorage.setItem('cw_master_backup_session', JSON.stringify(userProfile));
      }
    } else if (userProfile && (userProfile.role === 'admin' || userProfile.role === 'owner')) {
      localStorage.setItem('cw_admin_backup_session', JSON.stringify(userProfile));
      if (organization) {
        localStorage.setItem('cw_admin_backup_org', JSON.stringify(organization));
      }
    }

    const impInfo: ImpersonationInfo = {
      masterId: userProfile?.uid || (isMaster ? 'master_admin_root' : 'admin'),
      masterName: userProfile?.displayName || (isMaster ? 'Master Admin' : 'Admin'),
      role: isMaster ? 'master_admin' : 'admin',
    };

    localStorage.setItem(
      'cw_impersonation_session',
      JSON.stringify({
        user: data.user,
        organization: data.organization || organization,
        impersonator: impInfo,
      })
    );

    setCurrentUser(data.user);
    setUserProfile(data.user);
    if (data.organization) {
      setOrganization(data.organization);
    }
    setImpersonatedBy(impInfo);
  };

  const returnToMasterAdmin = async () => {
    const adminBackup = localStorage.getItem('cw_admin_backup_session');
    const adminBackupOrg = localStorage.getItem('cw_admin_backup_org');
    const masterBackup = localStorage.getItem('cw_master_backup_session');

    localStorage.removeItem('cw_impersonation_session');
    setImpersonatedBy(null);

    // 1. If returning from Admin watching a Team User
    if (adminBackup) {
      localStorage.removeItem('cw_admin_backup_session');
      localStorage.removeItem('cw_admin_backup_org');
      try {
        const adminUser = JSON.parse(adminBackup);
        localStorage.setItem('cw_multi_tenant_session', JSON.stringify(adminUser));
        setCurrentUser(adminUser);
        setUserProfile(adminUser);
        if (adminBackupOrg) {
          setOrganization(JSON.parse(adminBackupOrg));
        }
        await loadUserData(adminUser);
        return;
      } catch (e) {}
    }

    // 2. If returning from Master Admin watching an Admin
    if (masterBackup) {
      localStorage.removeItem('cw_master_backup_session');
      try {
        const masterUser = JSON.parse(masterBackup);
        localStorage.setItem('cw_multi_tenant_session', JSON.stringify(masterUser));
        setCurrentUser(masterUser);
        setUserProfile(masterUser);
        const masterOrg: Organization = {
          id: masterUser.organizationId || 'org_master_platform',
          name: 'Master Platform Workspace',
          ownerId: masterUser.uid,
          status: 'active',
          createdAt: masterUser.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setOrganization(masterOrg);
        await loadUserData(masterUser);
        return;
      } catch (e) {}
    }

    // Fallback: reload Master Admin account
    await signInWithCredentials('master@cloudwaba.com', 'Master@12345', 'master_admin');
  };

  const signInWithGoogle = async () => {
    const res = await signInWithPopup(auth, googleProvider);
    if (res.user) {
      const now = Date.now();
      localStorage.setItem(STORAGE_SESSION_START, String(now));
      localStorage.setItem(STORAGE_LAST_ACTIVITY, String(now));
      localStorage.removeItem(STORAGE_LOGOUT_NOTICE);
      await loadUserData(res.user);
    }
  };

  const signOut = async (_reason?: string) => {
    localStorage.removeItem(STORAGE_LOGOUT_NOTICE);
    localStorage.removeItem('cw_logout_notice');
    clearAllSessionStorage();
    setImpersonatedBy(null);
    setCurrentUser(null);
    setUserProfile(null);
    setOrganization(null);
    setIsIdleWarningOpen(false);
    setIdleSecondsRemaining(0);
    try {
      await fbSignOut(auth);
    } catch (e) {}
  };

  const refreshProfile = async () => {
    if (currentUser) {
      await loadUserData(currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        organization,
        impersonatedBy,
        isMasterAdmin,
        isAdmin,
        isUser,
        loading,
        dbConnected,
        isIdleWarningOpen,
        idleSecondsRemaining,
        resetIdleTimer,
        signInWithGoogle,
        signInWithCredentials,
        impersonateAdmin,
        impersonateUser,
        returnToMasterAdmin,
        signOut,
        refreshProfile,
        getServerNow,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
