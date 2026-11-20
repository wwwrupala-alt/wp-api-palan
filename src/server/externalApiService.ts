import type { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import {
  serverDb,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
} from './serverDb.ts';
import {
  getMetaConfig,
  getEffectiveMetaConfig,
  addWebhookLog,
  cleanFirestoreData,
} from './metaService.ts';
import { resolveMetaMediaObject } from './metaMediaManager.ts';

export interface ExternalApiKeyRecord {
  apiKey: string;
  organizationId: string;
  defaultPhoneNumberId?: string;
  enabled: boolean;
  label?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface ExternalApiLogRecord {
  id: string;
  organizationId: string;
  whatsAppAccountId?: string;
  phoneNumberId?: string;
  to: string;
  cleanPhone: string;
  name?: string;
  message?: string;
  mediaUrl?: string;
  mediaType?: string | null;
  caption?: string;
  source: string;
  status: 'sent' | 'failed';
  messageId?: string | null;
  error?: string | null;
  timestamp: string;
}

const externalKeyCache = new Map<string, ExternalApiKeyRecord>();

function generateApiKey(): string {
  return `cw_live_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Normalizes Indian & international phone numbers cleanly into WhatsApp Cloud API format (digits with country code, no "+").
 * Handles:
 * - "+919876543210" -> "919876543210"
 * - "+91 98765-43210" -> "919876543210"
 * - "919876543210" -> "919876543210"
 * - "09876543210" -> "919876543210"
 * - "9876543210" -> "919876543210"
 * - "+1 (415) 555-2671" -> "14155552671"
 */
export function normalizeWhatsAppPhone(input: unknown): {
  valid: boolean;
  phone: string;
  e164: string;
  error?: string;
} {
  if (input === null || input === undefined) {
    return { valid: false, phone: '', e164: '', error: 'Recipient phone number ("to") is required.' };
  }

  let raw = String(input).trim();
  if (!raw) {
    return { valid: false, phone: '', e164: '', error: 'Recipient phone number ("to") is required.' };
  }

  // Keep only digits
  let digits = raw.replace(/[^0-9]/g, '');

  // Handle "00" international dialing prefix (e.g., 00919876543210)
  if (digits.startsWith('00') && digits.length > 10) {
    digits = digits.slice(2);
  }

  // Handle 11-digit Indian number starting with 0 (e.g., 09876543210)
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    digits = `91${digits.slice(1)}`;
  }

  // Handle 10-digit Indian mobile number without country code (e.g., 9876543210)
  if (digits.length === 10) {
    digits = `91${digits}`;
  }

  // Validate final WhatsApp E.164 digit length (11 to 15 digits)
  if (digits.length < 11 || digits.length > 15) {
    return {
      valid: false,
      phone: '',
      e164: '',
      error: `Invalid phone number format "${raw}". Provide a 10-digit Indian number or E.164 number with country code.`,
    };
  }

  return {
    valid: true,
    phone: digits,
    e164: `+${digits}`,
  };
}

function extractApiKeyFromRequest(req: Request): string {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  if (Array.isArray(headerKey) && headerKey[0]?.trim()) {
    return headerKey[0].trim();
  }

  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string') {
    const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
  }

  return '';
}

function resolveOrgIdFromManagementRequest(req: Request): string {
  return (
    (req.headers['x-organization-id'] as string) ||
    (req.query.organizationId as string) ||
    (req.body?.organizationId as string) ||
    ''
  ).trim();
}

async function resolveKeyRecord(apiKey: string): Promise<ExternalApiKeyRecord | null> {
  if (!apiKey) return null;

  const cached = externalKeyCache.get(apiKey);
  if (cached) return cached;

  try {
    const snap = await getDoc(doc(serverDb, 'externalApiKeys', apiKey));
    if (snap.exists()) {
      const data = snap.data() as ExternalApiKeyRecord;
      externalKeyCache.set(apiKey, data);
      return data;
    }
  } catch (err) {
    console.warn('[ExternalAPI] Failed to lookup API key in Firestore:', err);
  }

  return null;
}

async function persistOrgExternalApiConfig(
  organizationId: string,
  record: ExternalApiKeyRecord,
  previousApiKey?: string
) {
  const cleanRecord = cleanFirestoreData(record);

  if (previousApiKey && previousApiKey !== record.apiKey) {
    externalKeyCache.delete(previousApiKey);
    try {
      await deleteDoc(doc(serverDb, 'externalApiKeys', previousApiKey));
    } catch {
      // ignore if previous key doc did not exist
    }
  }

  await setDoc(doc(serverDb, 'externalApiKeys', record.apiKey), cleanRecord, { merge: true });
  await setDoc(
    doc(serverDb, `organizations/${organizationId}/settings`, 'externalApi'),
    cleanRecord,
    { merge: true }
  );

  externalKeyCache.set(record.apiKey, cleanRecord);
}

async function detectMediaTypeFromUrl(
  mediaUrl: string
): Promise<{ mediaType: 'image' | 'video' | 'document' | 'audio'; filename?: string }> {
  let pathname = '';
  try {
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
      pathname = new URL(mediaUrl).pathname;
    } else {
      pathname = mediaUrl.split('?')[0];
    }
  } catch {
    pathname = mediaUrl.split('?')[0];
  }

  const ext = path.extname(pathname).toLowerCase();
  const baseFilename = path.basename(pathname) || undefined;

  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
    return { mediaType: 'image', filename: baseFilename };
  }
  if (['.mp4', '.3gp', '.mov', '.m4v'].includes(ext)) {
    return { mediaType: 'video', filename: baseFilename };
  }
  if (['.mp3', '.ogg', '.aac', '.m4a', '.amr', '.opus'].includes(ext)) {
    return { mediaType: 'audio', filename: baseFilename };
  }
  if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.zip'].includes(ext)) {
    return { mediaType: 'document', filename: baseFilename || 'document.pdf' };
  }

  // If extension is missing (e.g. dynamic CDN/presigned URL), try quick HEAD request to inspect Content-Type
  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const headRes = await fetch(mediaUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);

      const contentType = (headRes.headers.get('content-type') || '').toLowerCase();
      if (contentType.startsWith('image/')) {
        return { mediaType: 'image', filename: baseFilename };
      }
      if (contentType.startsWith('video/')) {
        return { mediaType: 'video', filename: baseFilename };
      }
      if (contentType.startsWith('audio/')) {
        return { mediaType: 'audio', filename: baseFilename };
      }
      if (
        contentType.includes('pdf') ||
        contentType.includes('msword') ||
        contentType.includes('officedocument') ||
        contentType.includes('text/') ||
        contentType.includes('application/octet-stream')
      ) {
        return { mediaType: 'document', filename: baseFilename || 'attachment.pdf' };
      }
    } catch {
      // Ignore HEAD timeout/errors and fall back safely to document
    }
  }

  return { mediaType: 'document', filename: baseFilename || 'attachment.pdf' };
}

async function writeExternalApiLog(organizationId: string, log: ExternalApiLogRecord) {
  try {
    await setDoc(
      doc(serverDb, `organizations/${organizationId}/externalApiLogs`, log.id),
      cleanFirestoreData(log)
    );
  } catch (err) {
    console.warn('[ExternalAPI] Failed to persist externalApiLogs entry:', err);
  }
}

/**
 * GET /api/external-api/config
 * Loads (or initializes) the workspace's External API secret key & configuration for Settings UI.
 */
export async function handleGetExternalApiConfig(req: Request, res: Response) {
  try {
    const organizationId = resolveOrgIdFromManagementRequest(req);
    if (!organizationId) {
      return res.status(400).json({ ok: false, error: 'organizationId is required' });
    }

    const settingsRef = doc(serverDb, `organizations/${organizationId}/settings`, 'externalApi');
    const settingsSnap = await getDoc(settingsRef);
    const nowIso = new Date().toISOString();

    let configRecord: ExternalApiKeyRecord;
    if (settingsSnap.exists() && settingsSnap.data()?.apiKey) {
      const d = settingsSnap.data() as ExternalApiKeyRecord;
      configRecord = {
        apiKey: d.apiKey,
        organizationId,
        defaultPhoneNumberId: d.defaultPhoneNumberId || '',
        enabled: d.enabled !== false,
        label: d.label || 'Default Voice AI Key',
        createdAt: d.createdAt || nowIso,
        updatedAt: d.updatedAt || nowIso,
        lastUsedAt: d.lastUsedAt,
      };
      // Ensure lookup collection doc exists as well
      await setDoc(doc(serverDb, 'externalApiKeys', configRecord.apiKey), cleanFirestoreData(configRecord), {
        merge: true,
      });
      externalKeyCache.set(configRecord.apiKey, configRecord);
    } else {
      configRecord = {
        apiKey: generateApiKey(),
        organizationId,
        defaultPhoneNumberId: '',
        enabled: true,
        label: 'Voice AI Integration Key',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await persistOrgExternalApiConfig(organizationId, configRecord);
    }

    return res.json({
      ok: true,
      config: configRecord,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to load External API settings.' });
  }
}

/**
 * POST /api/external-api/config
 * Saves enabled status, defaultPhoneNumberId, or label for the workspace External API key.
 */
export async function handleSaveExternalApiConfig(req: Request, res: Response) {
  try {
    const organizationId = resolveOrgIdFromManagementRequest(req);
    if (!organizationId) {
      return res.status(400).json({ ok: false, error: 'organizationId is required' });
    }

    const { enabled, defaultPhoneNumberId, label } = req.body || {};
    const settingsRef = doc(serverDb, `organizations/${organizationId}/settings`, 'externalApi');
    const settingsSnap = await getDoc(settingsRef);
    const existing = settingsSnap.exists() ? (settingsSnap.data() as Partial<ExternalApiKeyRecord>) : {};
    const nowIso = new Date().toISOString();

    const apiKey = existing.apiKey || generateApiKey();
    const updatedRecord: ExternalApiKeyRecord = {
      apiKey,
      organizationId,
      defaultPhoneNumberId:
        defaultPhoneNumberId !== undefined ? String(defaultPhoneNumberId).trim() : existing.defaultPhoneNumberId || '',
      enabled: enabled !== undefined ? Boolean(enabled) : existing.enabled !== false,
      label: label !== undefined ? String(label).trim() : existing.label || 'Voice AI Integration Key',
      createdAt: existing.createdAt || nowIso,
      updatedAt: nowIso,
      lastUsedAt: existing.lastUsedAt,
    };

    await persistOrgExternalApiConfig(organizationId, updatedRecord);

    return res.json({
      ok: true,
      config: updatedRecord,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to save External API settings.' });
  }
}

/**
 * POST /api/external-api/regenerate
 * Generates a brand-new secret API key and invalidates the previous key.
 */
export async function handleRegenerateExternalApiKey(req: Request, res: Response) {
  try {
    const organizationId = resolveOrgIdFromManagementRequest(req);
    if (!organizationId) {
      return res.status(400).json({ ok: false, error: 'organizationId is required' });
    }

    const settingsRef = doc(serverDb, `organizations/${organizationId}/settings`, 'externalApi');
    const settingsSnap = await getDoc(settingsRef);
    const existing = settingsSnap.exists() ? (settingsSnap.data() as Partial<ExternalApiKeyRecord>) : {};
    const nowIso = new Date().toISOString();

    const newRecord: ExternalApiKeyRecord = {
      apiKey: generateApiKey(),
      organizationId,
      defaultPhoneNumberId: existing.defaultPhoneNumberId || '',
      enabled: existing.enabled !== false,
      label: existing.label || 'Voice AI Integration Key',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await persistOrgExternalApiConfig(organizationId, newRecord, existing.apiKey);

    return res.json({
      ok: true,
      config: newRecord,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to regenerate API key.' });
  }
}

/**
 * GET /api/external-api/logs
 * Returns recent external API message logs for the workspace.
 */
export async function handleGetExternalApiLogs(req: Request, res: Response) {
  try {
    const organizationId = resolveOrgIdFromManagementRequest(req);
    if (!organizationId) {
      return res.status(400).json({ ok: false, error: 'organizationId is required' });
    }

    const snap = await getDocs(collection(serverDb, `organizations/${organizationId}/externalApiLogs`));
    const logs: ExternalApiLogRecord[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 100);

    return res.json({
      ok: true,
      logs,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch External API logs.' });
  }
}

/**
 * POST /api/whatsapp/send
 * Secure external REST endpoint for AI voice calling servers / webhooks (e.g. vanidesk-voice-ai)
 * to send WhatsApp text messages, links, PDFs, or images in real time.
 */
export async function handleExternalWhatsAppSend(req: Request, res: Response) {
  const nowIso = new Date().toISOString();
  const logId = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    // 1. Authenticate API key via x-api-key or Authorization: Bearer <API_KEY>
    const providedKey = extractApiKeyFromRequest(req);
    if (!providedKey) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized: Missing API key. Pass x-api-key header or Authorization: Bearer <API_KEY>.',
      });
    }

    const keyRecord = await resolveKeyRecord(providedKey);
    if (!keyRecord || !keyRecord.organizationId) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized: Invalid API key.',
      });
    }

    if (keyRecord.enabled === false) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized: External API key is disabled in Settings.',
      });
    }

    const organizationId = keyRecord.organizationId;

    // 2. Parse & validate request body
    const {
      to,
      name,
      message,
      mediaUrl,
      caption,
      source,
      phoneNumberId: requestedPhoneNumberId,
    } = req.body || {};

    const phoneNorm = normalizeWhatsAppPhone(to);
    if (!phoneNorm.valid) {
      return res.status(400).json({
        ok: false,
        error: phoneNorm.error || 'Valid "to" phone number is required.',
      });
    }

    const messageText = typeof message === 'string' ? message.trim() : '';
    const mediaUrlStr = typeof mediaUrl === 'string' ? mediaUrl.trim() : '';
    const captionStr = typeof caption === 'string' ? caption.trim() : '';
    const contactNameStr = typeof name === 'string' ? name.trim() : '';
    const sourceStr = typeof source === 'string' && source.trim() ? source.trim() : 'external-api';

    if (!messageText && !mediaUrlStr) {
      return res.status(400).json({
        ok: false,
        error: 'Either "message" or "mediaUrl" is required.',
      });
    }

    // 3. Validate organization subscription / active status
    if (organizationId !== 'org_master_platform') {
      try {
        const orgSnap = await getDoc(doc(serverDb, 'organizations', organizationId));
        if (orgSnap.exists()) {
          const orgData = orgSnap.data();
          if (orgData.status === 'suspended') {
            await writeExternalApiLog(organizationId, {
              id: logId,
              organizationId,
              to: phoneNorm.e164,
              cleanPhone: phoneNorm.phone,
              name: contactNameStr,
              message: messageText,
              mediaUrl: mediaUrlStr,
              caption: captionStr,
              source: sourceStr,
              status: 'failed',
              error: 'Workspace is suspended.',
              timestamp: nowIso,
            });
            return res.status(400).json({
              ok: false,
              error: 'Workspace is suspended by Master Admin.',
            });
          }
          const expiresAt = orgData.subscription?.expiresAt;
          if (expiresAt && !isNaN(new Date(expiresAt).getTime()) && new Date(expiresAt).getTime() < Date.now()) {
            const errMsg = `Subscription expired on ${new Date(expiresAt).toLocaleDateString()}.`;
            await writeExternalApiLog(organizationId, {
              id: logId,
              organizationId,
              to: phoneNorm.e164,
              cleanPhone: phoneNorm.phone,
              name: contactNameStr,
              message: messageText,
              mediaUrl: mediaUrlStr,
              caption: captionStr,
              source: sourceStr,
              status: 'failed',
              error: errMsg,
              timestamp: nowIso,
            });
            return res.status(400).json({
              ok: false,
              error: errMsg,
            });
          }
        }
      } catch (subErr) {
        console.warn('[ExternalAPI] Org subscription check notice:', subErr);
      }
    }

    // 4. Resolve connected WhatsApp Business number & access token for this organization
    const accountsSnap = await getDocs(collection(serverDb, `organizations/${organizationId}/whatsappAccounts`));
    const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const preferredId =
      (typeof requestedPhoneNumberId === 'string' && requestedPhoneNumberId.trim()) ||
      keyRecord.defaultPhoneNumberId ||
      '';

    let targetAccount: any = null;
    if (preferredId) {
      targetAccount = accounts.find(
        (a) => a.phoneNumberId === preferredId || a.id === preferredId
      );
    }
    if (!targetAccount) {
      targetAccount =
        accounts.find((a) => a.status === 'connected' && (a.phoneNumberId || a.id)) ||
        accounts.find((a) => Boolean(a.phoneNumberId)) ||
        accounts[0] ||
        null;
    }

    const effectiveConfig = await getEffectiveMetaConfig(organizationId);
    const globalConfig = getMetaConfig();
    const graphVersion = effectiveConfig.graphVersion || globalConfig.graphVersion || 'v22.0';

    const targetPhoneNumberId = targetAccount?.phoneNumberId || targetAccount?.id || '';
    const token =
      targetAccount?.customToken ||
      targetAccount?.permanentToken ||
      targetAccount?.userAccessToken ||
      effectiveConfig.systemToken ||
      globalConfig.systemToken ||
      '';

    if (!targetPhoneNumberId || !token) {
      const errMsg = 'No connected WhatsApp Business number or access token is configured for this workspace.';
      await writeExternalApiLog(organizationId, {
        id: logId,
        organizationId,
        to: phoneNorm.e164,
        cleanPhone: phoneNorm.phone,
        name: contactNameStr,
        message: messageText,
        mediaUrl: mediaUrlStr,
        caption: captionStr,
        source: sourceStr,
        status: 'failed',
        error: errMsg,
        timestamp: nowIso,
      });
      return res.status(400).json({ ok: false, error: errMsg });
    }

    // 5. Build WhatsApp Cloud API payload (Media vs Text)
    const sendUrl = `https://graph.facebook.com/${graphVersion}/${targetPhoneNumberId}/messages`;
    const combinedCaption =
      captionStr && messageText && captionStr !== messageText
        ? `${captionStr}\n\n${messageText}`
        : captionStr || messageText || '';

    let detectedMediaType: 'image' | 'video' | 'document' | 'audio' | null = null;
    let payload: Record<string, any> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNorm.phone,
    };

    let usedTextFallbackForMedia = false;

    if (mediaUrlStr) {
      const detected = await detectMediaTypeFromUrl(mediaUrlStr);
      detectedMediaType = detected.mediaType;

      const resolvedMedia = await resolveMetaMediaObject(
        mediaUrlStr,
        targetPhoneNumberId,
        token,
        detected.mediaType,
        graphVersion
      );

      const isUnusableLocalLink =
        !resolvedMedia?.id &&
        (!resolvedMedia?.link ||
          resolvedMedia.link.startsWith('/') ||
          resolvedMedia.link.includes('localhost') ||
          resolvedMedia.link.includes('127.0.0.1'));

      if (!resolvedMedia || isUnusableLocalLink) {
        // Fallback to sending clickable link inside text message if public URL is provided
        if (mediaUrlStr.startsWith('http://') || mediaUrlStr.startsWith('https://')) {
          usedTextFallbackForMedia = true;
          const fallbackBody = combinedCaption
            ? `${combinedCaption}\n\n${mediaUrlStr}`
            : mediaUrlStr;
          payload = {
            ...payload,
            type: 'text',
            text: { preview_url: true, body: fallbackBody },
          };
        } else {
          const errMsg = 'Could not resolve or upload mediaUrl for WhatsApp Cloud API. Provide a valid public HTTPS URL.';
          await writeExternalApiLog(organizationId, {
            id: logId,
            organizationId,
            whatsAppAccountId: targetAccount?.id || targetPhoneNumberId,
            phoneNumberId: targetPhoneNumberId,
            to: phoneNorm.e164,
            cleanPhone: phoneNorm.phone,
            name: contactNameStr,
            message: messageText,
            mediaUrl: mediaUrlStr,
            mediaType: detectedMediaType,
            caption: captionStr,
            source: sourceStr,
            status: 'failed',
            error: errMsg,
            timestamp: nowIso,
          });
          return res.status(400).json({ ok: false, error: errMsg });
        }
      } else {
        const mediaObj: Record<string, any> = resolvedMedia.id
          ? { id: resolvedMedia.id }
          : { link: resolvedMedia.link! };

        if (detected.mediaType === 'document') {
          if (combinedCaption) mediaObj.caption = combinedCaption;
          mediaObj.filename = detected.filename || resolvedMedia.filename || 'document.pdf';
          payload = { ...payload, type: 'document', document: mediaObj };
        } else if (detected.mediaType === 'image') {
          if (combinedCaption) mediaObj.caption = combinedCaption;
          payload = { ...payload, type: 'image', image: mediaObj };
        } else if (detected.mediaType === 'video') {
          if (combinedCaption) mediaObj.caption = combinedCaption;
          payload = { ...payload, type: 'video', video: mediaObj };
        } else if (detected.mediaType === 'audio') {
          // WhatsApp audio payload does not accept caption
          payload = { ...payload, type: 'audio', audio: mediaObj };
        }
      }
    } else {
      payload = {
        ...payload,
        type: 'text',
        text: { preview_url: true, body: messageText },
      };
    }

    // 6. Dispatch via Meta WhatsApp Cloud API
    let sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    let sendData = await sendRes.json();

    // If Meta rejected media attachment URL directly and mediaUrl is an HTTP link, retry once as text link fallback
    if ((!sendRes.ok || sendData.error) && mediaUrlStr && !usedTextFallbackForMedia && (mediaUrlStr.startsWith('http://') || mediaUrlStr.startsWith('https://'))) {
      const fallbackBody = combinedCaption
        ? `${combinedCaption}\n\n${mediaUrlStr}`
        : mediaUrlStr;
      const fallbackPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNorm.phone,
        type: 'text',
        text: { preview_url: true, body: fallbackBody },
      };
      const retryRes = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fallbackPayload),
      });
      const retryData = await retryRes.json();
      if (retryRes.ok && !retryData.error) {
        sendRes = retryRes;
        sendData = retryData;
        usedTextFallbackForMedia = true;
      }
    }

    if (!sendRes.ok || sendData.error) {
      const errorMsg = sendData.error?.message || 'Meta Cloud API rejected the WhatsApp message.';

      await writeExternalApiLog(organizationId, {
        id: logId,
        organizationId,
        whatsAppAccountId: targetAccount?.id || targetPhoneNumberId,
        phoneNumberId: targetPhoneNumberId,
        to: phoneNorm.e164,
        cleanPhone: phoneNorm.phone,
        name: contactNameStr,
        message: messageText,
        mediaUrl: mediaUrlStr,
        mediaType: detectedMediaType,
        caption: captionStr,
        source: sourceStr,
        status: 'failed',
        error: errorMsg,
        timestamp: nowIso,
      });

      addWebhookLog({
        event: 'External API Message Failed',
        origin: sourceStr,
        details: `To: ${phoneNorm.e164} - Error: ${errorMsg}`,
        status: 'error',
        rawPayload: sendData.error,
      });

      return res.status(400).json({
        ok: false,
        error: errorMsg,
      });
    }

    const metaMessageId = sendData.messages?.[0]?.id || `wamid_${Date.now()}`;

    // 7. If audio media was sent AND caller also provided message/caption text, deliver the text right after
    if (detectedMediaType === 'audio' && !usedTextFallbackForMedia && combinedCaption) {
      try {
        await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneNorm.phone,
            type: 'text',
            text: { preview_url: true, body: combinedCaption },
          }),
        });
      } catch {
        // Non-fatal follow-up text
      }
    }

    // 8. Persist logs, Inbox conversation/message, contact & wamidTracker
    const convId = `conv_${phoneNorm.phone}`;
    const displaySummary =
      combinedCaption ||
      (mediaUrlStr ? `[${(detectedMediaType || 'document').toUpperCase()}] ${mediaUrlStr}` : '');

    await writeExternalApiLog(organizationId, {
      id: logId,
      organizationId,
      whatsAppAccountId: targetAccount?.id || targetPhoneNumberId,
      phoneNumberId: targetPhoneNumberId,
      to: phoneNorm.e164,
      cleanPhone: phoneNorm.phone,
      name: contactNameStr,
      message: messageText,
      mediaUrl: mediaUrlStr,
      mediaType: usedTextFallbackForMedia ? 'text' : detectedMediaType,
      caption: captionStr,
      source: sourceStr,
      status: 'sent',
      messageId: metaMessageId,
      timestamp: nowIso,
    });

    try {
      await setDoc(
        doc(serverDb, 'wamidTracker', metaMessageId),
        cleanFirestoreData({
          wamid: metaMessageId,
          organizationId,
          conversationId: convId,
          phoneNumber: phoneNorm.phone,
          status: 'sent',
          source: sourceStr,
          createdAt: nowIso,
          updatedAt: nowIso,
        }),
        { merge: true }
      );
    } catch (trackerErr) {
      console.warn('[ExternalAPI] wamidTracker index warning:', trackerErr);
    }

    try {
      const contactRef = doc(serverDb, `organizations/${organizationId}/contacts`, `cnt_${phoneNorm.phone}`);
      const contactUpdate: Record<string, any> = {
        id: `cnt_${phoneNorm.phone}`,
        phone: phoneNorm.e164,
        optInStatus: 'opted_in',
        updatedAt: nowIso,
      };
      if (contactNameStr) contactUpdate.name = contactNameStr;
      await setDoc(contactRef, cleanFirestoreData(contactUpdate), { merge: true });

      await setDoc(
        doc(serverDb, `organizations/${organizationId}/messages`, metaMessageId),
        cleanFirestoreData({
          id: metaMessageId,
          whatsAppAccountId: targetAccount?.id || targetPhoneNumberId,
          contactId: phoneNorm.phone,
          conversationId: convId,
          direction: 'outbound',
          messageType: usedTextFallbackForMedia ? 'text' : detectedMediaType || 'text',
          messageStatus: 'sent',
          metaMessageId,
          body: displaySummary || mediaUrlStr,
          mediaUrl: mediaUrlStr || undefined,
          source: sourceStr,
          timestamp: nowIso,
        })
      );

      const convUpdate: Record<string, any> = {
        id: convId,
        contactId: phoneNorm.phone,
        contactPhone: phoneNorm.e164,
        whatsAppAccountId: targetAccount?.id || targetPhoneNumberId,
        lastMessage: displaySummary || mediaUrlStr,
        lastMessageAt: nowIso,
        status: 'open',
      };
      if (contactNameStr) convUpdate.contactName = contactNameStr;

      await setDoc(
        doc(serverDb, `organizations/${organizationId}/conversations`, convId),
        cleanFirestoreData(convUpdate),
        { merge: true }
      );
    } catch (inboxErr) {
      console.warn('[ExternalAPI] Inbox sync notice:', inboxErr);
    }

    // Update lastUsedAt timestamp asynchronously
    setDoc(
      doc(serverDb, `organizations/${organizationId}/settings`, 'externalApi'),
      { lastUsedAt: nowIso },
      { merge: true }
    ).catch(() => {});

    addWebhookLog({
      event: 'External API Message Sent',
      origin: sourceStr,
      details: `To: ${phoneNorm.e164}${contactNameStr ? ` (${contactNameStr})` : ''} - ID: ${metaMessageId}`,
      status: 'success',
    });

    return res.status(200).json({
      ok: true,
      messageId: metaMessageId,
      status: 'sent',
    });
  } catch (err: any) {
    const errorMsg = err?.message || 'Internal server error while sending WhatsApp message.';
    return res.status(500).json({
      ok: false,
      error: errorMsg,
    });
  }
}
