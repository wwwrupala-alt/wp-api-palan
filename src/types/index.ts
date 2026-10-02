export type UserRole = 'master_admin' | 'owner' | 'admin' | 'agent' | 'sub_admin';

export interface UserSubscription {
  planName?: string;
  maxWhatsAppNumbers?: number;
  maxMonthlyBroadcasts?: number;
  maxContacts?: number;
  maxTeamMembers?: number;
  customBranding?: boolean;
  expiresAt?: string;
  status?: 'active' | 'expired' | 'suspended' | string;
  coexistenceAllowed?: boolean;
  notes?: string;
}

export interface OrganizationMetaConfig {
  appId?: string;
  appSecret?: string;
  configId?: string;
  verifyToken?: string;
  systemToken?: string;
  systemUserToken?: string;
  wabaId?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  phone?: string;
  loginPassword?: string;
  managedByAdminId?: string;
  subscription?: UserSubscription;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  status: 'active' | 'suspended';
  metaAppConfig?: OrganizationMetaConfig;
  subscription?: UserSubscription;
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

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface CampaignStats {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  deliveryRate: number; // percentage (delivered / sent * 100)
  readRate: number;     // percentage (read / delivered * 100)
  failureRate: number;  // percentage (failed / total * 100)
  replyRate: number;    // percentage (replied / delivered * 100)
  linkClicks?: number;
  buttonClicks?: number;
}

export interface MessageTimelineEvent {
  status: MessageStatus | 'replied';
  timestamp: string;
  description: string;
  details?: string;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  campaignName?: string;
  organizationId: string;
  customerName: string;
  phoneNumber: string;
  phone?: string;
  whatsappMessageId?: string; // wamid
  messageType?: 'template' | 'text' | 'image' | 'video' | 'document' | 'interactive';
  templateName?: string;
  currentStatus: MessageStatus;
  status?: string;
  receivedDate?: string;
  acknowledgement?: string;
  cost?: string | number;
  errorDetails?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  repliedAt?: string;
  hasReplied?: boolean;
  failureCode?: string;
  failureReason?: string;
  timeline: MessageTimelineEvent[];
  rawWebhookData?: any;
  variableValues?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type CampaignRecipientRecord = CampaignRecipient;

export interface Campaign {
  id: string;
  name: string;
  whatsAppAccountId: string;
  templateId: string;
  templateName?: string;
  templateCategory?: string;
  template?: Template;
  headerMediaUrl?: string;
  variableValues?: Record<string, string>;
  recipients?: CampaignRecipient[];
  recipientCount: number;
  groupId?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'cancelled' | 'failed';
  scheduledAt?: string;
  startedAt?: string;
  createdAt: string;
  completedAt?: string;
  stats?: CampaignStats;
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
  headerText?: string;
  mediaUrl?: string;
  mediaFileName?: string;
  buttons?: BotButton[];
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

export interface BotButton {
  id: string;
  title: string; // up to 20 chars (Meta limit)
  action: 'next_step' | 'url' | 'call' | 'assign_agent';
  targetStepId?: string;
  url?: string;
  phoneNumber?: string;
}

export interface BotListRow {
  id: string;
  title: string; // up to 24 chars
  description?: string; // up to 72 chars
  targetStepId?: string;
}

export interface BotListSection {
  title: string;
  rows: BotListRow[];
}

export interface BotStep {
  id: string;
  title: string;
  type: 'interactive_button' | 'interactive_list' | 'media' | 'text' | 'agent_transfer';
  headerType?: 'none' | 'text' | 'image' | 'video' | 'document';
  headerText?: string;
  headerMediaUrl?: string;
  body: string;
  footer?: string;
  // Interactive buttons (up to 3 Meta buttons)
  buttons?: BotButton[];
  // Interactive list menu
  listButtonText?: string; // e.g. "Select Option"
  listSections?: BotListSection[];
  // Media attachments
  mediaType?: 'image' | 'document' | 'video' | 'audio';
  mediaUrl?: string;
  mediaCaption?: string;
  mediaFileName?: string;
  // Fallback / Auto-delay
  autoNextStepId?: string;
}

export type TriggerCondition =
  | 'contains'
  | 'exact'
  | 'whole_word'
  | 'begins_with'
  | 'ends_with'
  | 'anything_else';

export type TriggerScope = 'all' | 'individuals_only';

export interface BotFlow {
  id: string;
  name: string;
  description?: string;
  phoneNumberId?: string; // Specific connected WhatsApp number or undefined / 'all'
  displayPhoneNumber?: string;
  triggerType: 'keyword' | 'welcome' | 'fallback';
  triggerCondition?: TriggerCondition;
  triggerScope?: TriggerScope;
  keywords: string[]; // e.g. ['HI', 'HELLO', 'MENU', 'START']
  initialStepId: string;
  steps: BotStep[];
  enabled: boolean;
  totalTriggeredCount?: number;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
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
