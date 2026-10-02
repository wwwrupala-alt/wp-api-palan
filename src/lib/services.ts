import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  getDocs,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import type {
  Contact,
  ContactGroup,
  Template,
  Campaign,
  Message,
  Conversation,
  Automation,
  BotFlow,
  BotStep,
  BotButton,
  UserProfile,
  Organization,
  UserRole,
  CampaignRecipient,
} from '../types/index.ts';

/**
 * Safely parses response as JSON, falling back cleanly with meaningful error if server returned HTML (e.g. 404/500/offline)
 */
async function parseJsonResponse<T = any>(res: Response, fallbackError: string): Promise<T> {
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('API server route not found (404). Please ensure the backend server is running and deployed properly.');
      }
      throw new Error(`Server returned status ${res.status}. Could not parse response as JSON.`);
    }
    throw new Error('Invalid response received from server.');
  }

  if (!res.ok) {
    throw new Error(json?.error || json?.message || fallbackError);
  }

  return json;
}

/**
 * Removes undefined fields from objects recursively.
 * Cloud Firestore throws: "Unsupported field value: undefined" if any property is undefined.
 */
export function removeUndefined<T extends any>(val: T): T {
  if (val === undefined) return undefined as any;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => removeUndefined(item)) as any;
  }
  const clean: any = {};
  for (const [key, value] of Object.entries(val)) {
    if (value !== undefined) {
      clean[key] = removeUndefined(value);
    }
  }
  return clean;
}

// -------------------------------------------------------------
// CONTACTS & GROUPS
// -------------------------------------------------------------

export function subscribeContacts(
  orgId: string,
  onData: (contacts: Contact[]) => void,
  onError: (err: unknown) => void
) {
  const path = `organizations/${orgId}/contacts`;
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Contact[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Contact, 'id'>) });
      });
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      onError(err);
    }
  );
}

export async function addContact(orgId: string, contactData: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) {
  const contactId = `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const path = `organizations/${orgId}/contacts/${contactId}`;
  const now = new Date().toISOString();

  const rawRecord: Omit<Contact, 'id'> = {
    ...contactData,
    createdAt: now,
    updatedAt: now,
  };

  const record = removeUndefined(rawRecord);

  try {
    await setDoc(doc(db, 'organizations', orgId, 'contacts', contactId), record);
    return contactId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateContact(orgId: string, contactId: string, updates: Partial<Contact>) {
  const path = `organizations/${orgId}/contacts/${contactId}`;
  const cleanUpdates = removeUndefined({
    ...updates,
    updatedAt: new Date().toISOString(),
  });
  try {
    await updateDoc(doc(db, 'organizations', orgId, 'contacts', contactId), cleanUpdates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteContact(orgId: string, contactId: string) {
  const path = `organizations/${orgId}/contacts/${contactId}`;
  try {
    await deleteDoc(doc(db, 'organizations', orgId, 'contacts', contactId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeGroups(
  orgId: string,
  onData: (groups: ContactGroup[]) => void,
  onError: (err: unknown) => void
) {
  const path = `organizations/${orgId}/contactGroups`;
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: ContactGroup[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<ContactGroup, 'id'>) });
      });
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      onError(err);
    }
  );
}

export async function addGroup(orgId: string, name: string, description?: string) {
  const groupId = `grp_${Date.now()}`;
  const path = `organizations/${orgId}/contactGroups/${groupId}`;
  try {
    await setDoc(doc(db, 'organizations', orgId, 'contactGroups', groupId), {
      name,
      description: description || '',
      contactCount: 0,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteGroup(orgId: string, groupId: string) {
  const path = `organizations/${orgId}/contactGroups/${groupId}`;
  try {
    await deleteDoc(doc(db, 'organizations', orgId, 'contactGroups', groupId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// -------------------------------------------------------------
// TEMPLATES
// -------------------------------------------------------------

export function subscribeTemplates(
  orgId: string,
  onData: (templates: Template[]) => void,
  onError: (err: unknown) => void
) {
  const path = `organizations/${orgId}/templates`;
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: Template[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Template, 'id'>) });
      });
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      onError(err);
    }
  );
}

export async function syncTemplatesFromMeta(orgId: string, wabaId: string, accountId: string, customToken?: string) {
  const url = `/api/meta/templates?wabaId=${encodeURIComponent(wabaId)}${customToken ? `&customToken=${encodeURIComponent(customToken)}` : ''}`;
  const res = await fetch(url, {
    headers: customToken ? { 'x-meta-token': customToken } : {},
  });
  const data = await parseJsonResponse(res, 'Failed to sync templates from Meta.');

  const metaTemplates = data.templates || [];
  let count = 0;

  for (const t of metaTemplates) {
    const templateId = t.id || `tpl_${t.name}_${t.language}`;
    const tplDocRef = doc(db, 'organizations', orgId, 'templates', templateId);
    await setDoc(tplDocRef, {
      metaTemplateId: t.id,
      name: t.name,
      language: t.language,
      category: t.category,
      status: t.status,
      components: sanitizeComponentsForFirestore(t.components || []),
      whatsAppAccountId: accountId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    count++;
  }

  return count;
}

// Helper: Firestore doesn't support nested arrays (e.g. example.body_text: [["Rahul", "ORD-101"]])
// Sanitize component objects before saving in Firestore while keeping them intact for UI
function sanitizeComponentsForFirestore(components: any[]): any[] {
  if (!Array.isArray(components)) return [];
  return components.map((c) => {
    const clean = { ...c };
    if (clean.example && clean.example.body_text && Array.isArray(clean.example.body_text)) {
      // Flatten or convert nested array to flat array or array of objects for Firestore compatibility
      clean.example = {
        ...clean.example,
        body_text_flat: clean.example.body_text.flat(Infinity),
      };
      delete clean.example.body_text;
    }
    return clean;
  });
}

export async function createTemplate(
  orgId: string,
  wabaId: string,
  accountId: string,
  templateData: {
    name: string;
    language: string;
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    components: any[];
  },
  customToken?: string
) {
  // 1. Submit to Meta API (Full Meta payload with nested example.body_text if needed)
  const res = await fetch('/api/meta/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wabaId,
      customToken,
      ...templateData,
    }),
  });

  const data = await parseJsonResponse(res, 'Meta rejected template creation.');

  // 2. Save in Firestore (Sanitized to avoid Firestore nested array error)
  const templateId = data.metaTemplateId || `tpl_${templateData.name}`;
  const tplRef = doc(db, 'organizations', orgId, 'templates', templateId);

  await setDoc(tplRef, {
    metaTemplateId: data.metaTemplateId,
    name: templateData.name,
    language: templateData.language,
    category: templateData.category,
    status: data.status || 'PENDING',
    components: sanitizeComponentsForFirestore(templateData.components),
    whatsAppAccountId: accountId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return templateId;
}

export async function deleteTemplate(
  orgId: string,
  templateId: string,
  templateName: string,
  wabaId: string,
  customToken?: string
) {
  // 1. Delete from Meta API
  try {
    const res = await fetch('/api/meta/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wabaId,
        templateName,
        customToken,
      }),
    });
    // If Meta returns error (e.g. template already deleted or not found on Meta), proceed with local Firestore delete
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn('Meta template deletion response:', errData);
    }
  } catch (err) {
    console.warn('Error calling Meta delete template API:', err);
  }

  // 2. Delete from Firestore
  const tplRef = doc(db, 'organizations', orgId, 'templates', templateId);
  await deleteDoc(tplRef);
  return true;
}

// -------------------------------------------------------------
// CAMPAIGNS
// -------------------------------------------------------------

export function subscribeCampaigns(
  orgId: string,
  onData: (campaigns: Campaign[]) => void,
  onError: (err: unknown) => void
) {
  const path = `organizations/${orgId}/campaigns`;
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Campaign[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Campaign, 'id'>) });
      });
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      onError(err);
    }
  );
}

export async function createCampaign(
  orgId: string,
  campaignData: {
    name: string;
    whatsAppAccountId: string;
    templateId: string;
    templateName: string;
    groupId?: string;
    recipientCount: number;
    scheduledAt?: string;
  }
) {
  const campaignId = `cmp_${Date.now()}`;
  const path = `organizations/${orgId}/campaigns/${campaignId}`;
  const rawRecord: Omit<Campaign, 'id'> = {
    ...campaignData,
    status: campaignData.scheduledAt ? 'scheduled' : 'draft',
    createdAt: new Date().toISOString(),
    stats: {
      total: campaignData.recipientCount || 0,
      queued: campaignData.recipientCount || 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      replied: 0,
      deliveryRate: 0,
      readRate: 0,
      failureRate: 0,
      replyRate: 0,
    },
  };

  const record = removeUndefined(rawRecord);

  try {
    await setDoc(doc(db, 'organizations', orgId, 'campaigns', campaignId), record);
    return campaignId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function launchCampaign(
  orgId: string,
  campaignId: string,
  phoneNumberId: string,
  template: { name: string; language: string; components?: any[] },
  recipients: Array<{ phone: string; name?: string; variableValues?: Record<string, string> }>,
  customToken?: string,
  variableValues?: Record<string, string>,
  campaignName?: string
) {
  // Update status to sending with started timestamp
  const campRef = doc(db, 'organizations', orgId, 'campaigns', campaignId);
  const now = new Date().toISOString();
  await updateDoc(campRef, { status: 'sending', startedAt: now }).catch(() => {});

  try {
    const res = await fetch('/api/meta/campaigns/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customToken ? { 'x-meta-token': customToken } : {}),
      },
      body: JSON.stringify({
        phoneNumberId,
        template,
        recipients,
        variableValues,
        customToken,
        campaignId,
        campaignName,
        organizationId: orgId,
      }),
    });

    const data = await parseJsonResponse(res, 'Failed to dispatch campaign.');

    // Save individual recipients to Firestore subcollection if returned
    if (Array.isArray(data.recipients)) {
      for (const r of data.recipients) {
        const rRef = doc(db, 'organizations', orgId, 'campaigns', campaignId, 'recipients', r.id);
        await setDoc(rRef, removeUndefined(r), { merge: true }).catch(() => {});
        if (r.whatsappMessageId) {
          const wRef = doc(db, 'wamid_index', r.whatsappMessageId);
          await setDoc(
            wRef,
            {
              wamid: r.whatsappMessageId,
              campaignId,
              organizationId: orgId,
              recipientId: r.id,
              phoneNumber: r.phoneNumber || '',
              status: r.currentStatus || 'sent',
            },
            { merge: true }
          ).catch(() => {});
        }
      }
    }

    await updateDoc(campRef, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      stats: data.stats,
      recipients: data.recipients || [],
    }).catch(() => {});

    return data.stats;
  } catch (err) {
    await updateDoc(campRef, { status: 'failed' }).catch(() => {});
    throw err;
  }
}

/**
 * Real-time subscription to recipient records of a specific campaign
 */
export function subscribeCampaignRecipients(
  orgId: string,
  campaignId: string,
  onData: (recipients: CampaignRecipient[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = `organizations/${orgId}/campaigns/${campaignId}/recipients`;
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: CampaignRecipient[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as any) });
      });
      onData(list);
    },
    (err) => {
      console.warn(`[Firestore] Recipient subscribe notice for ${campaignId}:`, err);
      onError?.(err);
    }
  );
}

/**
 * Fetches campaign analytics data from the backend API
 */
export async function fetchCampaignAnalyticsApi(campaignId: string) {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/analytics`);
  return parseJsonResponse(res, 'Failed to fetch campaign analytics.');
}

/**
 * Fetches recipient messages for a campaign with optional search, status filtering, and pagination
 */
export async function fetchCampaignMessagesApi(
  campaignId: string,
  params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ recipients: CampaignRecipient[]; total: number; page: number; totalPages: number }> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const url = `/api/campaigns/${encodeURIComponent(campaignId)}/messages?${query.toString()}`;
  const res = await fetch(url);
  return parseJsonResponse(res, 'Failed to fetch campaign messages.');
}

/**
 * Fetches message tracking details by ID
 */
export async function fetchMessageDetailsApi(messageId: string): Promise<CampaignRecipient> {
  const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}`);
  return parseJsonResponse(res, 'Failed to fetch message details.');
}

// -------------------------------------------------------------
// CONVERSATIONS & INBOX MESSAGES
// -------------------------------------------------------------

export function subscribeConversations(
  orgId: string,
  onData: (conversations: Conversation[]) => void,
  onError: (err: unknown) => void
) {
  const path = `organizations/${orgId}/conversations`;
  const q = query(collection(db, path), orderBy('lastMessageAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Conversation[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Conversation, 'id'>) });
      });
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      onError(err);
    }
  );
}

export function subscribeMessages(
  orgId: string,
  conversationId: string,
  onData: (messages: Message[]) => void,
  onError: (err: unknown) => void
) {
  const path = `organizations/${orgId}/messages`;
  const q = query(
    collection(db, path),
    where('conversationId', '==', conversationId),
    orderBy('timestamp', 'asc'),
    limit(100)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Message[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Message, 'id'>) });
      });
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      onError(err);
    }
  );
}

export async function sendOutboundMessage(
  orgId: string,
  params: {
    phoneNumberId: string;
    accountId: string;
    recipientPhone: string;
    contactName: string;
    body: string;
    type?: 'text' | 'image' | 'document' | 'template';
    mediaUrl?: string;
    filename?: string;
    interactive?: any;
    template?: any;
    conversationId?: string;
    contactId?: string;
    customToken?: string;
  }
) {
  // 1. Send via Meta WhatsApp Cloud API
  const res = await fetch('/api/meta/send-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.customToken ? { 'x-meta-token': params.customToken } : {}),
    },
    body: JSON.stringify({
      phoneNumberId: params.phoneNumberId,
      recipientPhone: params.recipientPhone,
      body: params.body,
      type: params.type || 'text',
      mediaUrl: params.mediaUrl,
      filename: params.filename,
      interactive: params.interactive,
      template: params.template,
      variableValues: (params as any).variableValues,
      customToken: params.customToken,
    }),
  });

  const data = await parseJsonResponse(res, 'Failed to send WhatsApp message via Meta Cloud API.');

  const now = new Date().toISOString();
  const convId = params.conversationId || `conv_${params.recipientPhone.replace(/[^0-9]/g, '')}`;
  const msgId = data.metaMessageId || `msg_${Date.now()}`;

  // 2. Persist Message in Firestore
  const msgRef = doc(db, 'organizations', orgId, 'messages', msgId);
  await setDoc(msgRef, {
    whatsAppAccountId: params.accountId,
    contactId: params.contactId || params.recipientPhone,
    conversationId: convId,
    direction: 'outbound',
    messageType: params.type || 'text',
    messageStatus: 'sent',
    metaMessageId: msgId,
    body: params.body,
    mediaUrl: params.mediaUrl || null,
    timestamp: now,
  });

  // 3. Update Conversation Thread
  const convRef = doc(db, 'organizations', orgId, 'conversations', convId);
  await setDoc(
    convRef,
    {
      contactId: params.contactId || params.recipientPhone,
      contactPhone: params.recipientPhone,
      contactName: params.contactName || params.recipientPhone,
      whatsAppAccountId: params.accountId,
      lastMessage: params.body,
      lastMessageAt: now,
      unreadCount: 0,
      status: 'open',
    },
    { merge: true }
  );

  return msgId;
}

// -------------------------------------------------------------
// AUTOMATIONS
// -------------------------------------------------------------

export function subscribeAutomations(
  orgId: string,
  onData: (automations: Automation[]) => void,
  onError: (err: unknown) => void
) {
  const path = `organizations/${orgId}/automations`;
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: Automation[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Automation, 'id'>) });
      });
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      onError(err);
    }
  );
}

export async function addAutomation(
  orgId: string,
  rule: Omit<Automation, 'id' | 'createdAt' | 'updatedAt'>
) {
  const autoId = `auto_${Date.now()}`;
  const path = `organizations/${orgId}/automations/${autoId}`;
  const now = new Date().toISOString();

  const record = removeUndefined({
    ...rule,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await setDoc(doc(db, 'organizations', orgId, 'automations', autoId), record);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function toggleAutomation(orgId: string, autoId: string, enabled: boolean) {
  const path = `organizations/${orgId}/automations/${autoId}`;
  try {
    await updateDoc(doc(db, 'organizations', orgId, 'automations', autoId), {
      enabled,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteAutomation(orgId: string, autoId: string) {
  const path = `organizations/${orgId}/automations/${autoId}`;
  try {
    await deleteDoc(doc(db, 'organizations', orgId, 'automations', autoId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// -------------------------------------------------------------
// ADVANCED CHATBOT FLOWS (Multi-Account, Buttons, Media, Menus)
// -------------------------------------------------------------

export function subscribeBotFlows(
  orgId: string,
  onData: (flows: any[]) => void,
  onError: (err: unknown) => void
) {
  const path = `organizations/${orgId}/botFlows`;
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      onData(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
      onError(err);
    }
  );
}

export async function saveBotFlow(orgId: string, flow: any) {
  const flowId = flow.id || `flow_${Date.now()}`;
  const path = `organizations/${orgId}/botFlows/${flowId}`;
  const now = new Date().toISOString();

  const record = removeUndefined({
    ...flow,
    id: flowId,
    updatedAt: now,
    createdAt: flow.createdAt || now,
    totalTriggeredCount: flow.totalTriggeredCount || 0,
  });

  try {
    await setDoc(doc(db, 'organizations', orgId, 'botFlows', flowId), record);
    return flowId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function toggleBotFlow(orgId: string, flowId: string, enabled: boolean) {
  const path = `organizations/${orgId}/botFlows/${flowId}`;
  try {
    await updateDoc(doc(db, 'organizations', orgId, 'botFlows', flowId), {
      enabled,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteBotFlow(orgId: string, flowId: string) {
  const path = `organizations/${orgId}/botFlows/${flowId}`;
  try {
    await deleteDoc(doc(db, 'organizations', orgId, 'botFlows', flowId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// -------------------------------------------------------------
// CHATBOT ENGINE & LIVE INCOMING SIMULATION FOR TEST NUMBERS
// -------------------------------------------------------------

export const simulateIncomingCustomerMessage = simulateIncomingCustomerMessageAndRunBot;

export async function simulateIncomingCustomerMessageAndRunBot(
  orgId: string,
  params: {
    senderPhone: string;
    senderName?: string;
    messageText: string;
    phoneNumberId?: string;
    accountId?: string;
    customToken?: string;
  }
) {
  const cleanPhone = params.senderPhone.trim().replace(/\s+/g, '');
  const senderName = params.senderName?.trim() || cleanPhone;
  const now = new Date().toISOString();
  const convId = `conv_${cleanPhone.replace(/[^0-9]/g, '')}`;

  // 1. Save or update the Contact in address book if not exists
  const contactRef = doc(db, 'organizations', orgId, 'contacts', `cnt_${cleanPhone.replace(/[^0-9]/g, '')}`);
  await setDoc(
    contactRef,
    removeUndefined({
      id: `cnt_${cleanPhone.replace(/[^0-9]/g, '')}`,
      name: senderName,
      phone: cleanPhone,
      optInStatus: 'opted_in',
      updatedAt: now,
      createdAt: now,
    }),
    { merge: true }
  );

  // 2. Persist inbound message in Firestore (Appears instantly in Inbox!)
  const inMsgId = `msg_in_${Date.now()}`;
  const inMsgRef = doc(db, 'organizations', orgId, 'messages', inMsgId);
  await setDoc(
    inMsgRef,
    removeUndefined({
      id: inMsgId,
      whatsAppAccountId: params.accountId || 'test_account',
      contactId: cleanPhone,
      conversationId: convId,
      direction: 'inbound',
      messageType: 'text',
      messageStatus: 'delivered',
      body: params.messageText,
      timestamp: now,
    })
  );

  // 3. Update Conversation Thread in Firestore
  const convRef = doc(db, 'organizations', orgId, 'conversations', convId);
  await setDoc(
    convRef,
    removeUndefined({
      id: convId,
      contactId: cleanPhone,
      contactPhone: cleanPhone,
      contactName: senderName,
      whatsAppAccountId: params.accountId || 'test_account',
      lastMessage: params.messageText,
      lastMessageAt: now,
      unreadCount: 1,
      status: 'open',
    }),
    { merge: true }
  );

  // 4. CHATBOT ENGINE: Evaluate active bot flows for this phone number / text
  const botFlowsPath = `organizations/${orgId}/botFlows`;
  const flowsSnap = await getDocs(collection(db, botFlowsPath));
  const activeFlows: BotFlow[] = [];
  flowsSnap.forEach((d) => {
    const f = { id: d.id, ...d.data() } as BotFlow;
    if (f.enabled) {
      activeFlows.push(f);
    }
  });

  const upperText = params.messageText.trim().toUpperCase();

  // Find matching bot flow
  let matchedFlow: BotFlow | null = null;
  for (const flow of activeFlows) {
    if (flow.phoneNumberId && params.phoneNumberId && flow.phoneNumberId !== params.phoneNumberId) {
      continue;
    }

    const condition = flow.triggerCondition || 'exact';
    const flowKeywords = (flow.keywords || []).map((k) => k.trim().toUpperCase());

    if (condition === 'anything_else') {
      matchedFlow = flow;
      break;
    }

    const isMatch = flowKeywords.some((kw) => {
      if (!kw) return false;
      if (condition === 'exact') return upperText === kw;
      if (condition === 'contains') return upperText.includes(kw);
      if (condition === 'begins_with') return upperText.startsWith(kw);
      if (condition === 'ends_with') return upperText.endsWith(kw);
      if (condition === 'whole_word') {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        return regex.test(params.messageText);
      }
      return upperText.includes(kw);
    });

    if (isMatch) {
      matchedFlow = flow;
      break;
    }
  }

  // 5. If matched, execute bot's response step!
  if (matchedFlow) {
    // Increment trigger counter
    const flowRef = doc(db, 'organizations', orgId, 'botFlows', matchedFlow.id);
    await updateDoc(flowRef, {
      totalTriggeredCount: (matchedFlow.totalTriggeredCount || 0) + 1,
      lastTriggeredAt: new Date().toISOString(),
    }).catch(() => {});

    // Find first step
    const firstStep =
      matchedFlow.steps.find((s) => s.id === matchedFlow.initialStepId) ||
      matchedFlow.steps[0];

    if (firstStep) {
      const botNow = new Date(Date.now() + 400).toISOString();
      const botMsgId = `msg_bot_${Date.now()}`;
      const botMsgRef = doc(db, 'organizations', orgId, 'messages', botMsgId);

      const botPayload = removeUndefined({
        id: botMsgId,
        whatsAppAccountId: params.accountId || 'test_account',
        contactId: cleanPhone,
        conversationId: convId,
        direction: 'outbound',
        messageType:
          firstStep.type === 'interactive_button'
            ? 'interactive'
            : firstStep.type === 'media'
            ? firstStep.mediaType || 'document'
            : 'text',
        messageStatus: 'sent',
        headerText: firstStep.headerText,
        body: firstStep.body || 'How can we help you?',
        mediaUrl: firstStep.mediaUrl,
        mediaFileName: firstStep.mediaFileName,
        buttons: firstStep.buttons,
        timestamp: botNow,
      });

      await setDoc(botMsgRef, botPayload);

      // Update conversation with bot reply
      await updateDoc(convRef, {
        lastMessage: firstStep.body || 'Chatbot Response',
        lastMessageAt: botNow,
      }).catch(() => {});

      // Optionally dispatch via Meta API if real token exists
      if (params.phoneNumberId && params.customToken) {
        try {
          await fetch('/api/meta/send-message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-meta-token': params.customToken,
            },
            body: JSON.stringify({
              phoneNumberId: params.phoneNumberId,
              recipientPhone: cleanPhone,
              body: firstStep.body,
              type: firstStep.type === 'interactive_button' ? 'text' : firstStep.type,
              mediaUrl: firstStep.mediaUrl,
              customToken: params.customToken,
            }),
          });
        } catch {
          // ignore network issue in simulation
        }
      }

      return {
        matched: true,
        flowName: matchedFlow.name,
        botStep: firstStep,
      };
    }
  }

  return { matched: false };
}

export async function handleInboxButtonClick(
  orgId: string,
  params: {
    conversationId: string;
    contactPhone: string;
    contactName: string;
    button: BotButton;
    accountId?: string;
  }
) {
  // 1. Add user click message
  const now = new Date().toISOString();
  const clickMsgId = `msg_click_${Date.now()}`;
  await setDoc(
    doc(db, 'organizations', orgId, 'messages', clickMsgId),
    removeUndefined({
      id: clickMsgId,
      whatsAppAccountId: params.accountId || 'test_account',
      contactId: params.contactPhone,
      conversationId: params.conversationId,
      direction: 'inbound',
      messageType: 'text',
      messageStatus: 'delivered',
      body: params.button.title,
      timestamp: now,
    })
  );

  // 2. If action is next_step and targetStepId is provided, find that step across botFlows
  if (params.button.action === 'next_step' && params.button.targetStepId) {
    const flowsSnap = await getDocs(collection(db, `organizations/${orgId}/botFlows`));
    let nextStep: BotStep | null = null;
    flowsSnap.forEach((d) => {
      const f = d.data() as BotFlow;
      const found = f.steps?.find((s) => s.id === params.button.targetStepId);
      if (found) nextStep = found;
    });

    if (nextStep) {
      const botNow = new Date(Date.now() + 400).toISOString();
      const botMsgId = `msg_bot_${Date.now()}`;
      await setDoc(
        doc(db, 'organizations', orgId, 'messages', botMsgId),
        removeUndefined({
          id: botMsgId,
          whatsAppAccountId: params.accountId || 'test_account',
          contactId: params.contactPhone,
          conversationId: params.conversationId,
          direction: 'outbound',
          messageType:
            (nextStep as any).type === 'interactive_button'
              ? 'interactive'
              : (nextStep as any).type === 'media'
              ? (nextStep as any).mediaType || 'document'
              : 'text',
          messageStatus: 'sent',
          headerText: (nextStep as any).headerText,
          body: (nextStep as any).body,
          mediaUrl: (nextStep as any).mediaUrl,
          mediaFileName: (nextStep as any).mediaFileName,
          buttons: (nextStep as any).buttons,
          timestamp: botNow,
        })
      );

      await updateDoc(doc(db, 'organizations', orgId, 'conversations', params.conversationId), {
        lastMessage: (nextStep as any).body || 'Chatbot Response',
        lastMessageAt: botNow,
      }).catch(() => {});
    }
  } else if (params.button.action === 'assign_agent') {
    const botNow = new Date(Date.now() + 400).toISOString();
    const botMsgId = `msg_bot_${Date.now()}`;
    await setDoc(
      doc(db, 'organizations', orgId, 'messages', botMsgId),
      removeUndefined({
        id: botMsgId,
        whatsAppAccountId: params.accountId || 'test_account',
        contactId: params.contactPhone,
        conversationId: params.conversationId,
        direction: 'outbound',
        messageType: 'text',
        messageStatus: 'sent',
        body: '👨‍💼 Support team has been assigned to your chat. An agent will connect with you shortly.',
        timestamp: botNow,
      })
    );
  }
}

/**
 * Completely purges Super Admin and Administrator data from Firestore
 */
export async function cleanupAdminAndSuperAdminData(): Promise<void> {
  try {
    const toDeleteUsers = ['super_master_admin_9974428034', 'admin_master_12345689'];
    const toDeleteOrgs = ['org_super_master', 'org_admin_12345689'];

    for (const uid of toDeleteUsers) {
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (e) {}
    }

    for (const orgId of toDeleteOrgs) {
      try {
        await deleteDoc(doc(db, 'organizations', orgId));
      } catch (e) {}
    }

    // Clean up any residual users with phone 12345689 or email wp-api-palan
    try {
      const q = query(collection(db, 'users'), where('phone', '==', '12345689'));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
    } catch (e) {}
  } catch (err) {
    console.warn('cleanupAdminAndSuperAdminData notice:', err);
  }
}

/**
 * Legacy stub - now triggers cleanup instead of provisioning admin
 */
export async function ensureDefaultAdminAccount(): Promise<void> {
  await cleanupAdminAndSuperAdminData();
}

/**
 * Real-time subscription to managed users
 */
export function subscribeManagedUsers(
  onNext: (users: UserProfile[]) => void,
  onError?: (err: any) => void
): () => void {
  const usersRef = collection(db, 'users');
  return onSnapshot(
    usersRef,
    (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        list.push({ uid: d.id, ...(d.data() as any) });
      });
      onNext(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
      onError?.(err);
    }
  );
}

/**
 * Real-time subscription to organizations
 */
export function subscribeOrganizations(
  onNext: (orgs: Organization[]) => void,
  onError?: (err: any) => void
): () => void {
  const orgsRef = collection(db, 'organizations');
  return onSnapshot(
    orgsRef,
    (snap) => {
      const list: Organization[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as any) });
      });
      onNext(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'organizations');
      onError?.(err);
    }
  );
}

/**
 * Real-time subscription to global Meta configuration
 */
export function subscribeGlobalMetaConfig(
  onNext: (config: any) => void
): () => void {
  const cfgRef = doc(db, 'system_config', 'meta_global');
  return onSnapshot(
    cfgRef,
    (snap) => {
      if (snap.exists()) {
        onNext(snap.data());
      } else {
        onNext(null);
      }
    },
    (err) => {
      console.warn('subscribeGlobalMetaConfig notice:', err);
    }
  );
}

/**
 * Creates a managed user and provisions their organization
 */
export async function createManagedUser(
  creatorId: string,
  params: {
    displayName: string;
    phoneOrEmail: string;
    password?: string;
    role?: UserRole;
    maxWhatsAppNumbers?: number;
    maxMonthlyBroadcasts?: number;
    maxContacts?: number;
    validityDays?: number;
    planName?: string;
    coexistenceAllowed?: boolean;
    managedByAdminId?: string;
  }
): Promise<string> {
  const cleanId = params.phoneOrEmail.replace(/[^0-9a-zA-Z]/g, '_');
  const userId = `user_${cleanId}_${Date.now().toString(36)}`;
  const orgId = `org_${cleanId}_${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const validityDays = params.validityDays || 30;
  const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();

  const isEmail = params.phoneOrEmail.includes('@');
  const userDoc: UserProfile = {
    uid: userId,
    email: isEmail ? params.phoneOrEmail : `${cleanId}@wp-api-palan.vercel.app`,
    displayName: params.displayName,
    phone: isEmail ? undefined : params.phoneOrEmail,
    role: params.role || 'owner',
    organizationId: orgId,
    loginPassword: params.password || '12345678',
    managedByAdminId: params.managedByAdminId,
    subscription: {
      planName: params.planName || 'standard',
      maxWhatsAppNumbers: params.maxWhatsAppNumbers || 1,
      maxMonthlyBroadcasts: params.maxMonthlyBroadcasts || 1000,
      maxContacts: params.maxContacts || 1000,
      expiresAt: expiresAt,
      status: 'active',
      coexistenceAllowed: params.coexistenceAllowed ?? true,
    },
    createdAt: now,
    updatedAt: now,
  };

  const orgDoc: Organization = {
    id: orgId,
    name: `${params.displayName}'s Organization`,
    ownerId: userId,
    status: 'active',
    subscription: userDoc.subscription,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'users', userId), removeUndefined(userDoc));
  await setDoc(doc(db, 'organizations', orgId), removeUndefined(orgDoc));

  return userId;
}

/**
 * Updates managed user subscription limits, credentials, or admin assignment
 */
export async function updateManagedUserSubscription(
  uid: string,
  orgId: string,
  updates: {
    loginPassword?: string;
    maxWhatsAppNumbers?: number;
    maxMonthlyBroadcasts?: number;
    expiresAt?: string;
    status?: string;
    managedByAdminId?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const userUpdates: any = {
    updatedAt: now,
  };

  if (updates.loginPassword !== undefined) {
    userUpdates.loginPassword = updates.loginPassword;
  }
  if (updates.managedByAdminId !== undefined) {
    userUpdates.managedByAdminId = updates.managedByAdminId;
  }

  if (
    updates.maxWhatsAppNumbers !== undefined ||
    updates.maxMonthlyBroadcasts !== undefined ||
    updates.expiresAt !== undefined ||
    updates.status !== undefined
  ) {
    if (updates.maxWhatsAppNumbers !== undefined) {
      userUpdates['subscription.maxWhatsAppNumbers'] = updates.maxWhatsAppNumbers;
    }
    if (updates.maxMonthlyBroadcasts !== undefined) {
      userUpdates['subscription.maxMonthlyBroadcasts'] = updates.maxMonthlyBroadcasts;
    }
    if (updates.expiresAt !== undefined) {
      userUpdates['subscription.expiresAt'] = updates.expiresAt;
    }
    if (updates.status !== undefined) {
      userUpdates['subscription.status'] = updates.status;
    }
  }

  await updateDoc(doc(db, 'users', uid), removeUndefined(userUpdates));

  if (orgId) {
    const orgUpdates: any = { updatedAt: now };
    if (updates.status !== undefined) {
      orgUpdates.status = updates.status;
    }
    await updateDoc(doc(db, 'organizations', orgId), removeUndefined(orgUpdates)).catch(() => {});
  }
}

/**
 * Deletes managed user and optionally their organization
 */
export async function deleteManagedUser(uid: string, orgId?: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid));
  if (orgId) {
    await deleteDoc(doc(db, 'organizations', orgId)).catch(() => {});
  }
}

/**
 * Saves Meta configuration for an organization and optionally syncs globally
 */
export async function saveOrganizationMetaConfig(
  orgId: string,
  config: {
    appId?: string;
    appSecret?: string;
    configId?: string;
    systemUserToken?: string;
    wabaId?: string;
  },
  syncGlobally?: boolean
): Promise<void> {
  const cleanConfig = removeUndefined({
    appId: config.appId,
    appSecret: config.appSecret,
    configId: config.configId,
    systemToken: config.systemUserToken,
    systemUserToken: config.systemUserToken,
    wabaId: config.wabaId,
  });

  if (orgId) {
    await setDoc(
      doc(db, 'organizations', orgId),
      {
        metaAppConfig: cleanConfig,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  if (syncGlobally) {
    await setDoc(
      doc(db, 'system_config', 'meta_global'),
      {
        ...cleanConfig,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Also update server-side Meta config endpoint
    try {
      await fetch('/api/meta/admin-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: config.appId,
          appSecret: config.appSecret,
          configId: config.configId,
          systemToken: config.systemUserToken,
        }),
      });
    } catch {
      // server sync best-effort
    }
  }
}

/**
 * Reassigns client user to a different sub-admin
 */
export async function reassignUserToAdmin(userId: string, targetAdminId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    managedByAdminId: targetAdminId,
    updatedAt: new Date().toISOString(),
  });
}

