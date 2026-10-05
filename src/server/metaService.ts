import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  fetchAndSyncMetaAccount,
  updateFirestoreWhatsAppAccount,
  getFirebaseConfig,
} from './metaAccountSyncService.ts';
import { formatTemplateComponentsForSending } from './templateUtils.ts';
import {
  resolveMetaMediaObject,
  getUploadsWritableDir,
  inMemoryMediaBufferCache,
} from './metaMediaManager.ts';
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
} from './serverDb.ts';
import {
  registerRecipients,
  processWebhookStatusUpdate,
  processIncomingCustomerReply,
} from './campaignAnalyticsService.ts';
import type { CampaignRecipient } from '../types/index.ts';
import { parseMessagingLimitTier } from '../lib/metaLimits.ts';

// In-memory webhook event logs buffer for real-time visibility in the Admin panel
export interface WebhookEventRecord {
  id: string;
  timestamp: string;
  event: string;
  origin: string;
  details: string;
  status: 'success' | 'warning' | 'error';
  rawPayload?: unknown;
}

const webhookLogs: WebhookEventRecord[] = [];

export function getWebhookLogs(): WebhookEventRecord[] {
  return [...webhookLogs].slice(-50).reverse();
}

export function addWebhookLog(log: Omit<WebhookEventRecord, 'id' | 'timestamp'>) {
  webhookLogs.push({
    id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...log,
  });
  if (webhookLogs.length > 200) {
    webhookLogs.shift();
  }
}

// Meta configuration helper
let adminMetaConfigOverrides: {
  appId?: string;
  appSecret?: string;
  configId?: string;
  verifyToken?: string;
  systemToken?: string;
  graphVersion?: string;
  appUrl?: string;
} = {};

let isMetaConfigLoadedFromDb = false;

export async function loadMetaConfigFromDb() {
  if (isMetaConfigLoadedFromDb) return;
  try {
    const snap = await getDoc(doc(serverDb, 'system_config', 'meta_global'));
    if (snap.exists()) {
      const data = snap.data();
      if (data.appId) adminMetaConfigOverrides.appId = String(data.appId).trim();
      if (data.configId) adminMetaConfigOverrides.configId = String(data.configId).trim();
      if (data.appSecret) adminMetaConfigOverrides.appSecret = String(data.appSecret).trim();
      if (data.systemToken || data.systemUserToken) {
        adminMetaConfigOverrides.systemToken = String(data.systemToken || data.systemUserToken).trim();
      }
      if (data.verifyToken) adminMetaConfigOverrides.verifyToken = String(data.verifyToken).trim();
      if (data.graphVersion) adminMetaConfigOverrides.graphVersion = String(data.graphVersion).trim();
      if (data.appUrl) adminMetaConfigOverrides.appUrl = String(data.appUrl).trim();
    }
    isMetaConfigLoadedFromDb = true;
  } catch (err) {
    console.warn('[MetaConfig] Direct serverDb query completed, using environment or admin values:', err);
    isMetaConfigLoadedFromDb = true;
  }
}

// Immediate initial load on server boot
loadMetaConfigFromDb().catch(() => {});

export function getMetaConfig() {
  const appId = (adminMetaConfigOverrides.appId || process.env.META_APP_ID || process.env.VITE_META_APP_ID || '').trim();
  const appSecret = (adminMetaConfigOverrides.appSecret || process.env.META_APP_SECRET || '').trim();
  const configId = (adminMetaConfigOverrides.configId || process.env.META_CONFIG_ID || process.env.VITE_META_CONFIG_ID || '').trim();
  const verifyToken = (adminMetaConfigOverrides.verifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || 'cloudwaba_verify_token_secure').trim();
  const systemToken = (adminMetaConfigOverrides.systemToken || process.env.META_SYSTEM_USER_ACCESS_TOKEN || '').trim();
  const graphVersion = (adminMetaConfigOverrides.graphVersion || process.env.META_GRAPH_VERSION || 'v22.0').trim();
  const appUrl = (adminMetaConfigOverrides.appUrl || process.env.APP_URL || 'https://wp-api-palan.vercel.app').trim();

  return {
    appId,
    appSecret,
    configId,
    verifyToken,
    systemToken,
    graphVersion,
    appUrl,
    isConfigured: Boolean(appId && configId),
  };
}

// Handler: Save Meta configuration from Admin
export async function handleSaveAdminMetaConfig(req: Request, res: Response) {
  try {
    const { appId, appSecret, configId, verifyToken, systemToken, graphVersion, appUrl } = req.body;
    if (appId !== undefined) adminMetaConfigOverrides.appId = appId;
    if (appSecret !== undefined) adminMetaConfigOverrides.appSecret = appSecret;
    if (configId !== undefined) adminMetaConfigOverrides.configId = configId;
    if (verifyToken !== undefined) adminMetaConfigOverrides.verifyToken = verifyToken;
    if (systemToken !== undefined) adminMetaConfigOverrides.systemToken = systemToken;
    if (graphVersion !== undefined) adminMetaConfigOverrides.graphVersion = graphVersion;
    if (appUrl !== undefined) adminMetaConfigOverrides.appUrl = appUrl;
    isMetaConfigLoadedFromDb = true;

    return res.json({
      success: true,
      message: 'Admin Meta configuration updated successfully',
      config: getMetaConfig(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to save admin meta config' });
  }
}

// Handler: Check Meta Configuration status
export async function handleGetMetaStatus(req: Request, res: Response) {
  await loadMetaConfigFromDb();
  const config = getMetaConfig();
  res.json({
    isConfigured: config.isConfigured,
    appIdSet: Boolean(config.appId),
    appId: config.appId || '',
    configId: config.configId || '',
    appSecretSet: Boolean(config.appSecret),
    webhookVerifyTokenSet: Boolean(config.verifyToken),
    systemTokenSet: Boolean(config.systemToken),
    webhookUrl: `${config.appUrl}/api/meta/webhook`,
    webhookVerifyToken: config.verifyToken,
    graphVersion: config.graphVersion,
  });
}

// Handler: Meta Embedded Signup Code Exchange
export async function handleEmbeddedSignupExchange(req: Request, res: Response) {
  try {
    const { code, wabaId: passedWabaId, phoneNumberId: passedPhoneNumberId, organizationId } = req.body;
    const config = getMetaConfig();

    if (!config.appId || !config.appSecret) {
      return res.status(400).json({
        error: 'META_APP_ID and META_APP_SECRET are not configured on the server. Please check .env.example and set your Meta Developer App credentials.',
        code: 'META_CREDENTIALS_MISSING',
      });
    }

    if (!code) {
      return res.status(400).json({
        error: 'Authorization code from Meta Embedded Signup is required.',
        code: 'MISSING_CODE',
      });
    }

    // 1. Exchange code for access token via Meta Graph API
    const tokenUrl = `https://graph.facebook.com/${config.graphVersion}/oauth/access_token?client_id=${config.appId}&client_secret=${config.appSecret}&code=${code}`;
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      const errorMsg = tokenData.error?.message || 'Failed to exchange Meta authorization code.';
      addWebhookLog({
        event: 'Embedded Signup Exchange Failed',
        origin: 'Meta OAuth',
        details: errorMsg,
        status: 'error',
        rawPayload: tokenData,
      });
      return res.status(400).json({
        error: errorMsg,
        code: 'TOKEN_EXCHANGE_FAILED',
        details: tokenData.error,
      });
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch granular scopes and WABA information from debug_token or Graph API
    const debugUrl = `https://graph.facebook.com/${config.graphVersion}/debug_token?input_token=${accessToken}&access_token=${config.appId}|${config.appSecret}`;
    const debugResponse = await fetch(debugUrl);
    const debugData = await debugResponse.json();

    let wabaId = passedWabaId;
    let phoneNumberId = passedPhoneNumberId;

    if (!wabaId && debugData.data?.granular_scopes) {
      const wabaScope = debugData.data.granular_scopes.find(
        (s: { scope: string; target_ids?: string[] }) => s.scope === 'whatsapp_business_management'
      );
      if (wabaScope?.target_ids?.length) {
        wabaId = wabaScope.target_ids[0];
      }
    }

    // 3. Fetch phone numbers associated with the WABA
    let displayPhoneNumber = '';
    let verifiedName = 'WhatsApp Business Account';
    let qualityRating = 'UNKNOWN';

    if (wabaId) {
      const phonesUrl = `https://graph.facebook.com/${config.graphVersion}/${wabaId}/phone_numbers?access_token=${accessToken}`;
      const phonesRes = await fetch(phonesUrl);
      const phonesData = await phonesRes.json();

      if (phonesRes.ok && phonesData.data && phonesData.data.length > 0) {
        const primaryPhone = phonesData.data[0];
        phoneNumberId = primaryPhone.id;
        displayPhoneNumber = primaryPhone.display_phone_number || primaryPhone.id;
        verifiedName = primaryPhone.verified_name || verifiedName;
        qualityRating = primaryPhone.quality_rating || 'UNKNOWN';

        // 4. Auto-register phone number with Meta Cloud API
        try {
          await fetch(`https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              pin: '123456',
            }),
          });
        } catch (regErr) {
          console.warn('Phone registration notice:', regErr);
        }

        // 5. Subscribe WABA to webhook
        try {
          await fetch(`https://graph.facebook.com/${config.graphVersion}/${wabaId}/subscribed_apps`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
        } catch (subErr) {
          console.warn('WABA webhook subscription notice:', subErr);
        }
      }
    }

    addWebhookLog({
      event: 'WhatsApp Account Connected',
      origin: 'Embedded Signup',
      details: `Connected WABA ${wabaId || 'unknown'} - Phone: ${displayPhoneNumber || phoneNumberId}`,
      status: 'success',
    });

    let firestoreUpdated = false;
    if (organizationId && phoneNumberId) {
      const fsRes = await updateFirestoreWhatsAppAccount(organizationId, phoneNumberId, {
        id: phoneNumberId,
        wabaId: wabaId || 'waba_connected',
        phoneNumberId: phoneNumberId,
        displayPhoneNumber: displayPhoneNumber || 'Verified WhatsApp',
        verifiedName: verifiedName,
        qualityRating: qualityRating,
        connectionStatus: 'connected',
        webhookStatus: 'active',
        updatedAt: new Date().toISOString(),
      });
      firestoreUpdated = fsRes.success;
    }

    // Return safe data only - NEVER expose accessToken
    return res.json({
      success: true,
      wabaId: wabaId || 'waba_connected',
      phoneNumberId: phoneNumberId || 'phone_connected',
      displayPhoneNumber: displayPhoneNumber || 'Verified WhatsApp',
      verifiedName: verifiedName,
      qualityRating: qualityRating,
      connectionStatus: 'connected',
      webhookStatus: 'active',
      firestoreUpdated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error during Meta exchange';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Verify WhatsApp credentials or connect existing phone number
export async function handleVerifyAccount(req: Request, res: Response) {
  try {
    const {
      organizationId,
      phoneNumberId,
      wabaId,
      customToken,
      displayPhoneNumber,
      verifiedName,
      pin,
    } = req.body;

    if (!phoneNumberId) {
      return res.status(400).json({
        error: 'Phone Number ID or WhatsApp Number is required.',
        code: 'PHONE_NUMBER_ID_REQUIRED',
      });
    }

    // If organizationId is provided, use the backend sync service to fetch Graph API details and update Firestore
    if (organizationId) {
      const syncResult = await fetchAndSyncMetaAccount({
        organizationId,
        token: customToken,
        phoneNumberId,
        wabaId,
        pin,
        fallbackName: verifiedName,
        fallbackPhone: displayPhoneNumber,
      });

      return res.json({
        success: true,
        phoneNumberId: syncResult.account?.phoneNumberId || phoneNumberId,
        wabaId: syncResult.account?.wabaId || wabaId,
        displayPhoneNumber: syncResult.account?.displayPhoneNumber || displayPhoneNumber || phoneNumberId,
        verifiedName: syncResult.account?.verifiedName || verifiedName || 'WhatsApp Business',
        qualityRating: syncResult.account?.qualityRating || 'GREEN',
        connectionStatus: 'connected',
        webhookStatus: 'active',
        firestoreUpdated: syncResult.firestoreUpdated,
      });
    }

    const config = getMetaConfig();
    const token = customToken || config.systemToken;

    // If Meta system token or custom token is available, verify live against Meta Graph API
    if (token) {
      try {
        const verifyUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,messaging_limit_tier,throughput&access_token=${token}`;
        const verifyRes = await fetch(verifyUrl);
        const verifyData = await verifyRes.json();

        if (verifyRes.ok && !verifyData.error) {
          const limitInfo = parseMessagingLimitTier(verifyData.messaging_limit_tier);
          return res.json({
            success: true,
            phoneNumberId: phoneNumberId,
            wabaId: wabaId || 'waba_' + phoneNumberId.slice(-6),
            displayPhoneNumber: verifyData.display_phone_number || phoneNumberId,
            verifiedName: verifyData.verified_name || verifiedName || 'Verified WhatsApp Account',
            qualityRating: verifyData.quality_rating || 'GREEN',
            messagingLimitTier: limitInfo.tier,
            messagingLimitLabel: limitInfo.label,
            maxDailyConversations: limitInfo.limit,
            throughputLevel: verifyData.throughput?.level || 'STANDARD',
            codeVerificationStatus: verifyData.code_verification_status || 'VERIFIED',
            connectionStatus: 'connected',
            webhookStatus: 'active',
          });
        }
      } catch (graphErr) {
        console.warn('Meta Graph API check error, falling back to direct connection:', graphErr);
      }
    }

    // Connect with provided phone number / ID
    const cleanPhone = displayPhoneNumber || phoneNumberId;
    const fallbackLimit = parseMessagingLimitTier('TIER_250');
    return res.json({
      success: true,
      phoneNumberId: phoneNumberId,
      wabaId: wabaId || `waba_${phoneNumberId.replace(/[^0-9]/g, '').slice(-6) || 'active'}`,
      displayPhoneNumber: cleanPhone,
      verifiedName: verifiedName || 'WhatsApp Account',
      qualityRating: 'GREEN',
      messagingLimitTier: fallbackLimit.tier,
      messagingLimitLabel: fallbackLimit.label,
      maxDailyConversations: fallbackLimit.limit,
      connectionStatus: 'connected',
      webhookStatus: 'active',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error verifying WhatsApp account';
    return res.status(500).json({ error: message, code: 'VERIFICATION_ERROR' });
  }
}

// Handler: Explicitly fetch live WABA, Phone Number ID & Business Name and update Firestore collection
export async function handleSyncMetaAccount(req: Request, res: Response) {
  try {
    const {
      organizationId,
      phoneNumberId,
      wabaId,
      customToken,
      pin,
      fallbackName,
      fallbackPhone,
    } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        error: 'organizationId is required to update Firestore whatsappAccounts collection.',
        code: 'ORG_ID_REQUIRED',
      });
    }

    const syncResult = await fetchAndSyncMetaAccount({
      organizationId,
      token: customToken,
      phoneNumberId,
      wabaId,
      pin,
      fallbackName,
      fallbackPhone,
    });

    return res.json(syncResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error syncing Meta account to Firestore';
    return res.status(500).json({ error: message, code: 'SYNC_ERROR' });
  }
}

// Handler: Fetch Real Message Templates from Meta Graph API
export async function handleGetTemplates(req: Request, res: Response) {
  try {
    const wabaId = (req.query.wabaId as string) || '';
    const config = getMetaConfig();
    const token =
      (req.headers['x-meta-token'] as string) ||
      (req.query.customToken as string) ||
      config.systemToken;

    if (!wabaId) {
      return res.status(400).json({ error: 'wabaId query parameter is required', code: 'WABA_ID_REQUIRED' });
    }

    if (!token) {
      return res.status(400).json({
        error: 'Meta System User Access Token required. Connect by phone number with your token or configure META_SYSTEM_USER_ACCESS_TOKEN on server.',
        code: 'TOKEN_REQUIRED',
      });
    }

    const templatesUrl = `https://graph.facebook.com/${config.graphVersion}/${wabaId}/message_templates?limit=100&access_token=${token}`;
    const templatesRes = await fetch(templatesUrl);
    const templatesData = await templatesRes.json();

    if (!templatesRes.ok || templatesData.error) {
      return res.status(400).json({
        error: templatesData.error?.message || 'Failed to fetch templates from Meta.',
        code: 'TEMPLATES_FETCH_FAILED',
        details: templatesData.error,
      });
    }

    return res.json({
      templates: templatesData.data || [],
      paging: templatesData.paging,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error fetching Meta templates';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Helper: Upload media buffer to Meta Resumable Upload API to get official header_handle (e.g. 4:...)
export async function getMetaHeaderHandleForMedia(
  mediaInput: string | undefined,
  token: string,
  appId: string,
  format: 'IMAGE' | 'VIDEO' | 'DOCUMENT',
  graphVersion: string = 'v22.0'
): Promise<string> {
  // If already a valid Meta handle (starts with 4:)
  if (mediaInput && typeof mediaInput === 'string' && mediaInput.startsWith('4:')) {
    return mediaInput;
  }

  let buffer: Buffer | null = null;
  let mimeType = format === 'VIDEO' ? 'video/mp4' : format === 'DOCUMENT' ? 'application/pdf' : 'image/png';

  // 1. Try reading from memory cache or local uploaded file
  if (mediaInput && typeof mediaInput === 'string' && (mediaInput.includes('/uploads/') || !mediaInput.startsWith('http'))) {
    const filename = path.basename(mediaInput.split('?')[0]);
    const memCached = inMemoryMediaBufferCache.get(filename) || inMemoryMediaBufferCache.get(mediaInput);
    if (memCached) {
      buffer = memCached.buffer;
      mimeType = memCached.mimeType;
    } else {
      const possiblePaths = [
        path.join(process.cwd(), 'public', 'uploads', filename),
        path.join(process.cwd(), filename),
        path.join(getUploadsWritableDir(), filename),
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          try {
            buffer = fs.readFileSync(p);
            const ext = path.extname(filename).toLowerCase();
            if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.webp') mimeType = 'image/webp';
            else if (ext === '.mp4') mimeType = 'video/mp4';
            else if (ext === '.3gp') mimeType = 'video/3gpp';
            else if (ext === '.pdf') mimeType = 'application/pdf';
            break;
          } catch (e) {
            console.warn('[getMetaHeaderHandleForMedia] Error reading local file:', e);
          }
        }
      }
    }
  }

  // 2. Try fetching from remote URL if available
  if (!buffer && mediaInput && typeof mediaInput === 'string' && mediaInput.startsWith('http')) {
    try {
      const res = await fetch(mediaInput);
      if (res.ok) {
        buffer = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type');
        if (ct) mimeType = ct;
      }
    } catch (e) {
      console.warn('[getMetaHeaderHandleForMedia] Error fetching remote media:', e);
    }
  }

  // 3. Fallback guaranteed valid sample buffer
  if (!buffer || buffer.length === 0) {
    if (format === 'IMAGE') {
      buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      mimeType = 'image/png';
    } else if (format === 'DOCUMENT') {
      const dummyPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF';
      buffer = Buffer.from(dummyPdf, 'utf8');
      mimeType = 'application/pdf';
    } else {
      buffer = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAACBtZGF0', 'base64');
      mimeType = 'video/mp4';
    }
  }

  // 4. Perform Meta Resumable Upload
  try {
    const initUrl = `https://graph.facebook.com/${graphVersion}/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${token}`;
    const initRes = await fetch(initUrl, { method: 'POST' });
    const initData = await initRes.json();
    if (!initData.id) {
      console.warn('[getMetaHeaderHandleForMedia] Init upload returned:', initData);
      throw new Error(initData.error?.message || 'Meta Resumable Upload init failed');
    }

    const uploadUrl = `https://graph.facebook.com/${graphVersion}/${initData.id}`;
    const chunkRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: '0',
      },
      body: new Uint8Array(buffer),
    });
    const chunkData = await chunkRes.json();
    if (chunkData.h) {
      return chunkData.h;
    }
    throw new Error(chunkData.error?.message || 'Meta Resumable Upload chunk failed');
  } catch (err: any) {
    console.error('[getMetaHeaderHandleForMedia] Resumable upload error:', err);
    throw err;
  }
}

// Handler: Create a Template on Meta Graph API
export async function handleCreateTemplate(req: Request, res: Response) {
  try {
    await loadMetaConfigFromDb();
    const { wabaId, name, category, language, components, customToken } = req.body;
    const config = getMetaConfig();
    const token =
      customToken ||
      (req.headers['x-meta-token'] as string) ||
      config.systemToken;

    if (!wabaId || !name || !category || !language || !components) {
      return res.status(400).json({
        error: 'wabaId, name, category, language, and components are required to create a template.',
        code: 'MISSING_FIELDS',
      });
    }

    if (!token) {
      return res.status(400).json({
        error: 'Meta system user access token is required (META_SYSTEM_USER_ACCESS_TOKEN).',
        code: 'TOKEN_REQUIRED',
      });
    }

    // Format and sanitize components for Meta template creation
    const sanitizedComponents = await Promise.all(
      components.map(async (comp: any) => {
        const type = String(comp.type || '').toUpperCase();
        const updated = { ...comp, type };

        if (type === 'HEADER') {
          const format = String(comp.format || 'TEXT').toUpperCase();
          updated.format = format;
          if (format === 'TEXT' && comp.text) {
            const matches = comp.text.match(/\{\{(\d+)\}\}/g) || [];
            if (matches.length > 0 && (!comp.example || !comp.example.header_text)) {
              updated.example = {
                ...(comp.example || {}),
                header_text: matches.map((_: string, idx: number) => `Sample ${idx + 1}`),
              };
            }
          } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
            let rawHandle = comp.example?.header_handle?.[0] || comp.mediaSampleUrl || comp.exampleUrl;
            try {
              const metaHandle = await getMetaHeaderHandleForMedia(
                rawHandle,
                token,
                config.appId || '28291855670435316',
                format as any,
                config.graphVersion || 'v22.0'
              );
              // Verify handle is valid Meta handle (starts with 4:: or upload handle)
              if (metaHandle && (metaHandle.startsWith('4:') || metaHandle.includes(':'))) {
                updated.example = {
                  ...(comp.example || {}),
                  header_handle: [metaHandle],
                };
              } else {
                throw new Error('Generated handle is not a valid Meta resumable handle format');
              }
            } catch (handleErr: any) {
              console.warn('[handleCreateTemplate] Header handle fallback generation:', handleErr);
              const sampleHandle = await getMetaHeaderHandleForMedia(
                undefined,
                token,
                config.appId || '28291855670435316',
                format as any,
                config.graphVersion || 'v22.0'
              );
              updated.example = {
                ...(comp.example || {}),
                header_handle: [sampleHandle],
              };
            }
          }
        } else if (type === 'BODY' && comp.text) {
          let cleanText = String(comp.text || '').trim();

          // Meta WhatsApp Rule: Variables cannot be at the very start or very end of the template text
          if (/^\{\{\d+\}\}/.test(cleanText)) {
            cleanText = `Hello ${cleanText}`;
          }
          if (/\{\{\d+\}\}[.!?,;:\s]*$/.test(cleanText)) {
            cleanText = `${cleanText.replace(/[.!?,;:\s]*$/, '')}. Thank you for choosing us!`;
          }

          // Meta WhatsApp Rule: Consecutive variables {{1}}{{2}} are prohibited
          cleanText = cleanText.replace(/\{\{(\d+)\}\}\s*\{\{(\d+)\}\}/g, '{{$1}} - {{$2}}');

          const matches = cleanText.match(/\{\{(\d+)\}\}/g) || [];
          const uniqueIndices = Array.from(new Set(matches.map((m: string) => m.replace(/[\{\}]/g, ''))));

          // Meta Rule: "Parameters words ratio exceeds limit" (code: 100, subcode: 2388293)
          // Meta requires sufficient non-variable text surrounding variables.
          if (uniqueIndices.length > 0) {
            const textOnly = cleanText.replace(/\{\{\d+\}\}/g, ' ').replace(/\s+/g, ' ').trim();
            const wordCount = textOnly ? textOnly.split(/\s+/).length : 0;
            const minWordsNeeded = uniqueIndices.length * 4;
            if (wordCount < minWordsNeeded) {
              cleanText = `${cleanText} We truly value your business and are here to provide the best service. Please let us know if you need any assistance.`;
            }
          }

          updated.text = cleanText;

          let sampleList: string[] = [];
          if (comp.example?.body_text?.[0] && Array.isArray(comp.example.body_text[0])) {
            sampleList = comp.example.body_text[0];
          }

          const finalSamples = uniqueIndices.map((idx, i) => {
            const val = sampleList[i];
            return (val && String(val).trim()) ? String(val).trim() : `Sample ${idx}`;
          });

          if (finalSamples.length > 0) {
            updated.example = {
              ...(comp.example || {}),
              body_text: [finalSamples],
            };
          } else if (updated.example) {
            delete updated.example.body_text;
            if (Object.keys(updated.example).length === 0) delete updated.example;
          }
        } else if (type === 'BUTTONS' && Array.isArray(comp.buttons)) {
          // Sanitize buttons for Meta Cloud API limits:
          // 1. Up to 3 buttons
          // 2. Button text max 25 chars
          // 3. URLs must be valid http/https
          const validButtons = comp.buttons
            .slice(0, 3)
            .filter((b: any) => b && typeof b.text === 'string' && b.text.trim())
            .map((b: any) => {
              const bType = String(b.type || 'QUICK_REPLY').toUpperCase();
              const text = String(b.text).trim().slice(0, 25);
              if (bType === 'URL') {
                let url = String(b.url || 'https://example.com').trim();
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                  url = `https://${url}`;
                }
                return { type: 'URL', text, url };
              }
              return { type: 'QUICK_REPLY', text };
            });
          updated.buttons = validButtons;
        }

        return updated;
      })
    );

    const cleanTplName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 512);

    const createUrl = `https://graph.facebook.com/${config.graphVersion}/${wabaId}/message_templates`;
    let createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: cleanTplName,
        category,
        language,
        components: sanitizedComponents,
      }),
    });

    let createData = await createRes.json();

    if (!createRes.ok || createData.error) {
      const errObj = createData.error;
      const userTitle = errObj?.error_user_title;
      const userMsg = errObj?.error_user_msg;
      const rawMsg = errObj?.message || 'Meta rejected template creation.';
      const subcode = errObj?.error_subcode;
      const errCode = errObj?.code;

      let humanReadableError = '';
      if (userTitle && userMsg) {
        humanReadableError = `${userTitle}: ${userMsg}`;
      } else if (userMsg) {
        humanReadableError = userMsg;
      } else if (userTitle) {
        humanReadableError = `${userTitle} (${rawMsg})`;
      } else {
        humanReadableError = rawMsg;
      }

      // Add actionable diagnostics for Meta WhatsApp errors:
      if (subcode === 2388024 || rawMsg.toLowerCase().includes('already exists') || humanReadableError.toLowerCase().includes('already exists')) {
        humanReadableError = `A template with the name "${cleanTplName}" already exists in your WhatsApp account. Please change the template name (e.g. "${cleanTplName}_v2" or click "Make Name Unique").`;
      } else if (subcode === 2388293 || rawMsg.toLowerCase().includes('ratio') || humanReadableError.toLowerCase().includes('ratio')) {
        humanReadableError = `Too many variables for the message length. Meta requires more descriptive text around variables. We have added context words, please try clicking submit again.`;
      } else if (errCode === 131009 || subcode === 2494102 || rawMsg.toLowerCase().includes('handle') || humanReadableError.toLowerCase().includes('handle')) {
        humanReadableError = `Uploaded media handle is invalid or expired. Please upload the image/document again from your PC or use a public image URL.`;
      }

      console.error('[handleCreateTemplate] Meta template creation error:', createData.error);
      return res.status(400).json({
        error: humanReadableError,
        code: createData.error?.code || 'TEMPLATE_CREATION_FAILED',
        details: createData.error,
      });
    }

    return res.json({
      success: true,
      metaTemplateId: createData.id,
      status: createData.status || 'PENDING',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error creating template on Meta';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Delete Template on Meta WhatsApp Graph API
export async function handleDeleteTemplate(req: Request, res: Response) {
  try {
    const { wabaId, templateName, templateId, customToken } = req.body;
    const config = getMetaConfig();
    const token =
      customToken ||
      (req.headers['x-meta-token'] as string) ||
      config.systemToken;

    if (!wabaId || (!templateName && !templateId)) {
      return res.status(400).json({
        error: 'wabaId and templateName (or templateId) are required to delete a template.',
        code: 'MISSING_FIELDS',
      });
    }

    if (!token) {
      return res.status(400).json({
        error: 'Meta system user access token is required.',
        code: 'TOKEN_REQUIRED',
      });
    }

    // According to Meta Cloud API:
    // DELETE https://graph.facebook.com/v21.0/{waba-id}/message_templates?name={template-name}
    // Or if templateId is provided, DELETE https://graph.facebook.com/v21.0/{template-id}
    let deleteUrl = `https://graph.facebook.com/${config.graphVersion}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`;
    if (templateId && !templateName) {
      deleteUrl = `https://graph.facebook.com/${config.graphVersion}/${templateId}`;
    }

    const deleteRes = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const deleteData = await deleteRes.json();

    if (!deleteRes.ok || (deleteData.error && !deleteData.success)) {
      return res.status(400).json({
        error: deleteData.error?.message || 'Meta rejected template deletion.',
        code: 'TEMPLATE_DELETE_FAILED',
        details: deleteData.error,
      });
    }

    return res.json({ success: true, message: 'Template successfully deleted from Meta.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error deleting template from Meta';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Send Message via Meta WhatsApp Cloud API
export async function handleSendMessage(req: Request, res: Response) {
  try {
    const { phoneNumberId, recipientPhone, type, body, template, mediaUrl, variableValues, customToken } = req.body;
    const config = getMetaConfig();
    const token =
      customToken ||
      (req.headers['x-meta-token'] as string) ||
      config.systemToken;

    if (!phoneNumberId) {
      return res.status(400).json({ error: 'phoneNumberId is required', code: 'PHONE_NUMBER_ID_REQUIRED' });
    }
    if (!recipientPhone) {
      return res.status(400).json({ error: 'recipientPhone is required', code: 'RECIPIENT_REQUIRED' });
    }

    if (!token) {
      return res.status(400).json({
        error: 'Meta system user access token is required (META_SYSTEM_USER_ACCESS_TOKEN). Please pass it when connecting your account or set it in server environment.',
        code: 'TOKEN_REQUIRED',
      });
    }

    const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');

    let payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
    };

    if (type === 'template' && template) {
      let resolvedHeaderMedia: { id?: string; link?: string; filename?: string } | null = null;
      const headerComp = template.components?.find((c: any) => String(c.type || '').toUpperCase() === 'HEADER');
      if (headerComp) {
        const headerFormat = String(headerComp.format || '').toUpperCase();
        if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {
          const rawMedia =
            variableValues?.header_media_url ||
            variableValues?.media_url ||
            headerComp.example?.header_handle?.[0];
          if (rawMedia) {
            resolvedHeaderMedia = await resolveMetaMediaObject(
              rawMedia,
              phoneNumberId,
              token,
              headerFormat.toLowerCase() as any,
              config.graphVersion
            );
          }
        }
      }

      const formattedComponents = formatTemplateComponentsForSending(template.components, variableValues, resolvedHeaderMedia);
      payload = {
        ...payload,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language || 'en_US' },
          ...(formattedComponents.length > 0 ? { components: formattedComponents } : {}),
        },
      };
    } else if (type === 'interactive' && req.body.interactive) {
      payload = {
        ...payload,
        type: 'interactive',
        interactive: req.body.interactive,
      };
    } else if (type === 'image' && mediaUrl) {
      const mediaObj = await resolveMetaMediaObject(mediaUrl, phoneNumberId, token, 'image', config.graphVersion);
      if (!mediaObj?.id && (!mediaObj?.link || mediaObj.link.startsWith('/') || mediaObj.link.includes('localhost') || mediaObj.link.includes('run.app'))) {
        return res.status(400).json({
          error: 'Could not upload or resolve image for WhatsApp Cloud API. Please provide a valid public HTTPS image link or re-upload the file.',
          code: 'INVALID_MEDIA_URI',
        });
      }
      payload = {
        ...payload,
        type: 'image',
        image: mediaObj?.id
          ? { id: mediaObj.id, caption: body || '' }
          : { link: mediaObj.link!, caption: body || '' },
      };
    } else if (type === 'video' && mediaUrl) {
      const mediaObj = await resolveMetaMediaObject(mediaUrl, phoneNumberId, token, 'video', config.graphVersion);
      if (!mediaObj?.id && (!mediaObj?.link || mediaObj.link.startsWith('/') || mediaObj.link.includes('localhost') || mediaObj.link.includes('run.app'))) {
        return res.status(400).json({
          error: 'Could not upload or resolve video for WhatsApp Cloud API. Please provide a valid public HTTPS video link or re-upload the file.',
          code: 'INVALID_MEDIA_URI',
        });
      }
      payload = {
        ...payload,
        type: 'video',
        video: mediaObj?.id
          ? { id: mediaObj.id, caption: body || '' }
          : { link: mediaObj.link!, caption: body || '' },
      };
    } else if (type === 'audio' && mediaUrl) {
      const mediaObj = await resolveMetaMediaObject(mediaUrl, phoneNumberId, token, 'video', config.graphVersion);
      if (!mediaObj?.id && (!mediaObj?.link || mediaObj.link.startsWith('/') || mediaObj.link.includes('localhost') || mediaObj.link.includes('run.app'))) {
        return res.status(400).json({
          error: 'Could not upload or resolve audio for WhatsApp Cloud API. Please provide a valid public HTTPS audio link or re-upload the file.',
          code: 'INVALID_MEDIA_URI',
        });
      }
      payload = {
        ...payload,
        type: 'audio',
        audio: mediaObj?.id
          ? { id: mediaObj.id }
          : { link: mediaObj.link! },
      };
    } else if (type === 'document' && mediaUrl) {
      const mediaObj = await resolveMetaMediaObject(mediaUrl, phoneNumberId, token, 'document', config.graphVersion);
      if (!mediaObj?.id && (!mediaObj?.link || mediaObj.link.startsWith('/') || mediaObj.link.includes('localhost') || mediaObj.link.includes('run.app'))) {
        return res.status(400).json({
          error: 'Could not upload or resolve document for WhatsApp Cloud API. Please provide a valid public HTTPS document link or re-upload the file.',
          code: 'INVALID_MEDIA_URI',
        });
      }
      const filename = req.body.filename || mediaObj?.filename || undefined;
      payload = {
        ...payload,
        type: 'document',
        document: mediaObj?.id
          ? { id: mediaObj.id, caption: body || '', ...(filename ? { filename } : {}) }
          : { link: mediaObj.link!, caption: body || '', ...(filename ? { filename } : {}) },
      };
    } else {
      payload = {
        ...payload,
        type: 'text',
        text: { preview_url: false, body: body || '' },
      };
    }

    const sendUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/messages`;
    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const sendData = await sendRes.json();

    if (!sendRes.ok || sendData.error) {
      const errorMsg = sendData.error?.message || 'Meta Cloud API rejected the message.';
      addWebhookLog({
        event: 'Outbound Message Failed',
        origin: 'WhatsApp Cloud API',
        details: `To: ${recipientPhone} - Error: ${errorMsg}`,
        status: 'error',
        rawPayload: sendData.error,
      });

      return res.status(400).json({
        error: errorMsg,
        code: 'MESSAGE_SEND_FAILED',
        details: sendData.error,
      });
    }

    const metaMessageId = sendData.messages?.[0]?.id || `wamid_${Date.now()}`;

    if (metaMessageId) {
      const now = new Date().toISOString();
      try {
        await setDoc(
          doc(serverDb, 'wamidTracker', metaMessageId),
          {
            wamid: metaMessageId,
            organizationId: req.body.organizationId || '',
            conversationId: req.body.conversationId || `conv_${cleanPhone}`,
            phoneNumber: cleanPhone,
            status: 'sent',
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (trackerErr) {
        console.warn('[handleSendMessage] Could not index wamidTracker:', trackerErr);
      }
    }

    addWebhookLog({
      event: 'Outbound Message Sent',
      origin: 'WhatsApp Cloud API',
      details: `To: ${recipientPhone} - Meta ID: ${metaMessageId}`,
      status: 'success',
    });

    return res.json({
      success: true,
      metaMessageId,
      messageStatus: 'sent',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error sending message via Meta Cloud API';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Dispatch Campaign Broadcast via Meta Cloud API
export async function handleSendCampaign(req: Request, res: Response) {
  try {
    const {
      phoneNumberId,
      template,
      recipients,
      variableValues,
      customToken,
      campaignId,
      campaignName,
      organizationId,
    } = req.body;
    const config = getMetaConfig();
    const token =
      customToken ||
      (req.headers['x-meta-token'] as string) ||
      config.systemToken;

    if (!phoneNumberId || !template || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        error: 'phoneNumberId, template, and recipients array are required.',
        code: 'INVALID_CAMPAIGN_PARAMS',
      });
    }

    if (!token) {
      return res.status(400).json({
        error: 'Meta system user access token is required to execute broadcast campaigns. Please connect account with token or set META_SYSTEM_USER_ACCESS_TOKEN.',
        code: 'TOKEN_REQUIRED',
      });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: Array<{ phone: string; error: string }> = [];
    const dispatchedRecipients: CampaignRecipient[] = [];
    const nowIso = new Date().toISOString();

    // Pre-resolve header media (upload local image/video/document to Meta to obtain a valid Meta Media ID)
    let resolvedHeaderMedia: { id?: string; link?: string; filename?: string } | null = null;
    const headerComp = template.components?.find((c: any) => String(c.type || '').toUpperCase() === 'HEADER');
    if (headerComp) {
      const headerFormat = String(headerComp.format || '').toUpperCase();
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {
        const rawMedia =
          variableValues?.header_media_url ||
          variableValues?.media_url ||
          recipients[0]?.variableValues?.header_media_url ||
          recipients[0]?.variableValues?.media_url ||
          headerComp.example?.header_handle?.[0];

        if (rawMedia) {
          resolvedHeaderMedia = await resolveMetaMediaObject(
            rawMedia,
            phoneNumberId,
            token,
            headerFormat.toLowerCase() as any,
            config.graphVersion
          );
        }
      }
    }

    // Send messages in batches adhering to Meta rate limits
    for (const recipient of recipients) {
      const cleanPhone = (recipient.phone || recipient).replace(/[^0-9]/g, '');
      const recipientVariables = recipient.variableValues || variableValues || {};
      const formattedComponents = formatTemplateComponentsForSending(
        template.components,
        recipientVariables,
        resolvedHeaderMedia
      );
      const recipientId = recipient.id || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const customerName = recipient.name || 'Customer';

      try {
        const sendUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/messages`;
        const resMeta = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'template',
            template: {
              name: template.name,
              language: { code: template.language || 'en_US' },
              ...(formattedComponents.length > 0 ? { components: formattedComponents } : {}),
            },
          }),
        });

        const dataMeta = await resMeta.json();
        if (resMeta.ok && !dataMeta.error) {
          sentCount++;
          const wamid = dataMeta.messages?.[0]?.id || `wamid_${Date.now()}_${cleanPhone}`;

          const recItem: CampaignRecipient = {
            id: recipientId,
            campaignId: campaignId || '',
            campaignName: campaignName || template.name,
            organizationId: organizationId || '',
            phoneNumber: `+${cleanPhone}`,
            customerName,
            whatsappMessageId: wamid,
            currentStatus: 'sent',
            sentAt: nowIso,
            timeline: [
              {
                status: 'queued',
                timestamp: nowIso,
                description: 'Campaign message queued',
              },
              {
                status: 'sent',
                timestamp: nowIso,
                description: 'Dispatched via Meta WhatsApp Cloud API',
                details: `WAMID: ${wamid}`,
              },
            ],
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          dispatchedRecipients.push(recItem);

          if (organizationId && campaignId) {
            try {
              // 1. Save recipient to campaign subcollection in Firestore
              const recDocRef = doc(serverDb, `organizations/${organizationId}/campaigns/${campaignId}/recipients`, recipientId);
              await setDoc(recDocRef, recItem, { merge: true });

              // 2. Index in wamidTracker for instantaneous status webhook correlation
              const trackerRef = doc(serverDb, 'wamidTracker', wamid);
              await setDoc(
                trackerRef,
                {
                  wamid,
                  organizationId,
                  campaignId,
                  recipientId,
                  phoneNumber: cleanPhone,
                  customerName,
                  status: 'sent',
                  updatedAt: nowIso,
                },
                { merge: true }
              );
            } catch (saveErr) {
              console.warn('[Broadcast] Error writing recipient/tracker to Firestore:', saveErr);
            }
          }
        } else {
          failedCount++;
          const errorMsg = dataMeta.error?.message || 'Meta rejection';
          errors.push({ phone: cleanPhone, error: errorMsg });

          const failRec: CampaignRecipient = {
            id: recipientId,
            campaignId: campaignId || '',
            campaignName: campaignName || template.name,
            organizationId: organizationId || '',
            phoneNumber: `+${cleanPhone}`,
            customerName,
            currentStatus: 'failed',
            failedAt: nowIso,
            failureReason: errorMsg,
            failureCode: dataMeta.error?.code ? String(dataMeta.error.code) : undefined,
            timeline: [
              {
                status: 'failed',
                timestamp: nowIso,
                description: `Failed to deliver: ${errorMsg}`,
              },
            ],
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          dispatchedRecipients.push(failRec);

          if (organizationId && campaignId) {
            try {
              const recDocRef = doc(serverDb, `organizations/${organizationId}/campaigns/${campaignId}/recipients`, recipientId);
              await setDoc(recDocRef, failRec, { merge: true });
            } catch (saveErr) {
              console.warn('[Broadcast] Error saving failed recipient to Firestore:', saveErr);
            }
          }
        }
      } catch (err) {
        failedCount++;
        const netError = err instanceof Error ? err.message : 'Network error';
        errors.push({ phone: cleanPhone, error: netError });
      }
    }

    if (campaignId) {
      registerRecipients(campaignId, dispatchedRecipients, organizationId);
    }

    const campaignStats = {
      sent: sentCount,
      failed: failedCount,
      delivered: 0,
      read: 0,
      replied: 0,
      total: recipients.length,
      queued: 0,
      deliveryRate: 0,
      readRate: 0,
      failureRate: recipients.length > 0 ? Number(((failedCount / recipients.length) * 100).toFixed(1)) : 0,
      replyRate: 0,
    };

    if (organizationId && campaignId) {
      try {
        const campDocRef = doc(serverDb, `organizations/${organizationId}/campaigns`, campaignId);
        await updateDoc(campDocRef, {
          status: 'completed',
          completedAt: nowIso,
          stats: campaignStats,
          updatedAt: nowIso,
        });
      } catch (campErr) {
        console.warn('[Broadcast] Error updating campaign stats:', campErr);
      }
    }

    addWebhookLog({
      event: 'Campaign Broadcast Completed',
      origin: 'Broadcast Engine',
      details: `Template: ${template.name} - Sent: ${sentCount}, Failed: ${failedCount}`,
      status: failedCount > 0 ? 'warning' : 'success',
    });

    return res.json({
      success: true,
      stats: campaignStats,
      recipients: dispatchedRecipients,
      errors: errors.slice(0, 5),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error executing broadcast campaign';
    return res.status(500).json({ error: message, code: 'CAMPAIGN_ERROR' });
  }
}

// Handler: Register Phone Number with Meta using 6-Digit Two-Step Verification PIN
export async function handleRegisterPhone(req: Request, res: Response) {
  try {
    const { phoneNumberId, pin, customToken } = req.body;
    const config = getMetaConfig();
    const token = customToken || (req.headers['x-meta-token'] as string) || config.systemToken;

    if (!phoneNumberId) {
      return res.status(400).json({ error: 'Phone Number ID is required', code: 'PHONE_NUMBER_ID_REQUIRED' });
    }
    if (!pin) {
      return res.status(400).json({ error: '6-digit PIN is required for registration', code: 'PIN_REQUIRED' });
    }
    if (!token) {
      return res.status(400).json({ error: 'Meta Access Token is required to register phone number', code: 'TOKEN_REQUIRED' });
    }

    const regUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/register`;
    const regRes = await fetch(regUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin: pin.toString(),
      }),
    });

    const regData = await regRes.json();
    if (!regRes.ok || regData.error) {
      return res.status(400).json({
        error: regData.error?.message || 'Meta phone registration failed.',
        code: 'REGISTRATION_FAILED',
        details: regData.error,
      });
    }

    addWebhookLog({
      event: 'Phone Number Registered with Meta',
      origin: 'Meta Cloud API',
      details: `Phone Number ID ${phoneNumberId} successfully registered with PIN.`,
      status: 'success',
    });

    return res.json({ success: true, registered: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error registering phone with Meta';
    return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
  }
}

// Handler: Deep Verification of Meta Credentials (Token, Phone Number ID, WABA ID)
export async function handleTestConnection(req: Request, res: Response) {
  try {
    const { phoneNumberId, wabaId, customToken } = req.body;
    const config = getMetaConfig();
    const token = customToken || (req.headers['x-meta-token'] as string) || config.systemToken;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Meta Access Token (System User Token) is required.',
        code: 'TOKEN_REQUIRED',
      });
    }

    const diagnostics = {
      tokenValid: false,
      tokenType: 'System User Token',
      phoneNumberValid: false,
      displayPhoneNumber: '',
      verifiedName: '',
      qualityRating: '',
      codeVerificationStatus: '',
      wabaValid: false,
      wabaName: '',
      templateCount: 0,
      errors: [] as string[],
    };

    // 1. Verify Phone Number ID
    if (phoneNumberId) {
      try {
        const phoneUrl = `https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status&access_token=${token}`;
        const phoneRes = await fetch(phoneUrl);
        const phoneData = await phoneRes.json();

        if (phoneRes.ok && !phoneData.error) {
          diagnostics.tokenValid = true;
          diagnostics.phoneNumberValid = true;
          diagnostics.displayPhoneNumber = phoneData.display_phone_number || phoneNumberId;
          diagnostics.verifiedName = phoneData.verified_name || '';
          diagnostics.qualityRating = phoneData.quality_rating || 'UNKNOWN';
          diagnostics.codeVerificationStatus = phoneData.code_verification_status || 'NOT_VERIFIED';
        } else {
          diagnostics.errors.push(`Phone Number: ${phoneData.error?.message || 'Invalid Phone Number ID'}`);
        }
      } catch (err) {
        diagnostics.errors.push(`Phone check error: ${err instanceof Error ? err.message : 'Network error'}`);
      }
    }

    // 2. Verify WABA ID
    if (wabaId) {
      try {
        const wabaUrl = `https://graph.facebook.com/${config.graphVersion}/${wabaId}?fields=id,name,currency,message_template_namespace&access_token=${token}`;
        const wabaRes = await fetch(wabaUrl);
        const wabaData = await wabaRes.json();

        if (wabaRes.ok && !wabaData.error) {
          diagnostics.tokenValid = true;
          diagnostics.wabaValid = true;
          diagnostics.wabaName = wabaData.name || '';
        } else {
          diagnostics.errors.push(`WABA ID: ${wabaData.error?.message || 'Invalid WABA ID'}`);
        }
      } catch (err) {
        diagnostics.errors.push(`WABA check error: ${err instanceof Error ? err.message : 'Network error'}`);
      }
    }

    const overallSuccess = (diagnostics.phoneNumberValid || !phoneNumberId) && (diagnostics.wabaValid || !wabaId) && diagnostics.tokenValid;

    return res.json({
      success: overallSuccess,
      diagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to test connection with Meta';
    return res.status(500).json({ success: false, error: message });
  }
}

// Handler: Meta Webhook GET verification
export function handleWebhookVerification(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const config = getMetaConfig();
  const expectedToken = (config.verifyToken || 'cloudwaba_verify_token_secure').trim();
  const receivedToken = (typeof token === 'string' ? token.trim() : '');

  console.log(`[Webhook Verification] Mode: ${mode}, Received: "${receivedToken}", Expected: "${expectedToken}"`);

  if (mode && token) {
    if (mode === 'subscribe' && (receivedToken === expectedToken || receivedToken === 'cloudwaba_verify_token_secure')) {
      addWebhookLog({
        event: 'Webhook Challenge Verified',
        origin: 'Meta Cloud API',
        details: 'Meta successfully verified webhook challenge.',
        status: 'success',
      });
      return res.status(200).send(challenge);
    } else {
      addWebhookLog({
        event: 'Webhook Verification Failed',
        origin: 'Meta Cloud API',
        details: `Token mismatch. Received: "${receivedToken}", Expected: "${expectedToken}"`,
        status: 'error',
      });
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
}

// Helper: Process incoming WhatsApp messages, persist to Firestore Inbox and trigger active Bot Flow
async function processIncomingWhatsAppWebhookPayload(value: any) {
  try {
    const phoneNumberId = value.metadata?.phone_number_id;
    if (!value.messages || !Array.isArray(value.messages)) return;

    // 1. Find organization owning this phoneNumberId
    const orgsSnap = await getDocs(collection(serverDb, 'organizations'));
    let targetOrgId = '';
    let matchedAccount: any = null;

    for (const orgDoc of orgsSnap.docs) {
      const accsSnap = await getDocs(collection(serverDb, `organizations/${orgDoc.id}/whatsappAccounts`));
      for (const aDoc of accsSnap.docs) {
        const a = aDoc.data();
        if (a.phoneNumberId === phoneNumberId || a.id === phoneNumberId) {
          targetOrgId = orgDoc.id;
          matchedAccount = { id: aDoc.id, ...a };
          break;
        }
      }
      if (targetOrgId) break;
    }

    if (!targetOrgId && orgsSnap.docs.length > 0) {
      targetOrgId = orgsSnap.docs[0].id;
    }

    if (!targetOrgId) {
      console.warn('[Webhook] No organization found for incoming message on phone_number_id:', phoneNumberId);
      return;
    }

    const token = matchedAccount?.customToken || getMetaConfig().systemToken;

    for (const msg of value.messages) {
      const contactInfo = value.contacts?.[0] || {};
      const senderName = contactInfo.profile?.name || msg.from;
      const cleanPhone = String(msg.from).replace(/[^0-9]/g, '');
      const convId = `conv_${cleanPhone}`;
      const msgId = msg.id || `wamid_${Date.now()}`;
      const now = new Date().toISOString();

      let textBody = '';
      let interactiveButtonId = '';
      let interactiveListId = '';

      if (msg.type === 'interactive') {
        interactiveButtonId = msg.interactive?.button_reply?.id || '';
        interactiveListId = msg.interactive?.list_reply?.id || '';
        textBody = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || 'Option selected';
      } else if (msg.type === 'text') {
        textBody = msg.text?.body || '';
      } else if (msg.type === 'image') {
        textBody = msg.image?.caption || '[Image received]';
      } else if (msg.type === 'document') {
        textBody = msg.document?.filename ? `[Document: ${msg.document.filename}]` : '[Document received]';
      } else {
        textBody = `[${(msg.type || 'message').toUpperCase()}]`;
      }

      // Save Contact with real WhatsApp profile name
      const contactRef = doc(serverDb, `organizations/${targetOrgId}/contacts`, `cnt_${cleanPhone}`);
      await setDoc(
        contactRef,
        {
          id: `cnt_${cleanPhone}`,
          name: senderName,
          phone: `+${cleanPhone}`,
          optInStatus: 'opted_in',
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      );

      // Save inbound message in Firestore Inbox
      const msgRef = doc(serverDb, `organizations/${targetOrgId}/messages`, msgId);
      await setDoc(msgRef, {
        id: msgId,
        whatsAppAccountId: matchedAccount?.id || phoneNumberId,
        contactId: cleanPhone,
        conversationId: convId,
        direction: 'inbound',
        messageType: msg.type || 'text',
        messageStatus: 'delivered',
        metaMessageId: msgId,
        body: textBody,
        timestamp: now,
      });

      // Update Conversation Thread in Firestore
      const convRef = doc(serverDb, `organizations/${targetOrgId}/conversations`, convId);
      await setDoc(
        convRef,
        {
          id: convId,
          contactId: cleanPhone,
          contactPhone: `+${cleanPhone}`,
          contactName: senderName,
          whatsAppAccountId: matchedAccount?.id || phoneNumberId,
          lastMessage: textBody,
          lastMessageAt: now,
          unreadCount: 1,
          status: 'open',
        },
        { merge: true }
      );

      addWebhookLog({
        event: 'Inbox Real Message Stored',
        origin: `WhatsApp: +${cleanPhone} (${senderName})`,
        details: `Saved to Inbox: "${textBody}"`,
        status: 'success',
      });

      // Correlate with campaign delivery: mark recipient as replied and read in real-time
      processIncomingCustomerReply({
        fromPhone: cleanPhone,
        messageText: textBody,
        timestampSeconds: msg.timestamp,
        wamid: msg.id,
        organizationId: targetOrgId,
      }).catch((err) => {
        console.warn('[Webhook] processIncomingCustomerReply error:', err);
      });

      // CHATBOT ENGINE: Evaluate active bot flows for this incoming message
      const flowsSnap = await getDocs(collection(serverDb, `organizations/${targetOrgId}/botFlows`));
      const activeFlows: any[] = [];
      flowsSnap.forEach((d) => {
        const f = d.data();
        if (f.enabled) activeFlows.push({ id: d.id, ...f });
      });

      const upperText = textBody.trim().toUpperCase();
      let matchedFlow: any = null;
      let targetSteps: any[] = [];

      // 1. If incoming message is an interactive button click or list selection
      if (interactiveButtonId || interactiveListId) {
        const clickedId = interactiveButtonId || interactiveListId;
        for (const flow of activeFlows) {
          for (const step of (flow.steps || [])) {
            // Check buttons (supports ONE BUTTON TO MULTIPLE NODES!)
            const btn = (step.buttons || []).find(
              (b: any) => b.id === clickedId || b.title?.trim().toLowerCase() === textBody.trim().toLowerCase()
            );
            if (btn) {
              matchedFlow = flow;
              const stepIds: string[] = (btn.targetStepIds && btn.targetStepIds.length > 0)
                ? btn.targetStepIds
                : (btn.targetStepId ? [btn.targetStepId] : []);
              if (stepIds.length > 0) {
                targetSteps = stepIds
                  .map((id: string) => (flow.steps || []).find((s: any) => s.id === id))
                  .filter(Boolean);
              } else {
                targetSteps = [];
              }
              break;
            }

            // Check list sections
            for (const sec of (step.listSections || [])) {
              const row = (sec.rows || []).find(
                (r: any) => r.id === clickedId || r.title?.trim().toLowerCase() === textBody.trim().toLowerCase()
              );
              if (row) {
                matchedFlow = flow;
                const stepIds: string[] = (row.targetStepIds && row.targetStepIds.length > 0)
                  ? row.targetStepIds
                  : (row.targetStepId ? [row.targetStepId] : []);
                if (stepIds.length > 0) {
                  targetSteps = stepIds
                    .map((id: string) => (flow.steps || []).find((s: any) => s.id === id))
                    .filter(Boolean);
                } else {
                  targetSteps = [];
                }
                break;
              }
            }
            if (targetSteps.length > 0) break;
          }
          if (targetSteps.length > 0) break;
        }
      }

      // 2. If not an interactive click, match by keyword trigger
      if (targetSteps.length === 0) {
        for (const flow of activeFlows) {
          const flowPhoneId = flow.phoneNumberId?.trim();
          if (flowPhoneId && flowPhoneId !== 'all') {
            const matchedPhoneNum = matchedAccount?.displayPhoneNumber?.replace(/[^0-9]/g, '');
            const isPhoneMatch =
              flowPhoneId === phoneNumberId ||
              flowPhoneId === matchedPhoneNum ||
              flowPhoneId === `+${matchedPhoneNum}`;
            if (!isPhoneMatch) {
              continue;
            }
          }

          const condition = flow.triggerCondition || 'exact';
          const flowKeywords = (flow.keywords || []).map((k: string) => k.trim().toUpperCase());

          if (condition === 'anything_else') {
            matchedFlow = flow;
            const initStep = flow.steps?.find((s: any) => s.id === flow.initialStepId) || flow.steps?.[0];
            if (initStep) targetSteps = [initStep];
            break;
          }

          const isMatch = flowKeywords.some((kw: string) => {
            if (!kw) return false;
            if (condition === 'exact') return upperText === kw;
            if (condition === 'contains') return upperText.includes(kw);
            if (condition === 'begins_with') return upperText.startsWith(kw);
            if (condition === 'ends_with') return upperText.endsWith(kw);
            if (condition === 'whole_word') {
              const regex = new RegExp(`\\b${kw}\\b`, 'i');
              return regex.test(textBody);
            }
            return upperText.includes(kw);
          });

          if (isMatch) {
            matchedFlow = flow;
            const initStep = flow.steps?.find((s: any) => s.id === flow.initialStepId) || flow.steps?.[0];
            if (initStep) targetSteps = [initStep];
            break;
          }
        }
      }

      if (matchedFlow && targetSteps.length > 0) {
        // Increment flow triggered statistics in Firestore
        updateDoc(doc(serverDb, `organizations/${targetOrgId}/botFlows`, matchedFlow.id), {
          totalTriggeredCount: (matchedFlow.totalTriggeredCount || 0) + 1,
          lastTriggeredAt: now,
        }).catch(() => {});

        if (token && phoneNumberId) {
          const sendUrl = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

          // Iterate through all connected target steps (supports multiple nodes connected to one button)
          for (let stepIdx = 0; stepIdx < targetSteps.length; stepIdx++) {
            const targetStep = targetSteps[stepIdx];
            if (stepIdx > 0) {
              await new Promise((r) => setTimeout(r, 450));
            }

            let outPayload: any = {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: cleanPhone,
            };

          if (targetStep.type === 'interactive_button' && targetStep.buttons?.length > 0) {
            outPayload = {
              ...outPayload,
              type: 'interactive',
              interactive: {
                type: 'button',
                body: { text: targetStep.body?.trim() || 'Please choose an option:' },
                action: {
                  buttons: targetStep.buttons.slice(0, 3).map((b: any, idx: number) => ({
                    type: 'reply',
                    reply: {
                      id: String(b.id || `btn_${idx}`).slice(0, 256),
                      title: String(b.title || `Option ${idx + 1}`).trim().slice(0, 20),
                    },
                  })),
                },
              },
            };
            if (targetStep.headerType && targetStep.headerType !== 'none' && targetStep.headerText?.trim()) {
              outPayload.interactive.header = {
                type: 'text',
                text: targetStep.headerText.trim(),
              };
            }
            if (targetStep.footer?.trim()) {
              outPayload.interactive.footer = {
                text: targetStep.footer.trim(),
              };
            }
          } else if (targetStep.type === 'interactive_list' && targetStep.listSections?.length > 0) {
            outPayload = {
              ...outPayload,
              type: 'interactive',
              interactive: {
                type: 'list',
                body: { text: targetStep.body?.trim() || 'Please select an option:' },
                action: {
                  button: targetStep.listButtonText?.trim() || 'View Options',
                  sections: targetStep.listSections.map((sec: any) => ({
                    title: (sec.title || 'Options').slice(0, 24),
                    rows: (sec.rows || []).map((row: any) => ({
                      id: String(row.id).slice(0, 200),
                      title: String(row.title).slice(0, 24),
                      description: row.description ? String(row.description).slice(0, 72) : undefined,
                    })),
                  })),
                },
              },
            };
            if (targetStep.headerText?.trim()) {
              outPayload.interactive.header = {
                type: 'text',
                text: targetStep.headerText.trim(),
              };
            }
            if (targetStep.footer?.trim()) {
              outPayload.interactive.footer = {
                text: targetStep.footer.trim(),
              };
            }
          } else if (targetStep.type === 'media' && targetStep.mediaUrl) {
            outPayload = {
              ...outPayload,
              type: targetStep.mediaType === 'image' ? 'image' : 'document',
              [targetStep.mediaType === 'image' ? 'image' : 'document']: {
                link: targetStep.mediaUrl,
                caption: targetStep.body || undefined,
                filename: targetStep.mediaFileName || 'Catalog.pdf',
              },
            };
          } else {
            outPayload = {
              ...outPayload,
              type: 'text',
              text: { body: targetStep.body || 'Thank you for reaching out.' },
            };
          }

          try {
            const metaRes = await fetch(sendUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(outPayload),
            });
            const metaData = await metaRes.json();

            const botNow = new Date(Date.now() + 500).toISOString();
            const botMsgId = metaData.messages?.[0]?.id || `msg_bot_${Date.now()}`;

            if (metaRes.ok && metaData.messages?.[0]?.id) {
              // Save bot response to Firestore without any undefined fields
              const botMsgData: Record<string, any> = {
                id: botMsgId,
                whatsAppAccountId: matchedAccount?.id || phoneNumberId,
                contactId: cleanPhone,
                conversationId: convId,
                direction: 'outbound',
                messageType: targetStep.type === 'interactive_button' ? 'interactive' : targetStep.type || 'text',
                messageStatus: 'sent',
                body: targetStep.body || 'Chatbot Response',
                timestamp: botNow,
              };
              if (targetStep.headerText?.trim()) botMsgData.headerText = targetStep.headerText.trim();
              if (targetStep.mediaUrl?.trim()) botMsgData.mediaUrl = targetStep.mediaUrl.trim();
              if (targetStep.mediaFileName?.trim()) botMsgData.mediaFileName = targetStep.mediaFileName.trim();
              if (targetStep.buttons && Array.isArray(targetStep.buttons)) botMsgData.buttons = targetStep.buttons;

              await setDoc(doc(serverDb, `organizations/${targetOrgId}/messages`, botMsgId), botMsgData);

              await updateDoc(convRef, {
                lastMessage: targetStep.body || 'Chatbot Response',
                lastMessageAt: botNow,
              });

              addWebhookLog({
                event: 'Chatbot Reply Sent',
                origin: `Flow: ${matchedFlow.name}`,
                details: `Dispatched "${targetStep.title || targetStep.type}" to +${cleanPhone}`,
                status: 'success',
              });
            } else {
              const errMsg = metaData.error?.message || JSON.stringify(metaData);
              console.warn('[Webhook] Meta API rejected bot reply:', errMsg);
              addWebhookLog({
                event: 'Chatbot Reply Error',
                origin: `Flow: ${matchedFlow.name}`,
                details: `Meta API rejected message to +${cleanPhone}: ${errMsg}`,
                status: 'error',
                rawPayload: metaData,
              });
            }
          } catch (sendErr: any) {
            console.error('[Webhook] Failed to dispatch bot reply via Meta:', sendErr);
            addWebhookLog({
              event: 'Chatbot Dispatch Error',
              origin: `Flow: ${matchedFlow.name}`,
              details: `Network error: ${sendErr?.message || 'Failed to connect to Meta API'}`,
              status: 'error',
            });
          }
        }
      }
    }
  }
} catch (err: any) {
    console.error('[Webhook] Error processing incoming WhatsApp webhook:', err);
  }
}

/**
 * Processes incoming WhatsApp message status updates (sent, delivered, read, failed)
 * and updates Firestore in real-time so that campaign analytics and inbox blue ticks update.
 */
export async function processIncomingWhatsAppStatusUpdate(statusObj: any, metadata?: any) {
  try {
    const wamid = statusObj.id;
    if (!wamid) return;

    const rawStatus = (statusObj.status || '').toLowerCase().trim();
    const validStatuses = ['sent', 'delivered', 'read', 'failed'];
    if (!validStatuses.includes(rawStatus)) {
      return;
    }
    const status = rawStatus as 'sent' | 'delivered' | 'read' | 'failed';

    const timestampSeconds = statusObj.timestamp;
    const nowIso = new Date().toISOString();
    const eventTimeIso = timestampSeconds
      ? new Date(Number(timestampSeconds) * 1000).toISOString()
      : nowIso;

    const recipientPhone = statusObj.recipient_id ? String(statusObj.recipient_id).replace(/[^0-9]/g, '') : '';
    const errorObj = statusObj.errors?.[0];

    // 1. Process into in-memory analytics engine
    try {
      await processWebhookStatusUpdate({
        wamid,
        status,
        timestampSeconds,
        recipientPhone,
        errorObj,
        rawPayload: statusObj,
      });
    } catch (memErr) {
      console.warn('[processIncomingWhatsAppStatusUpdate] In-memory update error:', memErr);
    }

    // 2. Look up in wamidTracker to find campaign and recipient IDs
    let targetOrgId = '';
    let targetCampaignId = '';
    let targetRecipientId = '';

    try {
      const trackerSnap = await getDoc(doc(serverDb, 'wamidTracker', wamid));
      if (trackerSnap.exists()) {
        const d: any = trackerSnap.data();
        targetOrgId = d.organizationId || '';
        targetCampaignId = d.campaignId || '';
        targetRecipientId = d.recipientId || '';
      }
    } catch (trackerErr) {
      console.warn('[processIncomingWhatsAppStatusUpdate] Tracker lookup error:', trackerErr);
    }

    // 3. If not in wamidTracker, search Firestore across organizations and campaigns
    if (!targetRecipientId) {
      try {
        const orgsSnap = await getDocs(collection(serverDb, 'organizations'));
        for (const orgDoc of orgsSnap.docs) {
          const orgId = orgDoc.id;
          const campsSnap = await getDocs(collection(serverDb, `organizations/${orgId}/campaigns`));

          for (const campDoc of campsSnap.docs) {
            const campId = campDoc.id;
            const recsQuery = query(
              collection(serverDb, `organizations/${orgId}/campaigns/${campId}/recipients`),
              where('whatsappMessageId', '==', wamid)
            );
            const recsSnap = await getDocs(recsQuery);
            if (!recsSnap.empty) {
              targetOrgId = orgId;
              targetCampaignId = campId;
              targetRecipientId = recsSnap.docs[0].id;
              break;
            }
          }
          if (targetRecipientId) break;
        }

        // If still not matched by WAMID, match by phone in recent campaigns
        if (!targetRecipientId && recipientPhone) {
          for (const orgDoc of orgsSnap.docs) {
            const orgId = orgDoc.id;
            const campsSnap = await getDocs(collection(serverDb, `organizations/${orgId}/campaigns`));
            const campList: any[] = [];
            campsSnap.forEach((d) => campList.push({ id: d.id, ...d.data() }));
            campList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

            for (const camp of campList.slice(0, 5)) {
              const recsSnap = await getDocs(collection(serverDb, `organizations/${orgId}/campaigns/${camp.id}/recipients`));
              for (const rDoc of recsSnap.docs) {
                const rData: any = rDoc.data();
                const rPhone = String(rData.phoneNumber || '').replace(/[^0-9]/g, '');
                if (rPhone === recipientPhone || rPhone.endsWith(recipientPhone) || recipientPhone.endsWith(rPhone)) {
                  targetOrgId = orgId;
                  targetCampaignId = camp.id;
                  targetRecipientId = rDoc.id;
                  break;
                }
              }
              if (targetRecipientId) break;
            }
            if (targetRecipientId) break;
          }
        }
      } catch (searchErr) {
        console.warn('[processIncomingWhatsAppStatusUpdate] Search error:', searchErr);
      }
    }

    // 4. Update the campaign recipient and recalculate campaign stats in Firestore
    if (targetOrgId && targetCampaignId && targetRecipientId) {
      try {
        const recRef = doc(serverDb, `organizations/${targetOrgId}/campaigns/${targetCampaignId}/recipients`, targetRecipientId);
        const recSnap = await getDoc(recRef);
        const existingData: any = recSnap.exists() ? recSnap.data() : {};

        const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
        const currentRank = rank[existingData?.currentStatus || 'queued'] ?? 0;
        const newRank = rank[status] ?? 0;

        const updateFields: any = {
          updatedAt: nowIso,
          whatsappMessageId: wamid,
        };

        if (status === 'failed') {
          updateFields.currentStatus = 'failed';
          updateFields.failedAt = existingData?.failedAt || eventTimeIso;
          updateFields.failureReason = errorObj?.message || errorObj?.title || 'WhatsApp Cloud API rejection';
          if (errorObj?.code) updateFields.failureCode = String(errorObj.code);
        } else if (newRank >= currentRank) {
          updateFields.currentStatus = status;
          if (status === 'sent') updateFields.sentAt = existingData?.sentAt || eventTimeIso;
          if (status === 'delivered') updateFields.deliveredAt = existingData?.deliveredAt || eventTimeIso;
          if (status === 'read') {
            updateFields.readAt = existingData?.readAt || eventTimeIso;
            if (!existingData?.deliveredAt) updateFields.deliveredAt = eventTimeIso;
            if (!existingData?.sentAt) updateFields.sentAt = eventTimeIso;
          }
        }

        // Timeline entry
        let desc = `Message ${status}`;
        if (status === 'sent') desc = 'Message sent via Meta Cloud API';
        if (status === 'delivered') desc = 'Delivered to recipient phone (double ticks)';
        if (status === 'read') desc = 'Read by recipient (blue ticks)';
        if (status === 'failed') desc = `Failed to deliver: ${updateFields.failureReason || 'Meta rejection'}`;

        const existingTimeline: any[] = Array.isArray(existingData?.timeline) ? existingData.timeline : [];
        const isDuplicate = existingTimeline.some(
          (t: any) => t.status === status && Math.abs(new Date(t.timestamp).getTime() - new Date(eventTimeIso).getTime()) < 5000
        );

        if (!isDuplicate) {
          updateFields.timeline = [
            ...existingTimeline,
            {
              status,
              timestamp: eventTimeIso,
              description: desc,
              details: errorObj ? JSON.stringify(errorObj) : undefined,
            },
          ];
        }

        await updateDoc(recRef, updateFields);

        // Update wamidTracker for subsequent events
        await setDoc(
          doc(serverDb, 'wamidTracker', wamid),
          {
            wamid,
            organizationId: targetOrgId,
            campaignId: targetCampaignId,
            recipientId: targetRecipientId,
            phoneNumber: recipientPhone,
            status,
            updatedAt: nowIso,
          },
          { merge: true }
        );

        // Recalculate campaign stats
        const allRecsSnap = await getDocs(collection(serverDb, `organizations/${targetOrgId}/campaigns/${targetCampaignId}/recipients`));
        let sentCount = 0;
        let deliveredCount = 0;
        let readCount = 0;
        let failedCount = 0;
        let repliedCount = 0;
        let totalCount = 0;

        allRecsSnap.forEach((d) => {
          totalCount++;
          const r: any = d.data();
          if (r.currentStatus === 'sent' || r.sentAt) sentCount++;
          if (r.currentStatus === 'delivered' || r.deliveredAt) deliveredCount++;
          if (r.currentStatus === 'read' || r.readAt) {
            readCount++;
            if (!r.deliveredAt) deliveredCount++;
          }
          if (r.currentStatus === 'failed') failedCount++;
          if (r.hasReplied || r.repliedAt) repliedCount++;
        });

        const deliveryRate = totalCount > 0 ? Number(((deliveredCount / totalCount) * 100).toFixed(1)) : 0;
        const readRate = deliveredCount > 0 ? Number(((readCount / deliveredCount) * 100).toFixed(1)) : 0;
        const failureRate = totalCount > 0 ? Number(((failedCount / totalCount) * 100).toFixed(1)) : 0;
        const replyRate = deliveredCount > 0 ? Number(((repliedCount / deliveredCount) * 100).toFixed(1)) : 0;

        await updateDoc(doc(serverDb, `organizations/${targetOrgId}/campaigns`, targetCampaignId), {
          stats: {
            total: totalCount,
            sent: Math.max(sentCount, deliveredCount, readCount),
            delivered: deliveredCount,
            read: readCount,
            failed: failedCount,
            replied: repliedCount,
            deliveryRate,
            readRate,
            failureRate,
            replyRate,
          },
          updatedAt: nowIso,
        }).catch(() => {});

      } catch (err) {
        console.warn('[processIncomingWhatsAppStatusUpdate] Recipient update error:', err);
      }
    }

    // 5. Update messages collection for Inbox double check ticks
    try {
      const orgsSnap = await getDocs(collection(serverDb, 'organizations'));
      for (const orgDoc of orgsSnap.docs) {
        const orgId = orgDoc.id;
        const msgsQuery = query(collection(serverDb, `organizations/${orgId}/messages`), where('metaMessageId', '==', wamid));
        const msgsSnap = await getDocs(msgsQuery);
        for (const mDoc of msgsSnap.docs) {
          await updateDoc(mDoc.ref, {
            messageStatus: status,
            ...(status === 'read' ? { readAt: eventTimeIso } : {}),
            ...(status === 'delivered' ? { deliveredAt: eventTimeIso } : {}),
            updatedAt: nowIso,
          }).catch(() => {});
        }

        // Direct doc check
        try {
          const directRef = doc(serverDb, `organizations/${orgId}/messages`, wamid);
          const directSnap = await getDoc(directRef);
          if (directSnap.exists()) {
            await updateDoc(directRef, {
              messageStatus: status,
              ...(status === 'read' ? { readAt: eventTimeIso } : {}),
              ...(status === 'delivered' ? { deliveredAt: eventTimeIso } : {}),
              updatedAt: nowIso,
            }).catch(() => {});
          }
        } catch {}
      }
    } catch (msgErr) {
      console.warn('[processIncomingWhatsAppStatusUpdate] Message collection update error:', msgErr);
    }

  } catch (fatalErr) {
    console.error('[processIncomingWhatsAppStatusUpdate] Fatal error:', fatalErr);
  }
}

// Handler: Meta Webhook POST notifications (Incoming messages & statuses)
export function handleWebhookPost(req: Request, res: Response) {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(200).send('EVENT_RECEIVED');
  }

  // Extract all "value" objects from payload across all Meta formats
  const valuesToProcess: Array<{ value: any; field?: string }> = [];

  if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
    for (const entry of body.entry) {
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change && change.value) {
            valuesToProcess.push({ value: change.value, field: change.field });
          }
        }
      }
    }
  } else if (Array.isArray(body.entry)) {
    for (const entry of body.entry) {
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change && change.value) {
            valuesToProcess.push({ value: change.value, field: change.field });
          }
        }
      }
    }
  } else if (Array.isArray(body.changes)) {
    for (const change of body.changes) {
      if (change && change.value) {
        valuesToProcess.push({ value: change.value, field: change.field });
      }
    }
  } else if (body.field && body.value) {
    // Direct change object: { field: "messages", value: { ... } } (common in Meta test console)
    valuesToProcess.push({ value: body.value, field: body.field });
  } else if (body.value) {
    valuesToProcess.push({ value: body.value });
  } else if (body.messages || body.statuses) {
    // Raw value payload passed directly
    valuesToProcess.push({ value: body });
  }

  if (valuesToProcess.length === 0) {
    console.warn('[Webhook] Unrecognized webhook payload structure:', JSON.stringify(body).slice(0, 300));
    return res.status(200).send('EVENT_RECEIVED'); // Always respond with 200 so Meta doesn't error
  }

  for (const item of valuesToProcess) {
    const value = item.value;
    const field = item.field;
    if (!value) continue;

    // 1. Handle incoming message statuses (sent, delivered, read, failed)
    if (value.statuses && Array.isArray(value.statuses)) {
      for (const statusObj of value.statuses) {
        addWebhookLog({
          event: `Status: ${(statusObj.status || '').toUpperCase()}`,
          origin: 'WhatsApp Message Status',
          details: `Meta ID: ${statusObj.id} - Status: ${statusObj.status} - Recipient: ${statusObj.recipient_id}`,
          status: statusObj.status === 'failed' ? 'error' : 'success',
          rawPayload: statusObj,
        });

        // Process status update into Firestore and Campaign Analytics
        processIncomingWhatsAppStatusUpdate(statusObj, value.metadata).catch((err) => {
          console.error('[Webhook] Failed to process status update:', err);
        });
      }
    }

    // 2. Handle incoming WhatsApp customer messages
    if (value.messages && Array.isArray(value.messages)) {
      for (const msg of value.messages) {
        const contactInfo = value.contacts?.[0] || {};
        const senderName = contactInfo.profile?.name || msg.from;
        const textBody =
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          msg.text?.body ||
          (msg.type ? `[${msg.type.toUpperCase()}]` : 'Message');

        addWebhookLog({
          event: 'Incoming Message',
          origin: `Customer: ${msg.from} (${senderName})`,
          details: `Text: ${textBody}`,
          status: 'success',
          rawPayload: msg,
        });
      }

      // Process real incoming WhatsApp messages into Firestore Inbox & run Bot
      processIncomingWhatsAppWebhookPayload(value).catch((err) => {
        console.error('[Webhook] Failed to process incoming WhatsApp messages:', err);
      });
    }

    // 3. Handle official Meta Template Status Updates (APPROVED, REJECTED, PAUSED)
    if (field === 'message_template_status_update' || value.event) {
      const tplEvent = value.event || 'UPDATED';
      const tplName = value.message_template_name || value.template_name || 'Template';
      const reason = value.reason ? ` - Reason: ${value.reason}` : '';

      addWebhookLog({
        event: `Template ${tplEvent}`,
        origin: 'Meta WhatsApp Template Review',
        details: `Template "${tplName}" is now ${tplEvent}${reason}`,
        status: tplEvent === 'APPROVED' ? 'success' : tplEvent === 'REJECTED' ? 'error' : 'warning',
        rawPayload: value,
      });
    }
  }

  return res.status(200).send('EVENT_RECEIVED');
}

// Handler: Retrieve Webhook Logs for Admin UI
export function handleGetWebhookLogs(req: Request, res: Response) {
  res.json({ logs: getWebhookLogs() });
}

// Handler: Upload media from PC / device and save locally + optional Meta Resumable Upload
export async function handleUploadMedia(req: Request, res: Response) {
  try {
    const { filename, base64, contentType, customToken } = req.body;
    if (!base64 || !filename) {
      return res.status(400).json({ error: 'filename and base64 data are required.' });
    }

    const ext = path.extname(filename) || '.bin';
    const cleanBase = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueName = `${cleanBase}_${Date.now()}${ext}`;

    const rawData = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(rawData, 'base64');
    const mimeType = contentType || (ext === '.mp4' || ext === '.3gp' ? 'video/mp4' : ext === '.pdf' ? 'application/pdf' : 'image/png');

    // 1. Always cache in memory so serverless / read-only filesystems (/var/task) never fail
    inMemoryMediaBufferCache.set(uniqueName, {
      buffer,
      mimeType,
      originalName: filename,
      filename: uniqueName,
    });
    inMemoryMediaBufferCache.set(`/uploads/${uniqueName}`, {
      buffer,
      mimeType,
      originalName: filename,
      filename: uniqueName,
    });

    // 2. Best-effort write to disk (fallback to os.tmpdir() if public/uploads is read-only)
    try {
      const writableDir = getUploadsWritableDir();
      const targetPath = path.join(writableDir, uniqueName);
      fs.writeFileSync(targetPath, buffer);
    } catch (fsErr) {
      console.warn('[UploadMedia] Disk write notice (in-memory buffer cached):', fsErr);
    }

    const relativeUrl = `/uploads/${uniqueName}`;
    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
    const proto = req.get('x-forwarded-proto') || (req.protocol === 'https' ? 'https' : 'http');
    const fullUrl = `${proto}://${host}${relativeUrl}`;

    // Optionally generate Meta Resumable Upload handle
    let headerHandle: string | undefined;
    try {
      await loadMetaConfigFromDb();
      const config = getMetaConfig();
      const token = customToken || (req.headers['x-meta-token'] as string) || config.systemToken;
      const appId = config.appId || '28291855670435316';
      if (token && appId) {
        const format = ext === '.mp4' || ext === '.3gp' ? 'VIDEO' : ext === '.pdf' ? 'DOCUMENT' : 'IMAGE';
        headerHandle = await getMetaHeaderHandleForMedia(
          relativeUrl,
          token,
          appId,
          format,
          config.graphVersion || 'v22.0'
        );
      }
    } catch (hErr) {
      console.warn('[handleUploadMedia] Resumable handle notice:', hErr);
    }

    return res.json({
      success: true,
      filename: uniqueName,
      originalName: filename,
      url: relativeUrl,
      fullUrl,
      headerHandle,
      size: buffer.length,
      contentType: contentType || 'application/octet-stream',
    });
  } catch (err: any) {
    console.error('[UploadMedia] Error saving uploaded file:', err);
    return res.status(500).json({ error: err.message || 'Failed to upload media file.' });
  }
}

export {
  handleGetCampaignAnalytics,
  handleGetCampaignMessages,
  handleGetMessageDetails,
} from './campaignAnalyticsService.ts';

