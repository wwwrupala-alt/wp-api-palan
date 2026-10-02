import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMetaConfig, addWebhookLog } from './metaService.ts';
import { parseMessagingLimitTier } from '../lib/metaLimits.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  oAuthClientId?: string;
}

let cachedFirebaseConfig: FirebaseAppletConfig | null = null;

export function getFirebaseConfig(): FirebaseAppletConfig {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  try {
    const configPath = path.resolve(__dirname, '../../firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      cachedFirebaseConfig = JSON.parse(raw);
      return cachedFirebaseConfig!;
    }
  } catch (err) {
    console.warn('[MetaSyncService] Could not read firebase-applet-config.json:', err);
  }

  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'utility-sky-7f6jr',
    appId: process.env.VITE_FIREBASE_APP_ID || '',
    apiKey: process.env.VITE_FIREBASE_API_KEY || '',
    firestoreDatabaseId: process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-eb8ad6af-49f2-4fff-9c59-69f62d1e9a05',
  };
}

/**
 * Converts a standard JavaScript object into Firestore REST API Value types
 */
export function toFirestoreValue(val: unknown): Record<string, unknown> | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: val.toString() };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item)).filter(Boolean),
      },
    };
  }
  if (typeof val === 'object') {
    const mapFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const fVal = toFirestoreValue(v);
      if (fVal) mapFields[k] = fVal;
    }
    return { mapValue: { fields: mapFields } };
  }
  return { stringValue: String(val) };
}

/**
 * Updates or creates a document in Firestore via the official Firestore REST API
 */
export async function updateFirestoreWhatsAppAccount(
  organizationId: string,
  accountId: string,
  accountData: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const fbConfig = getFirebaseConfig();
    const projectId = fbConfig.projectId;
    const databaseId = fbConfig.firestoreDatabaseId || '(default)';
    const apiKey = fbConfig.apiKey;

    const fields: Record<string, unknown> = {};
    const fieldMaskPaths: string[] = [];

    for (const [key, value] of Object.entries(accountData)) {
      if (value !== undefined) {
        const firestoreVal = toFirestoreValue(value);
        if (firestoreVal) {
          fields[key] = firestoreVal;
          fieldMaskPaths.push(key);
        }
      }
    }

    const documentPath = `organizations/${organizationId}/whatsappAccounts/${accountId}`;
    const maskParams = fieldMaskPaths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join('&');
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${documentPath}?key=${apiKey}&${maskParams}`;

    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[MetaSyncService] Firestore REST update failed for ${documentPath}:`, errText);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown Firestore update error';
    console.warn('[MetaSyncService] Firestore write error:', message);
    return { success: false, error: message };
  }
}

export interface FetchedMetaAccountDetails {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  codeVerificationStatus?: string;
  businessName?: string;
  tokenValid: boolean;
}

/**
 * Queries Meta Graph API to fetch live verified details:
 * - WABA ID
 * - Phone Number ID
 * - Business Name (verified_name / WABA name)
 * - Display Phone Number
 * - Quality Rating
 * And updates the Firestore `whatsappAccounts` collection.
 */
export async function fetchAndSyncMetaAccount(params: {
  organizationId: string;
  token?: string;
  phoneNumberId?: string;
  wabaId?: string;
  pin?: string;
  fallbackName?: string;
  fallbackPhone?: string;
}): Promise<{
  success: boolean;
  account?: {
    id: string;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    verifiedName: string;
    qualityRating: string;
    messagingLimitTier?: string;
    messagingLimitLabel?: string;
    maxDailyConversations?: number;
    connectionStatus: string;
    webhookStatus: string;
  };
  firestoreUpdated: boolean;
  error?: string;
}> {
  const { organizationId, phoneNumberId, wabaId, pin, fallbackName, fallbackPhone } = params;
  const config = getMetaConfig();
  const token = params.token || config.systemToken;

  if (!organizationId) {
    return { success: false, firestoreUpdated: false, error: 'organizationId is required to sync account' };
  }

  let resolvedPhoneId = (phoneNumberId || '').trim();
  let resolvedWabaId = (wabaId || '').trim();
  let resolvedDisplayPhone = fallbackPhone || resolvedPhoneId;
  let resolvedBusinessName = fallbackName || 'WhatsApp Business';
  let resolvedQualityRating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' = 'GREEN';
  let resolvedMessagingLimitTier = 'TIER_250';
  let resolvedThroughput = 'STANDARD';
  let resolvedCodeVerification = 'VERIFIED';
  let tokenValid = false;

  // 1. If token is available, query Meta Graph API live
  if (token) {
    try {
      // Step A: If Phone Number ID is provided, query it directly
      if (resolvedPhoneId) {
        const phoneUrl = `https://graph.facebook.com/${config.graphVersion}/${resolvedPhoneId}?fields=id,verified_name,display_phone_number,quality_rating,code_verification_status,messaging_limit_tier,throughput,status,whatsapp_business_account&access_token=${token}`;
        const phoneRes = await fetch(phoneUrl);
        const phoneData = await phoneRes.json();

        if (phoneRes.ok && !phoneData.error) {
          tokenValid = true;
          resolvedPhoneId = phoneData.id || resolvedPhoneId;
          resolvedDisplayPhone = phoneData.display_phone_number || resolvedDisplayPhone;
          resolvedBusinessName = phoneData.verified_name || resolvedBusinessName;
          resolvedQualityRating = (phoneData.quality_rating as 'GREEN' | 'YELLOW' | 'RED') || 'GREEN';

          if (phoneData.messaging_limit_tier) {
            resolvedMessagingLimitTier = phoneData.messaging_limit_tier;
          }
          if (phoneData.throughput?.level) {
            resolvedThroughput = phoneData.throughput.level;
          }
          if (phoneData.code_verification_status) {
            resolvedCodeVerification = phoneData.code_verification_status;
          }

          if (phoneData.whatsapp_business_account?.id) {
            resolvedWabaId = phoneData.whatsapp_business_account.id;
          }
        }
      }

      // Step B: If WABA ID is known, query WABA details for official business name and template namespace
      if (resolvedWabaId) {
        const wabaUrl = `https://graph.facebook.com/${config.graphVersion}/${resolvedWabaId}?fields=id,name,timezone_id,currency,message_template_namespace&access_token=${token}`;
        const wabaRes = await fetch(wabaUrl);
        const wabaData = await wabaRes.json();

        if (wabaRes.ok && !wabaData.error) {
          tokenValid = true;
          if (wabaData.name && (!resolvedBusinessName || resolvedBusinessName === 'WhatsApp Business')) {
            resolvedBusinessName = wabaData.name;
          }

          // If phone number ID was not set, fetch primary phone from WABA
          if (!resolvedPhoneId) {
            const phonesUrl = `https://graph.facebook.com/${config.graphVersion}/${resolvedWabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${token}`;
            const phonesRes = await fetch(phonesUrl);
            const phonesData = await phonesRes.json();

            if (phonesRes.ok && phonesData.data && phonesData.data.length > 0) {
              const primaryPhone = phonesData.data[0];
              resolvedPhoneId = primaryPhone.id;
              resolvedDisplayPhone = primaryPhone.display_phone_number || primaryPhone.id;
              resolvedBusinessName = primaryPhone.verified_name || resolvedBusinessName;
              resolvedQualityRating = (primaryPhone.quality_rating as 'GREEN' | 'YELLOW' | 'RED') || 'GREEN';
            }
          }
        }
      }

      // Step C: Auto-register 6-digit PIN if provided
      if (pin && resolvedPhoneId) {
        try {
          await fetch(`https://graph.facebook.com/${config.graphVersion}/${resolvedPhoneId}/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              pin: pin,
            }),
          });
        } catch (regErr) {
          console.warn('[MetaSyncService] Register pin notice:', regErr);
        }
      }

      // Step D: Auto-subscribe WABA to webhook
      if (resolvedWabaId) {
        try {
          await fetch(`https://graph.facebook.com/${config.graphVersion}/${resolvedWabaId}/subscribed_apps`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        } catch (subErr) {
          console.warn('[MetaSyncService] Subscribed apps notice:', subErr);
        }
      }
    } catch (apiErr) {
      console.warn('[MetaSyncService] Meta Graph API query error:', apiErr);
    }
  }

  // Fallback defaults if IDs are missing
  if (!resolvedPhoneId) {
    resolvedPhoneId = fallbackPhone?.replace(/[^0-9]/g, '') || `phone_${Date.now()}`;
  }
  if (!resolvedWabaId) {
    resolvedWabaId = `waba_${resolvedPhoneId.slice(-6) || 'direct'}`;
  }

  const nowIso = new Date().toISOString();
  const accountDocumentId = resolvedPhoneId;
  const limitInfo = parseMessagingLimitTier(resolvedMessagingLimitTier);

  const accountDocData: Record<string, unknown> = {
    id: accountDocumentId,
    wabaId: resolvedWabaId,
    phoneNumberId: resolvedPhoneId,
    displayPhoneNumber: resolvedDisplayPhone,
    verifiedName: resolvedBusinessName,
    qualityRating: resolvedQualityRating,
    messagingLimitTier: limitInfo.tier,
    messagingLimitLabel: limitInfo.label,
    maxDailyConversations: limitInfo.limit,
    codeVerificationStatus: resolvedCodeVerification,
    throughputLevel: resolvedThroughput,
    connectionStatus: 'connected',
    webhookStatus: 'active',
    updatedAt: nowIso,
  };

  if (token) {
    accountDocData.customToken = token;
  }
  if (pin) {
    accountDocData.pin = pin;
  }

  // 2. Direct Backend update to Firestore `whatsappAccounts` collection
  const firestoreRes = await updateFirestoreWhatsAppAccount(
    organizationId,
    accountDocumentId,
    accountDocData
  );

  addWebhookLog({
    event: 'WhatsApp Account Synced & Saved to Firestore',
    origin: 'Meta Cloud API Backend Service',
    details: `Synced WABA: ${resolvedWabaId}, Phone: ${resolvedPhoneId} (${resolvedBusinessName}) [Limit: ${limitInfo.label}] into organizations/${organizationId}/whatsappAccounts/${accountDocumentId}`,
    status: firestoreRes.success ? 'success' : 'warning',
    rawPayload: {
      accountDocData,
      firestoreResult: firestoreRes,
    },
  });

  return {
    success: true,
    account: {
      id: accountDocumentId,
      wabaId: resolvedWabaId,
      phoneNumberId: resolvedPhoneId,
      displayPhoneNumber: resolvedDisplayPhone,
      verifiedName: resolvedBusinessName,
      qualityRating: resolvedQualityRating,
      messagingLimitTier: limitInfo.tier,
      messagingLimitLabel: limitInfo.label,
      maxDailyConversations: limitInfo.limit,
      connectionStatus: 'connected',
      webhookStatus: 'active',
    },
    firestoreUpdated: firestoreRes.success,
    error: firestoreRes.error,
  };
}
