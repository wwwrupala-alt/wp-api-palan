import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { useAuth } from './AuthContext.tsx';
import type { WhatsAppAccount, MetaConfigStatus } from '../types/index.ts';

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
  connectViaEmbeddedSignup: (options?: { isCoexistence?: boolean; featureType?: string }) => Promise<void>;
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
  disconnectAccount: (accountId: string) => Promise<void>;
  reconnectAccount: (accountId: string) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
  refreshMetaStatus: () => Promise<void>;
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
  const { organization, currentUser } = useAuth();
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<WhatsAppAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [metaStatus, setMetaStatus] = useState<MetaConfigStatus | null>(null);

  const fetchMetaStatus = async () => {
    try {
      const res = await fetch('/api/meta/status');
      if (res.ok) {
        const data = await res.json();
        setMetaStatus(data);
      }
    } catch (err) {
      console.warn('Failed to load Meta configuration status:', err);
    }
  };

  useEffect(() => {
    fetchMetaStatus();
  }, []);

  // Listen to Firestore WhatsApp accounts for this organization
  useEffect(() => {
    if (!organization?.id || !currentUser) {
      setAccounts([]);
      setActiveAccount(null);
      setLoading(false);
      return;
    }

    const accountsPath = `organizations/${organization.id}/whatsappAccounts`;
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
            if (found) return found;
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
  }, [organization?.id, currentUser]);

  // Helper to safely initialize Facebook SDK with valid App ID and version
  const initFacebookSDK = () => {
    if (typeof window === 'undefined' || !window.FB) return;
    const resolvedAppId = metaStatus?.appId || (import.meta.env.VITE_META_APP_ID as string) || '28291855670435316';
    const resolvedVersion = metaStatus?.graphVersion || 'v22.0';
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
  }, [metaStatus]);

  // Connect WhatsApp via Meta Embedded Signup (Supports Coexistence Mode & Standard Cloud API)
  const connectViaEmbeddedSignup = async (options?: { isCoexistence?: boolean; featureType?: string }): Promise<void> => {
    if (!organization?.id) throw new Error('Organization not found. Please re-login.');

    const resolvedAppId = metaStatus?.appId || (import.meta.env.VITE_META_APP_ID as string) || '28291855670435316';
    if (!resolvedAppId) {
      throw new Error(
        'Meta App ID is not yet configured in server environment. Please use the "Connect by Phone Number" tab to connect your WhatsApp account directly.'
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
            console.log('[Meta Embedded Signup Event]', payload);
            if (payload.data?.waba_id) {
              capturedWabaId = payload.data.waba_id;
            }
            if (payload.data?.phone_number_id) {
              capturedPhoneId = payload.data.phone_number_id;
            }
            if (payload.event === 'CANCEL') {
              console.log('[Meta Embedded Signup] User cancelled signup.');
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

        const configId = metaStatus?.configId || (import.meta.env.VITE_META_CONFIG_ID as string) || '1030431656687202';

        // Coexistence vs Standard: featureType determines whether Meta opens the WhatsApp Business App mobile onboarding branch
        const isCoexistence = options?.isCoexistence !== false;
        const featureType = options?.featureType || (isCoexistence ? 'whatsapp_business_app_onboarding' : undefined);

        const extrasPayload: Record<string, unknown> = {
          sessionInfoVersion: '3',
          setup: {
            external_id: organization.id,
          },
        };

        if (featureType) {
          extrasPayload.featureType = featureType;
        }

        const loginOptions: Record<string, unknown> = {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          scope: 'whatsapp_business_management,whatsapp_business_messaging',
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
                organizationId: organization.id,
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
                const accountDocRef = doc(db, 'organizations', organization.id, 'whatsappAccounts', accountId);

                const newAccount: Omit<WhatsAppAccount, 'id'> = {
                  wabaId: data.wabaId,
                  phoneNumberId: data.phoneNumberId,
                  displayPhoneNumber: data.displayPhoneNumber,
                  verifiedName: data.verifiedName,
                  connectionStatus: 'connected',
                  webhookStatus: 'active',
                  qualityRating: data.qualityRating || 'GREEN',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };

                await setDoc(accountDocRef, newAccount);
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
    if (!organization?.id) return { success: false, error: 'Organization not found' };

    try {
      const res = await fetch('/api/meta/verify-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          organizationId: organization.id,
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
      const accountDocRef = doc(db, 'organizations', organization.id, 'whatsappAccounts', accountId);

      const newAccount: Omit<WhatsAppAccount, 'id'> = {
        wabaId: data.wabaId || params.wabaId || 'waba_direct',
        phoneNumberId: data.phoneNumberId,
        displayPhoneNumber: data.displayPhoneNumber || params.displayPhoneNumber || params.phoneNumberId,
        verifiedName: data.verifiedName || params.verifiedName || 'WhatsApp Business',
        customToken: params.customToken || undefined,
        pin: params.pin || undefined,
        connectionStatus: 'connected',
        webhookStatus: 'active',
        qualityRating: data.qualityRating || 'GREEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await setDoc(accountDocRef, newAccount);
      } catch (fErr) {
        handleFirestoreError(fErr, OperationType.WRITE, `organizations/${organization.id}/whatsappAccounts/${accountId}`);
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
    if (!organization?.id) return { success: false, error: 'Organization not found' };

    try {
      const res = await fetch('/api/meta/sync-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organization.id,
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

  const disconnectAccount = async (accountId: string) => {
    if (!organization?.id) return;
    const accountRef = doc(db, 'organizations', organization.id, 'whatsappAccounts', accountId);
    try {
      await updateDoc(accountRef, {
        connectionStatus: 'disconnected',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${organization.id}/whatsappAccounts/${accountId}`);
    }
  };

  const reconnectAccount = async (accountId: string) => {
    if (!organization?.id) return;
    const accountRef = doc(db, 'organizations', organization.id, 'whatsappAccounts', accountId);
    try {
      await updateDoc(accountRef, {
        connectionStatus: 'connected',
        webhookStatus: 'active',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${organization.id}/whatsappAccounts/${accountId}`);
    }
  };

  const deleteAccount = async (accountId: string) => {
    if (!organization?.id) return;
    const accountRef = doc(db, 'organizations', organization.id, 'whatsappAccounts', accountId);
    try {
      await deleteDoc(accountRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `organizations/${organization.id}/whatsappAccounts/${accountId}`);
    }
  };

  return (
    <WhatsAppAccountsContext.Provider
      value={{
        accounts,
        activeAccount,
        loading,
        metaStatus,
        setActiveAccount,
        connectViaEmbeddedSignup,
        connectManualAccount,
        testMetaCredentials,
        registerPhoneNumber,
        syncAccountWithMeta,
        disconnectAccount,
        reconnectAccount,
        deleteAccount,
        refreshMetaStatus: fetchMetaStatus,
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
