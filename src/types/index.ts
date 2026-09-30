export type UserRole = 'master_admin' | 'owner' | 'admin' | 'agent';

export interface UserSubscription {
  planName: 'trial' | 'basic' | 'pro' | 'enterprise';
  maxWhatsAppNumbers: number;
  maxMonthlyBroadcasts: number;
  maxContacts: number;
  expiresAt: string; // ISO date string
  status: 'active' | 'expired' | 'suspended';
  coexistenceAllowed: boolean;
  notes?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  photoURL?: string;
  role: UserRole;
  organizationId: string;
  loginPassword?: string; // Stored securely for Admin credential management
  subscription?: UserSubscription;
  managedByAdminId?: string; // Hierarchical tracking for future Master Admin
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  status: 'active' | 'suspended';
  subscription?: UserSubscription;
  metaAppConfig?: {
    appId?: string;
    appSecret?: string;
    configId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  uid: string;
  email: string;
  role: UserRole;
  joinedAt: string;
}

export interface WhatsAppAccount {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  businessId?: string;
  customToken?: string;
  pin?: string;
  connectionStatus: 'connected' | 'disconnected' | 'pending';
  webhookStatus: 'active' | 'unverified' | 'error';
  qualityRating?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  groups: string[];
  customFields?: Record<string, string>;
  optInStatus: 'opted_in' | 'opted_out' | 'pending';
  createdAt: string;
  updatedAt: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  description?: string;
  contactCount: number;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  whatsAppAccountId: string;
  templateId: string;
  templateName?: string;
  recipientCount: number;
  groupId?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'cancelled' | 'failed';
  scheduledAt?: string;
  createdAt: string;
  completedAt?: string;
  stats?: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
}

export interface Message {
  id: string;
  whatsAppAccountId: string;
  contactId: string;
  conversationId?: string;
  campaignId?: string;
  direction: 'inbound' | 'outbound';
  messageType: 'text' | 'image' | 'video' | 'document' | 'audio' | 'template' | 'interactive';
  messageStatus: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  metaMessageId?: string;
  body?: string;
  mediaUrl?: string;
  errorInfo?: string;
  timestamp: string;
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

export interface Template {
  id: string;
  metaTemplateId?: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED';
  components: TemplateComponent[];
  whatsAppAccountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  contactPhone: string;
  contactName: string;
  whatsAppAccountId: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  assignedUser?: string;
  status: 'open' | 'resolved' | 'pending';
}

export interface Automation {
  id: string;
  trigger: string;
  triggerType: 'keyword_exact' | 'keyword_contains' | 'welcome' | 'fallback';
  keyword?: string;
  responseType: 'text' | 'image' | 'document' | 'template' | 'assign_agent';
  responseContent: string;
  mediaUrl?: string;
  mediaName?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookLog {
  id: string;
  timestamp: string;
  event: string;
  origin: string;
  details: string;
  status: 'success' | 'warning' | 'error';
}

export interface MetaConfigStatus {
  isConfigured: boolean;
  appIdSet: boolean;
  appId?: string;
  configId?: string;
  appSecretSet: boolean;
  webhookVerifyTokenSet: boolean;
  systemTokenSet: boolean;
  webhookUrl: string;
  webhookVerifyToken?: string;
  graphVersion: string;
}
