import {
  collection,
  doc,
  getDoc,
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
  UserProfile,
  Organization,
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
export function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        clean[key] = removeUndefined(value);
      } else {
        clean[key] = value;
      }
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
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
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
  variableValues?: Record<string, string>
) {
  // Update status to sending
  const campRef = doc(db, 'organizations', orgId, 'campaigns', campaignId);
  await updateDoc(campRef, { status: 'sending' });

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
      }),
    });

    const data = await parseJsonResponse(res, 'Failed to dispatch campaign.');

    await updateDoc(campRef, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      stats: data.stats,
    });

    return data.stats;
  } catch (err) {
    await updateDoc(campRef, { status: 'failed' });
    throw err;
  }
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
// ADMIN MULTI-TENANT USER & SUBSCRIPTION MANAGEMENT
// -------------------------------------------------------------

export function subscribeManagedUsers(
  onData: (users: UserProfile[]) => void,
  onError: (err: unknown) => void
) {
  // Query all users without orderBy to avoid dropping documents without createdAt
  const q = collection(db, 'users');
  return onSnapshot(
    q,
    (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((d) => {
        list.push({ uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) });
      });
      // Sort in-memory by newest first
      list.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return timeB - timeA;
      });
      onData(list);
    },
    (err) => {
      onError(err);
    }
  );
}

// Ensure the Primary Administrator account (12345689 / 123456789) is seeded in Firestore
export async function ensureDefaultAdminAccount(): Promise<void> {
  const adminUid = 'admin_master_12345689';
  const orgId = 'org_admin_12345689';

  try {
    const userRef = doc(db, 'users', adminUid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      const now = new Date().toISOString();
      const orgRef = doc(db, 'organizations', orgId);
      await setDoc(
        orgRef,
        {
          name: 'Administrator Portal Org',
          ownerId: adminUid,
          status: 'active',
          subscription: {
            planName: 'enterprise',
            maxWhatsAppNumbers: 50,
            maxMonthlyBroadcasts: 500000,
            maxContacts: 500000,
            expiresAt: '2099-12-31T23:59:59.000Z',
            status: 'active',
            coexistenceAllowed: true,
            notes: 'Primary Sub-Administrator Account',
          },
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      await setDoc(
        userRef,
        {
          uid: adminUid,
          email: 'admin@wp-api-palan.vercel.app',
          displayName: 'Administrator (Sub-Admin)',
          phone: '12345689',
          role: 'admin',
          organizationId: orgId,
          loginPassword: '123456789',
          subscription: {
            planName: 'enterprise',
            maxWhatsAppNumbers: 50,
            maxMonthlyBroadcasts: 500000,
            maxContacts: 500000,
            expiresAt: '2099-12-31T23:59:59.000Z',
            status: 'active',
            coexistenceAllowed: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn('ensureDefaultAdminAccount notice:', err);
  }
}

// Reassign user to a specific Admin
export async function reassignUserToAdmin(userId: string, newAdminId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await setDoc(
    userRef,
    {
      managedByAdminId: newAdminId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

// Global Platform Meta App configuration listener
export function subscribeGlobalMetaConfig(
  onData: (config: any) => void
) {
  const globalRef = doc(db, 'system_settings', 'meta_config');
  return onSnapshot(
    globalRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onData(snapshot.data());
      } else {
        // Fallback to localStorage cache
        try {
          const cached = localStorage.getItem('cw_global_meta_config');
          if (cached) onData(JSON.parse(cached));
        } catch (e) {}
      }
    },
    () => {
      try {
        const cached = localStorage.getItem('cw_global_meta_config');
        if (cached) onData(JSON.parse(cached));
      } catch (e) {}
    }
  );
}

export function subscribeOrganizations(
  onData: (orgs: Organization[]) => void,
  onError: (err: unknown) => void
) {
  const q = collection(db, 'organizations');
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Organization[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<Organization, 'id'>) });
      });
      onData(list);
    },
    (err) => {
      onError(err);
    }
  );
}

export async function createManagedUser(
  adminUid: string,
  data: {
    displayName: string;
    phoneOrEmail: string;
    password: string;
    role: 'owner' | 'admin' | 'agent';
    maxWhatsAppNumbers: number;
    maxMonthlyBroadcasts: number;
    maxContacts: number;
    validityDays: number;
    planName: 'trial' | 'basic' | 'pro' | 'enterprise';
    coexistenceAllowed: boolean;
    managedByAdminId?: string;
  }
) {
  const cleanId = data.phoneOrEmail.trim().replace(/\s+/g, '');
  const uid = `user_${cleanId.replace(/[^0-9a-zA-Z]/g, '_')}`;
  const orgId = `org_${cleanId.replace(/[^0-9a-zA-Z]/g, '_')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + data.validityDays * 24 * 60 * 60 * 1000).toISOString();

  // 1. Create separate Organization tenant for this user
  const orgRef = doc(db, 'organizations', orgId);
  await setDoc(orgRef, {
    name: `${data.displayName}'s Organization`,
    ownerId: uid,
    status: 'active',
    subscription: {
      planName: data.planName,
      maxWhatsAppNumbers: data.maxWhatsAppNumbers,
      maxMonthlyBroadcasts: data.maxMonthlyBroadcasts,
      maxContacts: data.maxContacts,
      expiresAt,
      status: 'active',
      coexistenceAllowed: data.coexistenceAllowed,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  // 2. Create User document with credential login & subscription limits
  const userRef = doc(db, 'users', uid);
  const userProfile: UserProfile = {
    uid,
    email: cleanId.includes('@') ? cleanId : `${cleanId}@cloudwaba.internal`,
    phone: cleanId.replace(/[^0-9+]/g, ''),
    displayName: data.displayName,
    role: data.role,
    organizationId: orgId,
    loginPassword: data.password.trim(),
    managedByAdminId: data.managedByAdminId || adminUid,
    subscription: {
      planName: data.planName,
      maxWhatsAppNumbers: data.maxWhatsAppNumbers,
      maxMonthlyBroadcasts: data.maxMonthlyBroadcasts,
      maxContacts: data.maxContacts,
      expiresAt,
      status: 'active',
      coexistenceAllowed: data.coexistenceAllowed,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await setDoc(userRef, userProfile);
  return { uid, orgId, userProfile };
}

export async function updateManagedUserSubscription(
  uid: string,
  orgId: string,
  updates: {
    loginPassword?: string;
    maxWhatsAppNumbers?: number;
    maxMonthlyBroadcasts?: number;
    maxContacts?: number;
    expiresAt?: string;
    status?: 'active' | 'expired' | 'suspended';
    planName?: 'trial' | 'basic' | 'pro' | 'enterprise';
    coexistenceAllowed?: boolean;
    notes?: string;
    managedByAdminId?: string;
  }
) {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    throw new Error('User not found in system.');
  }

  const existing = userSnap.data() as UserProfile;
  const currentSub = existing.subscription || {
    planName: 'basic',
    maxWhatsAppNumbers: 1,
    maxMonthlyBroadcasts: 1000,
    maxContacts: 500,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    coexistenceAllowed: true,
  };

  const updatedSubscription = {
    ...currentSub,
    ...(updates.planName ? { planName: updates.planName } : {}),
    ...(updates.maxWhatsAppNumbers !== undefined ? { maxWhatsAppNumbers: updates.maxWhatsAppNumbers } : {}),
    ...(updates.maxMonthlyBroadcasts !== undefined ? { maxMonthlyBroadcasts: updates.maxMonthlyBroadcasts } : {}),
    ...(updates.maxContacts !== undefined ? { maxContacts: updates.maxContacts } : {}),
    ...(updates.expiresAt ? { expiresAt: updates.expiresAt } : {}),
    ...(updates.status ? { status: updates.status } : {}),
    ...(updates.coexistenceAllowed !== undefined ? { coexistenceAllowed: updates.coexistenceAllowed } : {}),
    ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
  };

  // Update user doc
  await updateDoc(userRef, {
    ...(updates.loginPassword ? { loginPassword: updates.loginPassword } : {}),
    ...(updates.managedByAdminId !== undefined ? { managedByAdminId: updates.managedByAdminId } : {}),
    subscription: updatedSubscription,
    updatedAt: new Date().toISOString(),
  });

  // Sync with organization doc
  if (orgId) {
    const orgRef = doc(db, 'organizations', orgId);
    await updateDoc(orgRef, {
      subscription: updatedSubscription,
      ...(updates.status ? { status: updates.status === 'suspended' ? 'suspended' : 'active' } : {}),
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function deleteManagedUser(uid: string, orgId: string) {
  const userRef = doc(db, 'users', uid);
  await deleteDoc(userRef);

  if (orgId && orgId !== 'org_admin_master') {
    const orgRef = doc(db, 'organizations', orgId);
    await deleteDoc(orgRef);
  }
}

export async function saveOrganizationMetaConfig(
  orgId: string,
  metaConfig: {
    appId: string;
    appSecret?: string;
    configId: string;
    systemUserToken?: string;
    wabaId?: string;
  },
  applyGlobally: boolean = true
) {
  const fullMetaConfig = {
    appId: metaConfig.appId || '',
    appSecret: metaConfig.appSecret || '',
    configId: metaConfig.configId || '',
    systemUserToken: metaConfig.systemUserToken || '',
    wabaId: metaConfig.wabaId || '',
    validOAuthRedirectUris: [
      'https://wp-api-palan.vercel.app/',
      'https://wp-api-palan.vercel.app/api/meta/oauth/callback',
    ],
    webhookCallbackUrl: 'https://wp-api-palan.vercel.app/api/meta/webhook',
    webhookVerifyToken: 'cloudwaba_verify_token_secure',
    graphVersion: 'v22.0',
    privacyPolicyUrl: 'https://wp-api-palan.vercel.app/privacy-policy',
    termsOfServiceUrl: 'https://wp-api-palan.vercel.app/terms-of-service',
    updatedAt: new Date().toISOString(),
  };

  // 1. Sync with server backend proxy store
  try {
    await fetch('/api/meta/admin-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: metaConfig.appId,
        appSecret: metaConfig.appSecret,
        configId: metaConfig.configId,
        systemUserToken: metaConfig.systemUserToken,
        wabaId: metaConfig.wabaId,
      }),
    });
  } catch (apiErr) {
    console.warn('Notice: Server API meta-config sync error:', apiErr);
  }

  // 2. Always persist Global Platform Meta Config so all Admin panels stay synchronized!
  try {
    localStorage.setItem('cw_global_meta_config', JSON.stringify(fullMetaConfig));
    if (orgId) {
      localStorage.setItem(`cw_meta_config_${orgId}`, JSON.stringify(fullMetaConfig));
    }
  } catch (e) {}

  if (applyGlobally) {
    try {
      const globalRef = doc(db, 'system_settings', 'meta_config');
      await setDoc(globalRef, removeUndefined(fullMetaConfig), { merge: true });
    } catch (gErr) {
      console.warn('Global meta config doc notice:', gErr);
    }

    // Sync to root master and primary admin orgs
    const keyOrgs = ['org_super_master', 'org_admin_12345689'];
    for (const kOrg of keyOrgs) {
      try {
        const kRef = doc(db, 'organizations', kOrg);
        await setDoc(
          kRef,
          {
            metaAppConfig: removeUndefined(fullMetaConfig),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (kErr) {}
    }
  }

  // 3. Persist in specific tenant Organization
  if (orgId && orgId !== 'org_super_master' && orgId !== 'org_admin_12345689') {
    try {
      const orgRef = doc(db, 'organizations', orgId);
      await setDoc(
        orgRef,
        {
          metaAppConfig: removeUndefined(fullMetaConfig),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (fsErr: any) {
      console.warn('Firestore metaAppConfig save notice:', fsErr);
    }
  }

  return fullMetaConfig;
}
