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
import { formatTemplateComponentsForSending } from './templateUtils.ts';

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

export interface TriggerVariableMapping {
  mode: 'customer_name' | 'dynamic' | 'static';
  value?: string;
}

export interface ExternalApiTemplateTrigger {
  id: string;
  organizationId: string;
  triggerKey: string;
  label: string;
  description?: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  templateId?: string;
  templateName: string;
  templateLanguage: string;
  templateCategory?: string;
  templateComponents?: any[];
  headerFormat?: string;
  headerMediaUrl?: string;
  headerMediaId?: string;
  headerFileName?: string;
  variableMappings?: Record<string, TriggerVariableMapping>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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
  triggerKey?: string;
  templateName?: string;
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

export function normalizeTriggerKey(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Normalizes Indian & international phone numbers cleanly into WhatsApp Cloud API format (digits with country code, no "+").
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

  const raw = String(input).trim();
  if (!raw) {
    return { valid: false, phone: '', e164: '', error: 'Recipient phone number ("to") is required.' };
  }

  let digits = raw.replace(/[^0-9]/g, '');

  if (digits.startsWith('00') && digits.length > 10) {
    digits = digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    digits = `91${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    digits = `91${digits}`;
  }

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
      // Ignore HEAD timeout/errors
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

function normalizeIncomingVariables(rawVars: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!rawVars) return out;
  if (Array.isArray(rawVars)) {
    rawVars.forEach((val, idx) => {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        out[String(idx + 1)] = String(val).trim();
      }
    });
  } else if (typeof rawVars === 'object') {
    for (const [k, v] of Object.entries(rawVars as Record<string, unknown>)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        const cleanKey = k.replace(/^\{\{|\}\}$/g, '').trim();
        out[cleanKey] = String(v).trim();
      }
    }
  }
  return out;
}

/**
 * GET /api/external-api/config
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
        label: d.label || 'Voice AI Integration Key',
        createdAt: d.createdAt || nowIso,
        updatedAt: d.updatedAt || nowIso,
        lastUsedAt: d.lastUsedAt,
      };
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
 * GET /api/external-api/triggers
 */
export async function handleGetExternalApiTriggers(req: Request, res: Response) {
  try {
    const organizationId = resolveOrgIdFromManagementRequest(req);
    if (!organizationId) {
      return res.status(400).json({ ok: false, error: 'organizationId is required' });
    }

    const snap = await getDocs(collection(serverDb, `organizations/${organizationId}/externalApiTriggers`));
    const triggers: ExternalApiTemplateTrigger[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());

    return res.json({ ok: true, triggers });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to load template triggers.' });
  }
}

/**
 * POST /api/external-api/triggers
 * Creates or updates a named AI Call Template Trigger rule in Firestore.
 */
export async function handleSaveExternalApiTrigger(req: Request, res: Response) {
  try {
    const organizationId = resolveOrgIdFromManagementRequest(req);
    if (!organizationId) {
      return res.status(400).json({ ok: false, error: 'organizationId is required' });
    }

    const body = req.body || {};
    const triggerKey = normalizeTriggerKey(body.triggerKey);
    const label = String(body.label || triggerKey || '').trim();
    const phoneNumberId = String(body.phoneNumberId || '').trim();
    const templateName = String(body.templateName || '').trim();
    const templateLanguage = String(body.templateLanguage || 'en_US').trim();

    if (!triggerKey) {
      return res.status(400).json({ ok: false, error: 'Trigger Key is required (e.g. send_catalog).' });
    }
    if (!phoneNumberId) {
      return res.status(400).json({ ok: false, error: 'WhatsApp Sender Number is required.' });
    }
    if (!templateName) {
      return res.status(400).json({ ok: false, error: 'Approved Meta Template is required.' });
    }

    // Ensure triggerKey is unique within this organization (unless updating the same trigger ID)
    const existingSnap = await getDocs(collection(serverDb, `organizations/${organizationId}/externalApiTriggers`));
    const duplicate = existingSnap.docs.find((d) => {
      const data = d.data() as any;
      return normalizeTriggerKey(data.triggerKey) === triggerKey && d.id !== body.id;
    });
    if (duplicate) {
      return res.status(400).json({
        ok: false,
        error: `A trigger with key "${triggerKey}" already exists. Use a different Trigger Key or edit the existing one.`,
      });
    }

    const nowIso = new Date().toISOString();
    const triggerId = body.id ? String(body.id).trim() : `trg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existingDoc = body.id
      ? existingSnap.docs.find((d) => d.id === triggerId)?.data() as Partial<ExternalApiTemplateTrigger> | undefined
      : undefined;

    const record: ExternalApiTemplateTrigger = {
      id: triggerId,
      organizationId,
      triggerKey,
      label,
      description: typeof body.description === 'string' ? body.description.trim() : '',
      phoneNumberId,
      displayPhoneNumber: typeof body.displayPhoneNumber === 'string' ? body.displayPhoneNumber.trim() : '',
      templateId: typeof body.templateId === 'string' ? body.templateId.trim() : '',
      templateName,
      templateLanguage,
      templateCategory: typeof body.templateCategory === 'string' ? body.templateCategory.trim() : 'UTILITY',
      templateComponents: Array.isArray(body.templateComponents) ? body.templateComponents : existingDoc?.templateComponents || [],
      headerFormat: typeof body.headerFormat === 'string' ? body.headerFormat.toUpperCase() : '',
      headerMediaUrl: typeof body.headerMediaUrl === 'string' ? body.headerMediaUrl.trim() : '',
      headerMediaId: typeof body.headerMediaId === 'string' ? body.headerMediaId.trim() : '',
      headerFileName: typeof body.headerFileName === 'string' ? body.headerFileName.trim() : '',
      variableMappings:
        body.variableMappings && typeof body.variableMappings === 'object' ? body.variableMappings : {},
      enabled: body.enabled !== false,
      createdAt: existingDoc?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await setDoc(
      doc(serverDb, `organizations/${organizationId}/externalApiTriggers`, triggerId),
      cleanFirestoreData(record),
      { merge: true }
    );

    return res.json({ ok: true, trigger: record });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to save template trigger.' });
  }
}

/**
 * DELETE /api/external-api/triggers/:triggerId
 */
export async function handleDeleteExternalApiTrigger(req: Request, res: Response) {
  try {
    const organizationId = resolveOrgIdFromManagementRequest(req);
    const { triggerId } = req.params;
    if (!organizationId || !triggerId) {
      return res.status(400).json({ ok: false, error: 'organizationId and triggerId are required.' });
    }

    await deleteDoc(doc(serverDb, `organizations/${organizationId}/externalApiTriggers`, triggerId));
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to delete template trigger.' });
  }
}

/**
 * GET /api/external-api/logs
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
 * Supports:
 * 1) Named AI Call Template Triggers: { to, name, trigger: "send_catalog", variables?, mediaUrl?, source }
 * 2) Direct Meta Approved Template: { to, name, templateName, templateLanguage?, variables?, mediaUrl?, phoneNumberId?, source }
 * 3) Standard Text / Media Message: { to, name, message, mediaUrl?, caption?, phoneNumberId?, source }
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
        error: 'Unauthorized: External API key is disabled.',
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
      trigger,
      action,
      templateName: requestedTemplateName,
      templateLanguage: requestedTemplateLanguage,
      variables: rawVariables,
    } = req.body || {};

    const phoneNorm = normalizeWhatsAppPhone(to);
    if (!phoneNorm.valid) {
      return res.status(400).json({
        ok: false,
        error: phoneNorm.error || 'Valid "to" phone number is required.',
      });
    }

    const triggerKeyInput = normalizeTriggerKey(trigger || action);
    const directTemplateName = typeof requestedTemplateName === 'string' ? requestedTemplateName.trim() : '';
    const messageText = typeof message === 'string' ? message.trim() : '';
    const mediaUrlStr = typeof mediaUrl === 'string' ? mediaUrl.trim() : '';
    const captionStr = typeof caption === 'string' ? caption.trim() : '';
    const contactNameStr = typeof name === 'string' ? name.trim() : '';
    const sourceStr = typeof source === 'string' && source.trim() ? source.trim() : 'external-api';

    if (!triggerKeyInput && !directTemplateName && !messageText && !mediaUrlStr) {
      return res.status(400).json({
        ok: false,
        error: 'Provide either "trigger", "templateName", "message", or "mediaUrl".',
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
              triggerKey: triggerKeyInput || undefined,
              templateName: directTemplateName || undefined,
              source: sourceStr,
              status: 'failed',
              error: 'Workspace is suspended.',
              timestamp: nowIso,
            });
            return res.status(400).json({ ok: false, error: 'Workspace is suspended by Master Admin.' });
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
              triggerKey: triggerKeyInput || undefined,
              templateName: directTemplateName || undefined,
              source: sourceStr,
              status: 'failed',
              error: errMsg,
              timestamp: nowIso,
            });
            return res.status(400).json({ ok: false, error: errMsg });
          }
        }
      } catch (subErr) {
        console.warn('[ExternalAPI] Org subscription check notice:', subErr);
      }
    }

    // 4. If a named trigger was requested, resolve its configuration from Firestore
    let matchedTrigger: ExternalApiTemplateTrigger | null = null;
    if (triggerKeyInput) {
      const trigSnap = await getDocs(collection(serverDb, `organizations/${organizationId}/externalApiTriggers`));
      const foundDoc = trigSnap.docs.find(
        (d) => normalizeTriggerKey((d.data() as any).triggerKey) === triggerKeyInput
      );
      if (!foundDoc) {
        const errMsg = `Trigger "${triggerKeyInput}" not found. Configure it in Voice AI & API → Template Triggers.`;
        await writeExternalApiLog(organizationId, {
          id: logId,
          organizationId,
          to: phoneNorm.e164,
          cleanPhone: phoneNorm.phone,
          name: contactNameStr,
          message: messageText,
          triggerKey: triggerKeyInput,
          source: sourceStr,
          status: 'failed',
          error: errMsg,
          timestamp: nowIso,
        });
        return res.status(400).json({ ok: false, error: errMsg });
      }
      matchedTrigger = { id: foundDoc.id, ...(foundDoc.data() as any) } as ExternalApiTemplateTrigger;
      if (matchedTrigger.enabled === false) {
        const errMsg = `Trigger "${triggerKeyInput}" is currently paused/disabled.`;
        await writeExternalApiLog(organizationId, {
          id: logId,
          organizationId,
          to: phoneNorm.e164,
          cleanPhone: phoneNorm.phone,
          name: contactNameStr,
          triggerKey: triggerKeyInput,
          templateName: matchedTrigger.templateName,
          source: sourceStr,
          status: 'failed',
          error: errMsg,
          timestamp: nowIso,
        });
        return res.status(400).json({ ok: false, error: errMsg });
      }
    }

    // 5. Resolve connected WhatsApp Business number & access token for this organization
    const accountsSnap = await getDocs(collection(serverDb, `organizations/${organizationId}/whatsappAccounts`));
    const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const preferredId =
      (typeof requestedPhoneNumberId === 'string' && requestedPhoneNumberId.trim()) ||
      matchedTrigger?.phoneNumberId ||
      keyRecord.defaultPhoneNumberId ||
      '';

    let targetAccount: any = null;
    if (preferredId) {
      targetAccount = accounts.find((a) => a.phoneNumberId === preferredId || a.id === preferredId);
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
        triggerKey: triggerKeyInput || undefined,
        templateName: matchedTrigger?.templateName || directTemplateName || undefined,
        source: sourceStr,
        status: 'failed',
        error: errMsg,
        timestamp: nowIso,
      });
      return res.status(400).json({ ok: false, error: errMsg });
    }

    const sendUrl = `https://graph.facebook.com/${graphVersion}/${targetPhoneNumberId}/messages`;

    let payload: Record<string, any> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNorm.phone,
    };

    let resolvedTemplateName = '';
    let detectedMediaType: 'image' | 'video' | 'document' | 'audio' | 'template' | null = null;
    let usedTextFallbackForMedia = false;
    let displaySummary = '';

    // 6A. TEMPLATE MODE (Named Trigger OR Direct templateName)
    if (matchedTrigger || directTemplateName) {
      resolvedTemplateName = matchedTrigger?.templateName || directTemplateName;
      let resolvedLanguage =
        matchedTrigger?.templateLanguage ||
        (typeof requestedTemplateLanguage === 'string' && requestedTemplateLanguage.trim()) ||
        'en_US';
      let templateComponents: any[] = matchedTrigger?.templateComponents || [];

      // Look up live template definition in Firestore so components/language stay accurate
      try {
        const templatesSnap = await getDocs(collection(serverDb, `organizations/${organizationId}/templates`));
        const matchedTplDoc = templatesSnap.docs.find((d) => {
          const td = d.data() as any;
          if (matchedTrigger?.templateId && d.id === matchedTrigger.templateId) return true;
          return (
            String(td.name || '').toLowerCase() === resolvedTemplateName.toLowerCase() &&
            (!td.wabaId || !targetAccount?.wabaId || td.wabaId === targetAccount.wabaId)
          );
        });
        if (matchedTplDoc) {
          const td = matchedTplDoc.data() as any;
          if (!matchedTrigger?.templateComponents?.length && Array.isArray(td.components)) {
            templateComponents = td.components;
          } else if (Array.isArray(td.components) && td.components.length > 0) {
            templateComponents = td.components;
          }
          if (!requestedTemplateLanguage && td.language) {
            resolvedLanguage = td.language;
          }
        }
      } catch (tplErr) {
        console.warn('[ExternalAPI] Template lookup notice:', tplErr);
      }

      // Build variableValues from trigger mappings + incoming dynamic overrides
      const incomingVars = normalizeIncomingVariables(rawVariables);
      const finalVariableValues: Record<string, string> = {};

      if (matchedTrigger?.variableMappings) {
        for (const [varIdx, mapping] of Object.entries(matchedTrigger.variableMappings)) {
          if (!mapping) continue;
          if (mapping.mode === 'customer_name') {
            finalVariableValues[varIdx] =
              incomingVars[varIdx] || contactNameStr || mapping.value || 'Customer';
          } else if (mapping.mode === 'static') {
            finalVariableValues[varIdx] = mapping.value || incomingVars[varIdx] || '';
          } else {
            // dynamic mode: prefer incoming variables[varIdx], then messageText if single dynamic link/text, then fallback value
            finalVariableValues[varIdx] =
              incomingVars[varIdx] || messageText || mapping.value || '';
          }
        }
      }

      // Apply any remaining incoming variable keys directly
      for (const [k, v] of Object.entries(incomingVars)) {
        if (v) finalVariableValues[k] = v;
      }

      // If no mappings existed and {{1}} wasn't provided, use customer name if available
      if (!finalVariableValues['1'] && contactNameStr) {
        finalVariableValues['1'] = contactNameStr;
      }

      // Resolve Header Media if template has IMAGE / VIDEO / DOCUMENT header
      let resolvedHeaderMedia: { id?: string; link?: string; filename?: string } | null = null;
      const headerComp = templateComponents.find(
        (c: any) => String(c.type || '').toUpperCase() === 'HEADER'
      );
      const headerFormat = String(
        headerComp?.format || matchedTrigger?.headerFormat || ''
      ).toUpperCase();

      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {
        const mediaRef =
          mediaUrlStr ||
          matchedTrigger?.headerMediaId ||
          matchedTrigger?.headerMediaUrl ||
          headerComp?.example?.header_handle?.[0] ||
          '';

        if (mediaRef) {
          if (/^\d+$/.test(mediaRef)) {
            resolvedHeaderMedia = {
              id: mediaRef,
              filename: matchedTrigger?.headerFileName || undefined,
            };
          } else {
            resolvedHeaderMedia = await resolveMetaMediaObject(
              mediaRef,
              targetPhoneNumberId,
              token,
              headerFormat.toLowerCase() as 'image' | 'video' | 'document',
              graphVersion
            );
            if (resolvedHeaderMedia && matchedTrigger?.headerFileName && !resolvedHeaderMedia.filename) {
              resolvedHeaderMedia.filename = matchedTrigger.headerFileName;
            }
          }
        }
      }

      const formattedComponents = formatTemplateComponentsForSending(
        templateComponents,
        finalVariableValues,
        resolvedHeaderMedia
      );

      // If directTemplateName was passed without stored templateComponents, allow basic body parameters from incomingVars
      if (formattedComponents.length === 0 && Object.keys(incomingVars).length > 0 && templateComponents.length === 0) {
        const sortedKeys = Object.keys(incomingVars).sort((a, b) => Number(a) - Number(b));
        formattedComponents.push({
          type: 'body',
          parameters: sortedKeys.map((k) => ({ type: 'text', text: incomingVars[k] })),
        });
      }

      payload = {
        ...payload,
        type: 'template',
        template: {
          name: resolvedTemplateName,
          language: { code: resolvedLanguage },
          ...(formattedComponents.length > 0 ? { components: formattedComponents } : {}),
        },
      };

      detectedMediaType = 'template';
      displaySummary = `[Template: ${resolvedTemplateName}]${matchedTrigger ? ` (${matchedTrigger.label || matchedTrigger.triggerKey})` : ''}`;
    } else {
      // 6B. STANDARD TEXT / MEDIA MODE (backward compatible)
      const combinedCaption =
        captionStr && messageText && captionStr !== messageText
          ? `${captionStr}\n\n${messageText}`
          : captionStr || messageText || '';

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
          if (mediaUrlStr.startsWith('http://') || mediaUrlStr.startsWith('https://')) {
            usedTextFallbackForMedia = true;
            const fallbackBody = combinedCaption ? `${combinedCaption}\n\n${mediaUrlStr}` : mediaUrlStr;
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

      displaySummary =
        combinedCaption ||
        (mediaUrlStr ? `[${(detectedMediaType || 'document').toUpperCase()}] ${mediaUrlStr}` : '');
    }

    // 7. Dispatch via Meta WhatsApp Cloud API
    let sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    let sendData = await sendRes.json();

    // If Meta rejected media attachment URL directly in non-template mode, retry once as clickable text link
    if (
      (!sendRes.ok || sendData.error) &&
      !resolvedTemplateName &&
      mediaUrlStr &&
      !usedTextFallbackForMedia &&
      (mediaUrlStr.startsWith('http://') || mediaUrlStr.startsWith('https://'))
    ) {
      const combinedCaption =
        captionStr && messageText && captionStr !== messageText
          ? `${captionStr}\n\n${messageText}`
          : captionStr || messageText || '';
      const fallbackBody = combinedCaption ? `${combinedCaption}\n\n${mediaUrlStr}` : mediaUrlStr;
      const retryRes = await fetch(sendUrl, {
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
          text: { preview_url: true, body: fallbackBody },
        }),
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
        mediaUrl: mediaUrlStr || matchedTrigger?.headerMediaUrl || undefined,
        mediaType: detectedMediaType,
        caption: captionStr,
        triggerKey: triggerKeyInput || undefined,
        templateName: resolvedTemplateName || undefined,
        source: sourceStr,
        status: 'failed',
        error: errorMsg,
        timestamp: nowIso,
      });

      addWebhookLog({
        event: 'External API Message Failed',
        origin: sourceStr,
        details: `To: ${phoneNorm.e164}${resolvedTemplateName ? ` [${resolvedTemplateName}]` : ''} - Error: ${errorMsg}`,
        status: 'error',
        rawPayload: sendData.error,
      });

      return res.status(400).json({
        ok: false,
        error: errorMsg,
      });
    }

    const metaMessageId = sendData.messages?.[0]?.id || `wamid_${Date.now()}`;

    // Follow-up text if audio media was sent alongside message/caption
    if (detectedMediaType === 'audio' && !usedTextFallbackForMedia && (captionStr || messageText)) {
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
            text: { preview_url: true, body: captionStr || messageText },
          }),
        });
      } catch {}
    }

    // 8. Persist logs, Inbox conversation/message, contact & wamidTracker
    const convId = `conv_${phoneNorm.phone}`;

    await writeExternalApiLog(organizationId, {
      id: logId,
      organizationId,
      whatsAppAccountId: targetAccount?.id || targetPhoneNumberId,
      phoneNumberId: targetPhoneNumberId,
      to: phoneNorm.e164,
      cleanPhone: phoneNorm.phone,
      name: contactNameStr,
      message: messageText || displaySummary,
      mediaUrl: mediaUrlStr || matchedTrigger?.headerMediaUrl || undefined,
      mediaType: usedTextFallbackForMedia ? 'text' : detectedMediaType,
      caption: captionStr,
      triggerKey: triggerKeyInput || undefined,
      templateName: resolvedTemplateName || undefined,
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
          triggerKey: triggerKeyInput || undefined,
          templateName: resolvedTemplateName || undefined,
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
          templateName: resolvedTemplateName || undefined,
          body: displaySummary || mediaUrlStr,
          mediaUrl: mediaUrlStr || matchedTrigger?.headerMediaUrl || undefined,
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

    setDoc(
      doc(serverDb, `organizations/${organizationId}/settings`, 'externalApi'),
      { lastUsedAt: nowIso },
      { merge: true }
    ).catch(() => {});

    addWebhookLog({
      event: resolvedTemplateName ? 'External API Template Sent' : 'External API Message Sent',
      origin: sourceStr,
      details: `To: ${phoneNorm.e164}${contactNameStr ? ` (${contactNameStr})` : ''}${resolvedTemplateName ? ` · Template: ${resolvedTemplateName}` : ''} · ID: ${metaMessageId}`,
      status: 'success',
    });

    return res.status(200).json({
      ok: true,
      messageId: metaMessageId,
      status: 'sent',
      ...(resolvedTemplateName ? { templateName: resolvedTemplateName } : {}),
      ...(triggerKeyInput ? { trigger: triggerKeyInput } : {}),
    });
  } catch (err: any) {
    const errorMsg = err?.message || 'Internal server error while sending WhatsApp message.';
    return res.status(500).json({
      ok: false,
      error: errorMsg,
    });
  }
}
