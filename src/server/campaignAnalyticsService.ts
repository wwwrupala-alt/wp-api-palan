import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  CampaignRecipient,
  CampaignStats,
  MessageStatus,
  MessageTimelineEvent,
} from '../types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

let cachedFirebaseConfig: FirebaseConfig | null = null;

export function getFirebaseConfig(): FirebaseConfig {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  try {
    const configPath = path.resolve(__dirname, '../../firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      cachedFirebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return cachedFirebaseConfig!;
    }
  } catch (err) {
    console.warn('[AnalyticsService] Could not read firebase config:', err);
  }

  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'utility-sky-7f6jr',
    appId: process.env.VITE_FIREBASE_APP_ID || '',
    apiKey: process.env.VITE_FIREBASE_API_KEY || '',
    firestoreDatabaseId: process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-eb8ad6af-49f2-4fff-9c59-69f62d1e9a05',
  };
}

export function toFirestoreValue(val: unknown): Record<string, unknown> | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: val.toString() };
    return { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
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

export function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

// In-memory cache & fast lookup indexes
// campaignId -> CampaignRecipient[]
const recipientsStore = new Map<string, CampaignRecipient[]>();
// whatsappMessageId (wamid) -> CampaignRecipient
const wamidIndex = new Map<string, CampaignRecipient>();
// phone -> CampaignRecipient[]
const phoneIndex = new Map<string, CampaignRecipient[]>();
// Raw webhook events audit log
const webhookEventsLog: Array<{
  id: string;
  whatsappMessageId?: string;
  eventType: string;
  timestamp: string;
  payload: unknown;
  processed: boolean;
  createdAt: string;
}> = [];

/**
 * Calculates genuine percentage and stats strictly from actual recipient records.
 * NEVER returns hardcoded, mock, or fake values.
 */
export function calculateCampaignStats(recipients: CampaignRecipient[]): CampaignStats {
  const total = recipients.length;
  if (total === 0) {
    return {
      total: 0,
      queued: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      replied: 0,
      deliveryRate: 0,
      readRate: 0,
      failureRate: 0,
      replyRate: 0,
      linkClicks: 0,
      buttonClicks: 0,
    };
  }

  let queued = 0;
  let sent = 0;
  let delivered = 0;
  let read = 0;
  let failed = 0;
  let replied = 0;
  let buttonClicks = 0;

  for (const r of recipients) {
    if (r.currentStatus === 'queued') queued++;
    if (r.currentStatus === 'sent' || r.sentAt) sent++;
    if (r.currentStatus === 'delivered' || r.deliveredAt) delivered++;
    if (r.currentStatus === 'read' || r.readAt) read++;
    if (r.currentStatus === 'failed' || r.failedAt) failed++;
    if (r.hasReplied || r.repliedAt) replied++;
    if (r.timeline?.some((t) => t.details?.includes('Button clicked') || t.description?.includes('Button'))) {
      buttonClicks++;
    }
  }

  // Calculate actual rates from database records
  const deliveryRate = sent > 0 ? Number(((delivered / sent) * 100).toFixed(1)) : 0;
  const readRate = delivered > 0 ? Number(((read / delivered) * 100).toFixed(1)) : 0;
  const failureRate = total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0;
  const replyRate = delivered > 0 ? Number(((replied / delivered) * 100).toFixed(1)) : 0;

  return {
    total,
    queued,
    sent,
    delivered,
    read,
    failed,
    replied,
    deliveryRate,
    readRate,
    failureRate,
    replyRate,
    buttonClicks,
  };
}

/**
 * Persists a recipient record to Firestore REST API
 */
export async function persistRecipientToFirestore(
  orgId: string,
  recipient: CampaignRecipient
): Promise<void> {
  try {
    const fb = getFirebaseConfig();
    const docPath = `organizations/${orgId}/campaigns/${recipient.campaignId}/recipients/${recipient.id}`;
    const url = `https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/${fb.firestoreDatabaseId || '(default)'}/documents/${docPath}?key=${fb.apiKey}`;

    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(recipient)) {
      if (v !== undefined) {
        const val = toFirestoreValue(v);
        if (val) fields[k] = val;
      }
    }

    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  } catch (err) {
    console.warn(`[AnalyticsService] Failed to persist recipient ${recipient.id}:`, err);
  }
}

/**
 * Persists campaign aggregated stats to Firestore REST API
 */
export async function persistCampaignStatsToFirestore(
  orgId: string,
  campaignId: string,
  stats: CampaignStats
): Promise<void> {
  try {
    const fb = getFirebaseConfig();
    const docPath = `organizations/${orgId}/campaigns/${campaignId}`;
    const url = `https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/${fb.firestoreDatabaseId || '(default)'}/documents/${docPath}?key=${fb.apiKey}&updateMask.fieldPaths=stats&updateMask.fieldPaths=updatedAt`;

    const now = new Date().toISOString();
    const fields = {
      stats: toFirestoreValue(stats),
      updatedAt: toFirestoreValue(now),
    };

    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  } catch (err) {
    console.warn(`[AnalyticsService] Failed to persist campaign stats ${campaignId}:`, err);
  }
}

export async function persistWamidIndexToFirestore(
  wamid: string,
  data: {
    campaignId: string;
    organizationId: string;
    recipientId: string;
    phoneNumber: string;
    status: string;
  }
): Promise<void> {
  try {
    const fb = getFirebaseConfig();
    const docPath = `wamid_index/${encodeURIComponent(wamid)}`;
    const url = `https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/${fb.firestoreDatabaseId || '(default)'}/documents/${docPath}?key=${fb.apiKey}`;
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      const val = toFirestoreValue(v);
      if (val) fields[k] = val;
    }
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  } catch (err) {
    console.warn('[AnalyticsService] Failed to persist wamid index:', err);
  }
}

export async function fetchRecipientByWamidFromFirestore(
  wamid: string,
  recipientPhone?: string
): Promise<CampaignRecipient | null> {
  try {
    const fb = getFirebaseConfig();
    const docPath = `wamid_index/${encodeURIComponent(wamid)}`;
    const url = `https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/${fb.firestoreDatabaseId || '(default)'}/documents/${docPath}?key=${fb.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const fields = json.fields || {};
    const orgId = fields.organizationId?.stringValue;
    const campId = fields.campaignId?.stringValue;
    const rcpId = fields.recipientId?.stringValue;

    if (!orgId || !campId || !rcpId) return null;

    const rcpUrl = `https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/${fb.firestoreDatabaseId || '(default)'}/documents/organizations/${orgId}/campaigns/${campId}/recipients/${rcpId}?key=${fb.apiKey}`;
    const rcpRes = await fetch(rcpUrl);
    if (!rcpRes.ok) return null;
    const rcpDoc = await rcpRes.json();
    const raw = fromFirestoreValue(rcpDoc) || {};

    return {
      id: rcpId,
      campaignId: campId,
      organizationId: orgId,
      phoneNumber: raw.phoneNumber || recipientPhone || '',
      customerName: raw.customerName || 'Customer',
      whatsappMessageId: wamid,
      currentStatus: raw.currentStatus || 'sent',
      sentAt: raw.sentAt,
      deliveredAt: raw.deliveredAt,
      readAt: raw.readAt,
      failedAt: raw.failedAt,
      failureReason: raw.failureReason,
      hasReplied: Boolean(raw.hasReplied),
      timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
      variableValues: raw.variableValues,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    } as CampaignRecipient;
  } catch (err) {
    console.warn('[AnalyticsService] Error fetching recipient from Firestore:', err);
    return null;
  }
}

/**
 * Initializes or updates recipients in memory and indexes them.
 */
export function registerRecipients(
  campaignId: string,
  recipients: CampaignRecipient[],
  orgId?: string
) {
  const existing = recipientsStore.get(campaignId) || [];
  const map = new Map<string, CampaignRecipient>();
  for (const r of existing) map.set(r.id, r);
  for (const r of recipients) {
    map.set(r.id, r);
    if (r.whatsappMessageId) {
      wamidIndex.set(r.whatsappMessageId, r);
      if (orgId) {
        persistWamidIndexToFirestore(r.whatsappMessageId, {
          campaignId,
          organizationId: orgId,
          recipientId: r.id,
          phoneNumber: r.phoneNumber,
          status: r.currentStatus,
        }).catch(() => {});
      }
    }
    const cleanPhone = r.phoneNumber.replace(/[^0-9]/g, '');
    const pList = phoneIndex.get(cleanPhone) || [];
    if (!pList.some((x) => x.id === r.id)) {
      pList.push(r);
      phoneIndex.set(cleanPhone, pList);
    }
    if (orgId) {
      persistRecipientToFirestore(orgId, r).catch(() => {});
    }
  }

  const merged = Array.from(map.values());
  recipientsStore.set(campaignId, merged);

  if (orgId) {
    const stats = calculateCampaignStats(merged);
    persistCampaignStatsToFirestore(orgId, campaignId, stats).catch(() => {});
  }
}

/**
 * Processes an incoming WhatsApp webhook status update idempotently.
 * Status precedence: queued (0) < sent (1) < delivered (2) < read (3); failed is terminal.
 */
export async function processWebhookStatusUpdate(params: {
  wamid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestampSeconds?: number | string;
  recipientPhone?: string;
  errorObj?: { code?: number; message?: string; title?: string; error_data?: unknown };
  rawPayload?: unknown;
}): Promise<{ updated: boolean; recipient?: CampaignRecipient; message?: string }> {
  const { wamid, status, timestampSeconds, recipientPhone, errorObj, rawPayload } = params;

  // Record raw event for compliance and auditing
  const nowIso = new Date().toISOString();
  const eventTimeIso = timestampSeconds
    ? new Date(Number(timestampSeconds) * 1000).toISOString()
    : nowIso;

  webhookEventsLog.unshift({
    id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    whatsappMessageId: wamid,
    eventType: `status_${status}`,
    timestamp: eventTimeIso,
    payload: rawPayload || { wamid, status, errorObj },
    processed: true,
    createdAt: nowIso,
  });
  if (webhookEventsLog.length > 500) webhookEventsLog.pop();

  // Find recipient record by WAMID
  let recipient = wamidIndex.get(wamid);

  // If not found by WAMID, check phone index for recent message
  if (!recipient && recipientPhone) {
    const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
    const phoneRecipients = phoneIndex.get(cleanPhone) || [];
    recipient = phoneRecipients[phoneRecipients.length - 1];
    if (recipient && !recipient.whatsappMessageId) {
      recipient.whatsappMessageId = wamid;
      wamidIndex.set(wamid, recipient);
    }
  }

  // If still not found in memory (e.g. serverless cold start on Vercel), lookup Firestore
  if (!recipient) {
    recipient = (await fetchRecipientByWamidFromFirestore(wamid, recipientPhone)) || undefined;
    if (recipient) {
      wamidIndex.set(wamid, recipient);
      const list = recipientsStore.get(recipient.campaignId) || [];
      const idx = list.findIndex((x) => x.id === recipient!.id);
      if (idx >= 0) list[idx] = recipient;
      else list.push(recipient);
      recipientsStore.set(recipient.campaignId, list);
    }
  }

  if (!recipient) {
    return {
      updated: false,
      message: `No active recipient found for WhatsApp Message ID ${wamid}. (May be an untracked or external message)`,
    };
  }

  // Idempotency & Status Priority Hierarchy
  const rank: Record<MessageStatus, number> = {
    queued: 0,
    sent: 1,
    delivered: 2,
    read: 3,
    failed: -1,
  };

  const currentRank = rank[recipient.currentStatus] ?? 0;
  const newRank = rank[status] ?? 0;

  // Do not regress higher status back to lower status (e.g. read back to delivered or sent)
  if (status !== 'failed' && newRank <= currentRank && recipient.currentStatus !== 'queued') {
    // Already in equal or higher state, update timestamp if missing but keep status
    if (status === 'delivered' && !recipient.deliveredAt) recipient.deliveredAt = eventTimeIso;
    if (status === 'read' && !recipient.readAt) recipient.readAt = eventTimeIso;
    return { updated: false, recipient, message: 'Status already processed or superseded.' };
  }

  // Update status and timestamps
  recipient.currentStatus = status;
  recipient.updatedAt = nowIso;

  if (status === 'sent') {
    recipient.sentAt = recipient.sentAt || eventTimeIso;
  } else if (status === 'delivered') {
    recipient.deliveredAt = recipient.deliveredAt || eventTimeIso;
    if (!recipient.sentAt) recipient.sentAt = eventTimeIso;
  } else if (status === 'read') {
    recipient.readAt = recipient.readAt || eventTimeIso;
    if (!recipient.deliveredAt) recipient.deliveredAt = eventTimeIso;
    if (!recipient.sentAt) recipient.sentAt = eventTimeIso;
  } else if (status === 'failed') {
    recipient.failedAt = recipient.failedAt || eventTimeIso;
    if (errorObj) {
      recipient.failureCode = errorObj.code ? String(errorObj.code) : undefined;
      recipient.failureReason = errorObj.message || errorObj.title || 'WhatsApp Cloud API rejection';
    }
  }

  // Append to timeline if not duplicate
  const existingTimelineItem = recipient.timeline.find(
    (t) => t.status === status && Math.abs(new Date(t.timestamp).getTime() - new Date(eventTimeIso).getTime()) < 5000
  );

  if (!existingTimelineItem) {
    let desc = `Message ${status}`;
    if (status === 'sent') desc = 'Message sent via Meta Cloud API';
    if (status === 'delivered') desc = 'Delivered to recipient phone';
    if (status === 'read') desc = 'Read by recipient (blue ticks)';
    if (status === 'failed') desc = `Failed to deliver: ${recipient.failureReason || 'Meta rejection'}`;

    recipient.timeline.push({
      status,
      timestamp: eventTimeIso,
      description: desc,
      details: errorObj ? JSON.stringify(errorObj) : undefined,
    });
  }

  // Re-index
  wamidIndex.set(wamid, recipient);

  // Update Firestore
  if (recipient.organizationId) {
    persistRecipientToFirestore(recipient.organizationId, recipient).catch(() => {});
    const campRecipients = recipientsStore.get(recipient.campaignId) || [];
    const stats = calculateCampaignStats(campRecipients);
    persistCampaignStatsToFirestore(recipient.organizationId, recipient.campaignId, stats).catch(() => {});
  }

  return { updated: true, recipient };
}

/**
 * Processes an incoming customer message (reply) to correlate with campaign delivery.
 */
export async function processIncomingCustomerReply(params: {
  fromPhone: string;
  messageText: string;
  timestampSeconds?: number | string;
  wamid?: string;
  organizationId?: string;
}): Promise<{ correlated: boolean; recipient?: CampaignRecipient }> {
  const { fromPhone, messageText, timestampSeconds, organizationId } = params;
  const cleanPhone = fromPhone.replace(/[^0-9]/g, '');
  const list = phoneIndex.get(cleanPhone) || [];

  if (list.length === 0) {
    return { correlated: false };
  }

  // Pick the most recent campaign recipient for this phone
  const recipient = list[list.length - 1];
  const nowIso = new Date().toISOString();
  const eventTimeIso = timestampSeconds
    ? new Date(Number(timestampSeconds) * 1000).toISOString()
    : nowIso;

  recipient.hasReplied = true;
  recipient.repliedAt = recipient.repliedAt || eventTimeIso;
  recipient.updatedAt = nowIso;

  // Add reply event to timeline
  recipient.timeline.push({
    status: 'replied',
    timestamp: eventTimeIso,
    description: `Customer Replied: "${messageText.slice(0, 80)}${messageText.length > 80 ? '...' : ''}"`,
    details: messageText,
  });

  if (recipient.organizationId || organizationId) {
    const orgId = recipient.organizationId || organizationId!;
    persistRecipientToFirestore(orgId, recipient).catch(() => {});
    const campRecipients = recipientsStore.get(recipient.campaignId) || [];
    const stats = calculateCampaignStats(campRecipients);
    persistCampaignStatsToFirestore(orgId, recipient.campaignId, stats).catch(() => {});
  }

  return { correlated: true, recipient };
}

/**
 * Returns recipients for a given campaign with optional search, status filtering, and pagination.
 */
export function getCampaignRecipients(
  campaignId: string,
  options?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
) {
  const all = recipientsStore.get(campaignId) || [];
  let filtered = [...all];

  if (options?.status && options.status !== 'all') {
    if (options.status === 'replied') {
      filtered = filtered.filter((r) => r.hasReplied || r.repliedAt);
    } else {
      filtered = filtered.filter((r) => r.currentStatus === options.status);
    }
  }

  if (options?.search) {
    const q = options.search.toLowerCase().trim();
    filtered = filtered.filter(
      (r) =>
        r.customerName.toLowerCase().includes(q) ||
        r.phoneNumber.includes(q) ||
        (r.whatsappMessageId && r.whatsappMessageId.toLowerCase().includes(q))
    );
  }

  // Sort by updatedAt descending
  filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const page = Math.max(1, Number(options?.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(options?.limit) || 20));
  const startIndex = (page - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  return {
    recipients: paginated,
    total: filtered.length,
    page,
    limit,
    totalPages: Math.ceil(filtered.length / limit) || 1,
  };
}

/**
 * Returns full analytics metadata for a campaign strictly from real records.
 */
export function getCampaignAnalytics(campaignId: string) {
  const recipients = recipientsStore.get(campaignId) || [];
  const stats = calculateCampaignStats(recipients);

  // Group status distribution
  const statusDistribution = [
    { status: 'Sent', count: stats.sent, color: '#3b82f6' },
    { status: 'Delivered', count: stats.delivered, color: '#8b5cf6' },
    { status: 'Read', count: stats.read, color: '#10b981' },
    { status: 'Failed', count: stats.failed, color: '#ef4444' },
    { status: 'Replied', count: stats.replied, color: '#f59e0b' },
  ];

  // Hourly or chronological activity timeline
  const activityMap = new Map<string, { hour: string; sent: number; delivered: number; read: number; failed: number }>();
  for (const r of recipients) {
    const t = r.sentAt || r.createdAt;
    const hourLabel = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const existing = activityMap.get(hourLabel) || { hour: hourLabel, sent: 0, delivered: 0, read: 0, failed: 0 };
    if (r.sentAt) existing.sent++;
    if (r.deliveredAt) existing.delivered++;
    if (r.readAt) existing.read++;
    if (r.failedAt) existing.failed++;
    activityMap.set(hourLabel, existing);
  }

  const timelineActivity = Array.from(activityMap.values()).slice(-15);

  // Failure reasons breakdown
  const failureReasons: Record<string, number> = {};
  for (const r of recipients) {
    if (r.currentStatus === 'failed' && r.failureReason) {
      const reasonKey = r.failureCode ? `[${r.failureCode}] ${r.failureReason}` : r.failureReason;
      failureReasons[reasonKey] = (failureReasons[reasonKey] || 0) + 1;
    }
  }

  return {
    campaignId,
    stats,
    hasRealData: recipients.length > 0,
    statusDistribution,
    timelineActivity,
    failureReasons,
  };
}

/**
 * Returns a single message/recipient record by message ID or recipient ID.
 */
export function getMessageDetails(identifier: string): CampaignRecipient | null {
  // Check WAMID first
  if (wamidIndex.has(identifier)) {
    return wamidIndex.get(identifier)!;
  }
  // Check recipient ID across all campaigns
  for (const list of recipientsStore.values()) {
    const found = list.find((r) => r.id === identifier || r.whatsappMessageId === identifier);
    if (found) return found;
  }
  return null;
}

/**
 * Returns audit webhook events.
 */
export function getWebhookAuditEvents() {
  return [...webhookEventsLog];
}
