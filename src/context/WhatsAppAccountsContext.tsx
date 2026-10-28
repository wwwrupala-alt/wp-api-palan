import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { useAuth } from './AuthContext.tsx';
import type { WhatsAppAccount, MetaConfigStatus, ConnectionHealthReport } from '../types/index.ts';
import { parseMessagingLimitTier } from '../lib/metaLimits.ts';

async function parseJsonResponse<T = any>(res: Response, fallbackError: string): Promise<T> {
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('API route not found (404). Please ensure server is running.');
      }
      throw new Error(`Server returned error status ${res.status}.`);
    }
    throw new Error('Invalid response received from server.');
  }

  if (!res.ok) {
    throw new Error(json?.error || json?.message || fallbackError);
  }

  return json;
}

interface WhatsAppAccountsContextType {
  accounts: WhatsAppAccount[];
  activeAccount: WhatsAppAccount | null;
  loading: boolean;
  metaStatus: MetaConfigStatus | null;
  setActiveAccount: (account: WhatsAppAccount | null) => void;
  connectViaEmbeddedSignup: (options?: {
    isCoexistence?: boolean;
    featureType?: string;
    sessionInfoVersion?: '4' | '3' | '2';
    migrationMode?: boolean;
  }) => Promise<void>;
  checkWabaMigration: (params: {
    wabaId?: string;
    phoneNumberId?: string;
    customToken?: string;
  }) => Promise<{
    success: boolean;
    eligible?: boolean;
    waba?: any;
    phone?: any;
    phoneNumbers?: any[];
    migrationStatus?: string;
    recommendation?: string;
    error?: string;
  }>;
  triggerWabaMigration: (params: {
    wabaId: string;
    phoneNumberId: string;
    pin?: string;
    action?: 'register_and_migrate' | 'request_code' | 'verify_code';
    codeMethod?: 'SMS' | 'VOICE';
    otpCode?: string;
    customToken?: string;
  }) => Promise<{
    success: boolean;
    migrated?: boolean;
    step?: string;
    message?: string;
    account?: any;
    error?: string;
  }>;
  connectManualAccount: (params: {
    phoneNumberId: string;
    wabaId?: string;
    customToken?: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    pin?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  testMetaCredentials: (params: {
    phoneNumberId: string;
    wabaId?: string;
    customToken: string;
  }) => Promise<{ success: boolean; diagnostics?: any; error?: string }>;
  registerPhoneNumber: (params: {
    phoneNumberId: string;
    pin: string;
    customToken?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  syncAccountWithMeta: (account: WhatsAppAccount) => Promise<{ success: boolean; error?: string }>;
  updateAccountToken: (accountId: string, customToken: string) => Promise<{ success: boolean; error?: string }>;
  logAccountRecharge: (
    accountId: string,
    amount: number,
    currency: string,
    note?: string
  ) => Promise<{ success: boolean; error?: string }>;
  setPaymentMethodStatus: (
    accountId: string,
    status: 'LINKED' | 'NOT_SET'
  ) => Promise<{ success: boolean; error?: string }>;
  updateAccountBillingInfo: (
    accountId: string,
    info: {
      businessPortfolioId?: string;
      paymentAccountId?: string;
      wabaId?: string;
      messagingLimitTier?: string;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  disconnectAccount: (accountId: string) => Promise<void>;
  reconnectAccount: (accountId: string) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
  refreshMetaStatus: () => Promise<void>;
  verifyConnectionHealth: (params: {
    accountId: string;
    phoneNumberId?: string;
    wabaId?: string;
    customToken?: string;
  }) => Promise<ConnectionHealthReport>;
  deregisterAccount: (params: {
    accountId: string;
    phoneNumberId?: string;
    customToken?: string;
    deleteFromWorkspace?: boolean;
  }) => Promise<{ success: boolean; metaDeregistered?: boolean; metaNotice?: string; error?: string }>;
  disconnectAndReleaseAccount: (params: {
    accountId: string;
    phoneNumberId?: string;
    wabaId?: string;
    customToken?: string;
  }) => Promise<{
    success: boolean;
    metaDeregistered?: boolean;
    tokenRevoked?: boolean;
    webhookUnsubscribed?: boolean;
    message?: string;
    error?: string;
  }>;
}

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: {
          authResponse?: { code?: string; accessToken?: string; userID?: string };
          status?: string;
        }) => void,
        options: {
          config_id?: string;
          response_type?: string;
          override_default_response_type?: boolean;
          scope?: string;
          extras?: {
            featureType?: string;
            setup?: { external_id?: string };
            [key: string]: unknown;
          };
        }
      ) => void;
    };
  }
}

const WhatsAppAccountsContext = createContext<WhatsAppAccountsContextType | undefined>(undefined);

export const WhatsAppAccountsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { organization, currentUser, userProfile } = useAuth();
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<WhatsAppAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [metaStatus, setMetaStatus] = useState<MetaConfigStatus | null>(null);

  // Fallback-resilient organization resolver (Users always get their isolated workspace)
  const getEffectiveOrgId = (): string => {
    const isUserRole = userProfile?.role === 'user' || (currentUser as any)?.role === 'user';
    if (isUserRole) {
      const uOrg = userProfile?.organizationId || (currentUser as any)?.organizationId;
      if (uOrg && (uOrg.startsWith('org_usr_') || uOrg.startsWith('org_user_'))) {
        return uOrg;
      }
      const uid = userProfile?.uid || currentUser?.uid;
      return uid ? `org_${uid}` : 'org_default';
    }
    return (
      organization?.id ||
      userProfile?.organizationId ||
      (currentUser?.uid === 'master_admin_root'
        ? 'org_master_platform'
        : currentUser?.uid
        ? `org_${currentUser.uid}`
        : 'org_default')
    );
  };

  const fetchMetaStatus = async () => {
    try {
      const effectiveOrgId = getEffectiveOrgId();
      const parentOrgId =
        organization?.parentOrganizationId ||
        (userProfile as any)?.adminOrganizationId ||
        (currentUser as any)?.adminOrganizationId;

      const params = new URLSearchParams();
      if (effectiveOrgId) params.append('organizationId', effectiveOrgId);
      if (parentOrgId) params.append('parentOrganizationId', parentOrgId);

      const url = `/api/meta/status?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          ...(effectiveOrgId ? { 'x-organization-id': effectiveOrgId } : {}),
          ...(parentOrgId ? { 'x-parent-organization-id': parentOrgId } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setMetaStatus(data);
      }
    } catch (err) {
      console.warn('Failed to load Meta configuration status:', err);
    }
  };

  const computedMetaStatus: MetaConfigStatus | null = useMemo(() => {
    // 1. Direct custom metaAppConfig on organization
    if (organization?.metaAppConfig?.appId && (organization?.metaAppConfig?.configId || organization?.metaAppConfig?.appSecret)) {
      return {
        isConfigured: Boolean(organization.metaAppConfig.appId && organization.metaAppConfig.configId),
        appIdSet: Boolean(organization.metaAppConfig.appId),
        appId: organization.metaAppConfig.appId,
        configId: organization.metaAppConfig.configId || '',
        appSecretSet: Boolean(organization.metaAppConfig.appSecret),
        webhookVerifyTokenSet: true,
        systemTokenSet: Boolean(organization.metaAppConfig.systemUserToken || organization.metaAppConfig.systemToken),
        webhookUrl: metaStatus?.webhookUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/meta/webhook`,
        webhookVerifyToken: organization.metaAppConfig.verifyToken || metaStatus?.webhookVerifyToken || 'cloudwaba_verify_token_secure',
        graphVersion: organization.metaAppConfig.graphVersion || metaStatus?.graphVersion || 'v22.0',
        isCustomTenantApp: true,
        organizationId: organization.id,
      };
    }
    // 2. Resolved metaStatus from server (which resolved the parent Admin's dedicated custom Meta App)
    if (metaStatus && metaStatus.appId) {
      return metaStatus;
    }
    return metaStatus;
  }, [
    organization?.id,
    organization?.metaAppConfig?.appId,
    organization?.metaAppConfig?.configId,
    organization?.metaAppConfig?.appSecret,
    organization?.metaAppConfig?.systemUserToken,
    organization?.metaAppConfig?.systemToken,
    organization?.metaAppConfig?.verifyToken,
    organization?.metaAppConfig?.graphVersion,
    metaStatus,
  ]);

  useEffect(() => {
    fetchMetaStatus();
  }, [organization?.id, organization?.parentOrganizationId, currentUser?.uid, userProfile?.organizationId, (userProfile as any)?.adminOrganizationId, userProfile?.role]);

  // Listen to Firestore WhatsApp accounts for this organization
  useEffect(() => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!currentUser || !effectiveOrgId) {
      setAccounts([]);
      setActiveAccount(null);
      setLoading(false);
      return;
    }

    setAccounts([]);
    setActiveAccount(null);
    setLoading(true);

    const accountsPath = `organizations/${effectiveOrgId}/whatsappAccounts`;
    const accountsRef = collection(db, accountsPath);

    const unsubscribe = onSnapshot(
      accountsRef,
      (snapshot) => {
        const list: WhatsAppAccount[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as Omit<WhatsAppAccount, 'id'>) });
        });
        setAccounts(list);

        // Keep active account selected or pick first connected
        setActiveAccount((prev) => {
          if (prev) {
            const found = list.find((a) => a.id === prev.id);
            if (found) {
              if (
                found.id === prev.id &&
                found.connectionStatus === prev.connectionStatus &&
                found.verifiedName === prev.verifiedName &&
                found.displayPhoneNumber === prev.displayPhoneNumber &&
                found.wabaId === prev.wabaId &&
                found.phoneNumberId === prev.phoneNumberId &&
                found.businessVerificationStatus === prev.businessVerificationStatus &&
                found.messagingLimitTier === prev.messagingLimitTier &&
                found.webhookStatus === prev.webhookStatus
              ) {
                return prev;
              }
              return found;
            }
          }
          return list.find((a) => a.connectionStatus === 'connected') || list[0] || null;
        });

        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, accountsPath);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [organization?.id, currentUser?.uid, userProfile?.organizationId, userProfile?.role]);

  // Helper to safely initialize Facebook SDK with valid App ID and version
  const initFacebookSDK = () => {
    if (typeof window === 'undefined' || !window.FB) return;
    const resolvedAppId = (
      computedMetaStatus?.appId ||
      organization?.metaAppConfig?.appId ||
      metaStatus?.appId ||
      (import.meta.env.VITE_META_APP_ID as string) ||
      ''
    ).trim();
    if (!resolvedAppId) return; // Do not initialize FB SDK until real Meta App ID is configured
    const resolvedVersion =
      computedMetaStatus?.graphVersion ||
      organization?.metaAppConfig?.graphVersion ||
      metaStatus?.graphVersion ||
      'v22.0';
    try {
      window.FB.init({
        appId: resolvedAppId,
        cookie: true,
        xfbml: true,
        version: resolvedVersion,
      });
      console.log(`[Meta SDK] Initialized with App ID: ${resolvedAppId}, Version: ${resolvedVersion}`);
    } catch (err) {
      console.warn('[Meta SDK] FB.init error:', err);
    }
  };

  // Initialize Facebook SDK for Meta Embedded Signup
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.fbAsyncInit = function () {
      initFacebookSDK();
    };

    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    } else {
      initFacebookSDK();
    }
  }, [computedMetaStatus?.appId, computedMetaStatus?.graphVersion]);

  // Connect WhatsApp via Meta Embedded Signup V4 (Supports Coexistence Mode, Standard Cloud API & WABA Migration)
  const connectViaEmbeddedSignup = async (options?: {
    isCoexistence?: boolean;
    featureType?: string;
    sessionInfoVersion?: '4' | '3' | '2';
    migrationMode?: boolean;
  }): Promise<void> => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) throw new Error('Organization not found. Please re-login.');

    const resolvedAppId = (
      computedMetaStatus?.appId ||
      organization?.metaAppConfig?.appId ||
      metaStatus?.appId ||
      (import.meta.env.VITE_META_APP_ID as string) ||
      ''
    ).trim();
    if (!resolvedAppId) {
      throw new Error(
        'Meta App ID is not yet configured in Admin panel. Please go to Admin Settings > Meta App Config to save your Meta App ID.'
      );
    }

    const configId = (
      computedMetaStatus?.configId ||
      organization?.metaAppConfig?.configId ||
      metaStatus?.configId ||
      (import.meta.env.VITE_META_CONFIG_ID as string) ||
      ''
    ).trim();
    if (!configId) {
      throw new Error(
        'Facebook Login Configuration ID is not configured. Please go to Admin Settings > Meta App Config to save your Configuration ID.'
      );
    }

    return new Promise<void>((resolve, reject) => {
      let isResolved = false;

      // Generous 10-minute timeout so user can comfortably scan QR code or complete verification
      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          window.removeEventListener('message', messageHandler);
          reject(
            new Error(
              'Meta login window session timed out. Please check your browser pop-up blocker or use the "Connect by Phone Number" tab.'
            )
          );
        }
      }, 600000); // 10 minutes

      let capturedWabaId: string | undefined;
      let capturedPhoneId: string | undefined;

      const messageHandler = (event: MessageEvent) => {
        if (
          event.origin !== 'https://www.facebook.com' &&
          event.origin !== 'https://web.facebook.com' &&
          !event.origin.endsWith('.facebook.com')
        ) {
          return;
        }

        try {
          const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (payload?.type === 'WA_EMBEDDED_SIGNUP') {
            console.log('[Meta Embedded Signup V4 Event]', payload);
            if (payload.data?.waba_id) {
              capturedWabaId = payload.data.waba_id;
            }
            if (payload.data?.phone_number_id) {
              capturedPhoneId = payload.data.phone_number_id;
            }
            if (payload.event === 'CANCEL') {
              console.log('[Meta Embedded Signup V4] User cancelled signup.');
            }
            if (payload.event === 'FINISH') {
              console.log('[Meta Embedded Signup V4] Completed with data:', payload.data);
            }
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      window.addEventListener('message', messageHandler);

      try {
        if (!window.FB) {
          clearTimeout(timer);
          window.removeEventListener('message', messageHandler);
          reject(
            new Error(
              'Meta Facebook SDK could not be loaded in this frame. Please switch to the "Connect by Phone Number" tab to connect directly.'
            )
          );
          return;
        }

        // Guaranteed safeguard: always invoke FB.init with valid version before FB.login
        const resolvedVersion = metaStatus?.graphVersion || 'v22.0';
        try {
          window.FB.init({
            appId: resolvedAppId,
            cookie: true,
            xfbml: true,
            version: resolvedVersion,
          });
        } catch (initErr) {
          console.warn('[Meta SDK] Pre-login init notice:', initErr);
        }

        // Coexistence vs Standard: featureType determines whether Meta opens the WhatsApp Business App mobile onboarding branch
        const isCoexistence = options?.isCoexistence !== false;
        const featureType = options?.featureType || (isCoexistence ? 'whatsapp_business_app_onboarding' : undefined);
        const targetVersion = options?.sessionInfoVersion || '4';

        const extrasPayload: Record<string, unknown> = {
          sessionInfoVersion: targetVersion,
          version: targetVersion === '4' ? 4 : 3,
          setup: {
            external_id: effectiveOrgId,
            ...(options?.migrationMode ? { allow_migration: true } : {}),
          },
        };

        if (featureType) {
          extrasPayload.featureType = featureType;
        }

        const loginOptions: Record<string, unknown> = {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: extrasPayload,
        };

        window.FB.login((response) => {
          clearTimeout(timer);
          window.removeEventListener('message', messageHandler);

          if (isResolved) return;

          if (response?.authResponse && response.authResponse.code) {
            // Exchange code via backend proxy
            fetch('/api/meta/embedded-signup-exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: response.authResponse.code,
                organizationId: effectiveOrgId,
                parentOrganizationId:
                  organization?.parentOrganizationId ||
                  (userProfile as any)?.adminOrganizationId ||
                  (currentUser as any)?.adminOrganizationId,
                wabaId: capturedWabaId,
                phoneNumberId: capturedPhoneId,
              }),
            })
              .then(async (res) => {
                const data = await res.json();
                if (!res.ok) {
                  throw new Error(data.error || 'Failed to exchange Meta Embedded Signup code');
                }

                // Persist safe WhatsApp account metadata in Firestore
                const accountId = data.phoneNumberId || `wa_${Date.now()}`;
                const accountDocRef = doc(db, 'organizations', effectiveOrgId, 'whatsappAccounts', accountId);

                const newAccount: Record<string, any> = {
                  wabaId: data.wabaId,
                  phoneNumberId: data.phoneNumberId,
                  displayPhoneNumber: data.displayPhoneNumber,
                  verifiedName: data.verifiedName,
                  connectionStatus: 'connected',
                  webhookStatus: 'active',
                  qualityRating: data.qualityRating || 'GREEN',
                  messagingLimitTier: data.messagingLimitTier || data.account?.messagingLimitTier || (data.businessVerificationStatus === 'VERIFIED' ? 'TIER_2K' : 'TIER_250'),
                  messagingLimitLabel: data.messagingLimitLabel || data.account?.messagingLimitLabel || (data.businessVerificationStatus === 'VERIFIED' ? '2,000 Unique Users / 24 hrs (2K)' : '250 Unique Users / 24 hrs'),
                  businessVerificationStatus: data.businessVerificationStatus || data.account?.businessVerificationStatus || 'NOT_VERIFIED',
                  currency: data.currency || data.account?.currency || 'INR',
                  paymentMethodStatus: data.paymentMethodStatus || data.account?.paymentMethodStatus || 'LINKED',
                  customToken: data.customToken || undefined,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };

                await setDoc(accountDocRef, newAccount, { merge: true });
                resolve();
              })
              .catch((err) => {
                reject(err);
              });
          } else {
            reject(new Error('Meta Facebook login was cancelled or closed.'));
          }
        }, loginOptions as any);
      } catch (sdkErr: any) {
        clearTimeout(timer);
        reject(new Error(sdkErr?.message || 'Failed to open Meta Facebook login popup.'));
      }
    });
  };

  // Connect via backend verification using Phone Number ID
  const connectManualAccount = async (params: {
    phoneNumberId: string;
    wabaId?: string;
    customToken?: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    pin?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) return { success: false, error: 'Organization not found. Please log in again.' };

    try {
      const res = await fetch('/api/meta/verify-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          organizationId: effectiveOrgId,
        }),
      });

      const data = await parseJsonResponse(res, 'Meta account verification failed.');

      // If user provided a 6-digit PIN and custom token, register phone with Meta
      if (params.pin && params.customToken) {
        try {
          await fetch('/api/meta/register-phone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phoneNumberId: data.phoneNumberId,
              pin: params.pin,
              customToken: params.customToken,
            }),
          });
        } catch (regErr) {
          console.warn('Auto registration error with PIN:', regErr);
        }
      }

      const accountId = data.phoneNumberId || `wa_${Date.now()}`;
      const accountDocRef = doc(db, 'organizations', effectiveOrgId, 'whatsappAccounts', accountId);

      const newAccount: Record<string, any> = {
        wabaId: data.wabaId || params.wabaId || 'waba_direct',
        phoneNumberId: data.phoneNumberId,
        displayPhoneNumber: data.displayPhoneNumber || params.displayPhoneNumber || params.phoneNumberId,
        verifiedName: data.verifiedName || params.verifiedName || 'WhatsApp Business',
        connectionStatus: 'connected',
        webhookStatus: 'active',
        qualityRating: data.qualityRating || 'GREEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (params.customToken && params.customToken.trim()) {
        newAccount.customToken = params.customToken.trim();
      }
      if (params.pin && params.pin.trim()) {
        newAccount.pin = params.pin.trim();
      }

      try {
        await setDoc(accountDocRef, newAccount);
      } catch (fErr) {
        handleFirestoreError(fErr, OperationType.WRITE, `organizations/${effectiveOrgId}/whatsappAccounts/${accountId}`);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  };

  const testMetaCredentials = async (params: {
    phoneNumberId: string;
    wabaId?: string;
    customToken: string;
  }): Promise<{ success: boolean; diagnostics?: any; error?: string }> => {
    try {
      const res = await fetch('/api/meta/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await parseJsonResponse(res, 'Connection test failed');
      return { success: data.success, diagnostics: data.diagnostics };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network test error' };
    }
  };

  const registerPhoneNumber = async (params: {
    phoneNumberId: string;
    pin: string;
    customToken?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/meta/register-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      await parseJsonResponse(res, 'Meta phone registration failed');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Registration network error' };
    }
  };

  const syncAccountWithMeta = async (account: WhatsAppAccount): Promise<{ success: boolean; error?: string }> => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) return { success: false, error: 'Organization not found' };

    try {
      const res = await fetch('/api/meta/sync-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: effectiveOrgId,
          phoneNumberId: account.phoneNumberId,
          wabaId: account.wabaId,
          customToken: account.customToken,
          pin: account.pin,
          fallbackName: account.verifiedName,
          fallbackPhone: account.displayPhoneNumber,
        }),
      });

      await parseJsonResponse(res, 'Failed to sync account with Meta');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network sync error' };
    }
  };

  const updateAccountToken = async (accountId: string, customToken: string): Promise<{ success: boolean; error?: string }> => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) return { success: false, error: 'Organization not found' };
    const accountRef = doc(db, 'organizations', effectiveOrgId, 'whatsappAccounts', accountId);
    try {
      await updateDoc(accountRef, {
        customToken,
        updatedAt: new Date().toISOString(),
      });
      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${effectiveOrgId}/whatsappAccounts/${accountId}`);
      return { success: false, error: err?.message || 'Failed to update token' };
    }
  };

  const verifyConnectionHealth = async (params: {
    accountId: string;
    phoneNumberId?: string;
    wabaId?: string;
    customToken?: string;
  }): Promise<ConnectionHealthReport> => {
    const effectiveOrgId = getEffectiveOrgId();
    try {
      const res = await fetch('/api/meta/connection-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: effectiveOrgId,
          accountId: params.accountId,
          phoneNumberId: params.phoneNumberId || params.accountId,
          wabaId: params.wabaId,
          customToken: params.customToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          healthStatus: data.healthStatus || 'ERROR',
          statusSummary: data.statusSummary || data.error || 'Failed to verify connection health.',
          checkedAt: new Date().toISOString(),
          error: data.error,
        };
      }
      return data;
    } catch (err: any) {
      return {
        success: false,
        healthStatus: 'ERROR',
        statusSummary: err?.message || 'Network error verifying connection health.',
        checkedAt: new Date().toISOString(),
        error: err?.message || 'Network error',
      };
    }
  };

  const deregisterAccount = async (params: {
    accountId: string;
    phoneNumberId?: string;
    customToken?: string;
    deleteFromWorkspace?: boolean;
  }): Promise<{ success: boolean; metaDeregistered?: boolean; metaNotice?: string; error?: string }> => {
    const effectiveOrgId = getEffectiveOrgId();
    try {
      const res = await fetch('/api/meta/deregister-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: effectiveOrgId,
          accountId: params.accountId,
          phoneNumberId: params.phoneNumberId || params.accountId,
          customToken: params.customToken,
          deleteFromWorkspace: params.deleteFromWorkspace ?? true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to deregister phone number' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error deregistering phone number' };
    }
  };

  const disconnectAndReleaseAccount = async (params: {
    accountId: string;
    phoneNumberId?: string;
    wabaId?: string;
    customToken?: string;
  }): Promise<{
    success: boolean;
    metaDeregistered?: boolean;
    tokenRevoked?: boolean;
    webhookUnsubscribed?: boolean;
    message?: string;
    error?: string;
  }> => {
    const effectiveOrgId = getEffectiveOrgId();
    try {
      const res = await fetch('/api/meta/disconnect-and-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: effectiveOrgId,
          accountId: params.accountId,
          phoneNumberId: params.phoneNumberId || params.accountId,
          wabaId: params.wabaId,
          customToken: params.customToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to disconnect and release account' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error disconnecting and releasing account' };
    }
  };

  const logAccountRecharge = async (
    accountId: string,
    amount: number,
    currency: string,
    note?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) return { success: false, error: 'Organization not found' };

    const accountRef = doc(db, 'organizations', effectiveOrgId, 'whatsappAccounts', accountId);
    try {
      const snap = await getDoc(accountRef);
      const existingData = snap.exists() ? snap.data() : {};
      const existingPrepaid = (existingData as any).prepaidBalance || {};
      const currentAmount = typeof existingPrepaid.amount === 'number' ? existingPrepaid.amount : 0;
      const newAmount = currentAmount + amount;
      const history = existingPrepaid.rechargeHistory || [];

      const newEntry = {
        id: `rc_${Date.now()}`,
        date: new Date().toISOString(),
        amount,
        currency,
        note: note || 'Prepaid Recharge via Meta Business Manager',
      };

      await updateDoc(accountRef, {
        prepaidBalance: {
          amount: newAmount,
          currency,
          lastUpdated: new Date().toISOString(),
          source: 'manual_logged',
          rechargeHistory: [newEntry, ...history].slice(0, 50),
        },
        paymentMethodStatus: 'LINKED',
        updatedAt: new Date().toISOString(),
      });
      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${effectiveOrgId}/whatsappAccounts/${accountId}`);
      return { success: false, error: err?.message || 'Failed to update recharge balance' };
    }
  };

  const setPaymentMethodStatus = async (
    accountId: string,
    status: 'LINKED' | 'NOT_SET'
  ): Promise<{ success: boolean; error?: string }> => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) return { success: false, error: 'Organization not found' };

    const accountRef = doc(db, 'organizations', effectiveOrgId, 'whatsappAccounts', accountId);
    try {
      await updateDoc(accountRef, {
        paymentMethodStatus: status,
        updatedAt: new Date().toISOString(),
      });
      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${effectiveOrgId}/whatsappAccounts/${accountId}`);
      return { success: false, error: err?.message || 'Failed to update payment method status' };
    }
  };

  const updateAccountBillingInfo = async (
    accountId: string,
    info: {
      businessPortfolioId?: string;
      paymentAccountId?: string;
      wabaId?: string;
      messagingLimitTier?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) return { success: false, error: 'Organization not found' };

    const accountRef = doc(db, 'organizations', effectiveOrgId, 'whatsappAccounts', accountId);
    try {
      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };
      if (info.businessPortfolioId !== undefined) {
        updateData.businessPortfolioId = info.businessPortfolioId.trim();
        updateData.businessId = info.businessPortfolioId.trim();
      }
      if (info.paymentAccountId !== undefined) {
        updateData.paymentAccountId = info.paymentAccountId.trim();
        updateData.primaryFundingId = info.paymentAccountId.trim();
        if (info.paymentAccountId.trim()) {
          updateData.paymentMethodStatus = 'LINKED';
        }
      }
      if (info.wabaId !== undefined) {
        updateData.wabaId = info.wabaId.trim();
      }
      if (info.messagingLimitTier !== undefined) {
        const isVerified = ['TIER_1K', 'TIER_2K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED'].includes(info.messagingLimitTier);
        const limitInfo = parseMessagingLimitTier(info.messagingLimitTier, isVerified);
        updateData.messagingLimitTier = limitInfo.tier;
        updateData.messagingLimitLabel = limitInfo.label;
        updateData.maxDailyConversations = limitInfo.limit;
        if (isVerified) {
          updateData.businessVerificationStatus = 'VERIFIED';
        }
      }
      await updateDoc(accountRef, updateData);
      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${effectiveOrgId}/whatsappAccounts/${accountId}`);
      return { success: false, error: err?.message || 'Failed to update billing info' };
    }
  };

  const disconnectAccount = async (accountId: string) => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) return;
    const accountRef = doc(db, 'organizations', effectiveOrgId, 'whatsappAccounts', accountId);
    try {
      await updateDoc(accountRef, {
        connectionStatus: 'disconnected',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${effectiveOrgId}/whatsappAccounts/${accountId}`);
    }
  };

  const reconnectAccount = async (accountId: string) => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) return;
    const accountRef = doc(db, 'organizations', effectiveOrgId, 'whatsappAccounts', accountId);
    try {
      await updateDoc(accountRef, {
        connectionStatus: 'connected',
        webhookStatus: 'active',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${effectiveOrgId}/whatsappAccounts/${accountId}`);
    }
  };

  const checkWabaMigration = async (params: {
    wabaId?: string;
    phoneNumberId?: string;
    customToken?: string;
  }) => {
    const effectiveOrgId = getEffectiveOrgId();
    try {
      const res = await fetch('/api/meta/waba-migration/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          organizationId: effectiveOrgId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to check WABA migration eligibility.' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error checking WABA migration.' };
    }
  };

  const triggerWabaMigration = async (params: {
    wabaId: string;
    phoneNumberId: string;
    pin?: string;
    action?: 'register_and_migrate' | 'request_code' | 'verify_code';
    codeMethod?: 'SMS' | 'VOICE';
    otpCode?: string;
    customToken?: string;
  }) => {
    const effectiveOrgId = getEffectiveOrgId();
    try {
      const res = await fetch('/api/meta/waba-migration/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          organizationId: effectiveOrgId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to trigger WABA migration.' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error triggering WABA migration.' };
    }
  };

  const deleteAccount = async (accountId: string) => {
    const effectiveOrgId = getEffectiveOrgId();
    if (!effectiveOrgId) return;
    const accountRef = doc(db, 'organizations', effectiveOrgId, 'whatsappAccounts', accountId);
    try {
      await deleteDoc(accountRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `organizations/${effectiveOrgId}/whatsappAccounts/${accountId}`);
    }
  };

  return (
    <WhatsAppAccountsContext.Provider
      value={{
        accounts,
        activeAccount,
        loading,
        metaStatus: computedMetaStatus,
        setActiveAccount,
        connectViaEmbeddedSignup,
        checkWabaMigration,
        triggerWabaMigration,
        connectManualAccount,
        testMetaCredentials,
        registerPhoneNumber,
        syncAccountWithMeta,
        updateAccountToken,
        logAccountRecharge,
        setPaymentMethodStatus,
        updateAccountBillingInfo,
        disconnectAccount,
        reconnectAccount,
        deleteAccount,
        refreshMetaStatus: fetchMetaStatus,
        verifyConnectionHealth,
        deregisterAccount,
        disconnectAndReleaseAccount,
      }}
    >
      {children}
    </WhatsAppAccountsContext.Provider>
  );
};

export const useWhatsAppAccounts = () => {
  const context = useContext(WhatsAppAccountsContext);
  if (!context) {
    throw new Error('useWhatsAppAccounts must be used within a WhatsAppAccountsProvider');
  }
  return context;
};
