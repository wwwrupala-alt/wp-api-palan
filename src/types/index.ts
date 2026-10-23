export type UserRole = 'master_admin' | 'admin' | 'user' | 'owner' | 'sub_admin';

export interface SaaSPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  validityDays: number;
  maxWhatsAppNumbers: number;
  maxUsers: number;
  maxContacts: number;
  maxTemplates: number;
  maxCampaigns: number;
  maxMessages: number;
  features: {
    whatsapp_connection: boolean;
    templates: boolean;
    campaigns: boolean;
    broadcast: boolean;
    contacts: boolean;
    analytics: boolean;
    automations: boolean;
    api_access: boolean;
    coexistence_mode: boolean;
    export_data: boolean;
  };
  status: 'active' | 'inactive';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetId?: string;
  targetType?: string;
  organizationId?: string;
  details: string;
  ip?: string;
}

export interface UserSubscription {
  planId?: string;
  planName?: string;
  price?: number;
  currency?: string;
  maxWhatsAppNumbers?: number;
  maxMonthlyBroadcasts?: number;
  maxContacts?: number;
  maxUsers?: number;
  maxTeamMembers?: number;
  customBranding?: boolean;
  startDate?: string;
  expiresAt?: string;
  validityDays?: number;
  status?: 'active' | 'expiring_soon' | 'expired' | 'suspended' | string;
  coexistenceAllowed?: boolean;
  features?: Record<string, boolean>;
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
  graphVersion?: string;
  updatedAt?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  phone?: string;
  loginPassword?: string;
  displayPassword?: string;
  managedByAdminId?: string;
  adminOrganizationId?: string;
  subscription?: UserSubscription;
  canAccessSettingsMetaApi?: boolean;
  canAccessAutomations?: boolean;
  canWatchWorkspaceLive?: boolean;
  canAccessInbox?: boolean;
  canAccessDripCampaigns?: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  adminId?: string;
  parentOrganizationId?: string;
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
  businessPortfolioId?: string;
  businessPortfolioName?: string;
  businessVerificationStatus?: 'VERIFIED' | 'NOT_VERIFIED' | 'PENDING' | 'REVOKED' | 'EXPIRED' | string;
  accountReviewStatus?: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED' | string;
  nameStatus?: string;
  currency?: string;
  primaryFundingId?: string;
  paymentAccountId?: string;
  paymentMethodStatus?: 'LINKED' | 'NOT_SET' | 'EXEMPT';
  paymentMethodType?: string;
  prepaidBalance?: {
    amount: number;
    currency: string;
    lastUpdated?: string;
    source?: 'meta_synced' | 'manual_logged';
    rechargeHistory?: Array<{
      id: string;
      date: string;
      amount: number;
      currency: string;
      note?: string;
    }>;
  };
  customToken?: string;
  pin?: string;
  connectionStatus: 'connected' | 'disconnected' | 'pending';
  webhookStatus: 'active' | 'unverified' | 'error';
  qualityRating?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  messagingLimitTier?: 'TIER_50' | 'TIER_250' | 'TIER_1K' | 'TIER_10K' | 'TIER_100K' | 'TIER_UNLIMITED' | 'TIER_NOT_SET' | string;
  messagingLimitLabel?: string;
  maxDailyConversations?: number;
  throughputLevel?: string;
  tokenHealth?: {
    healthStatus: 'HEALTHY' | 'EXPIRING_SOON' | 'EXPIRED' | 'INSUFFICIENT_PERMISSIONS' | 'INVALID_TOKEN' | 'PHONE_ERROR' | 'NO_TOKEN' | string;
    isPermanent?: boolean;
    isNearExpiry?: boolean;
    isExpired?: boolean;
    expiresAt?: string | null;
    expiresInDays?: number | null;
    missingPermissions?: string[];
    checkedAt: string;
    appId?: string;
    application?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionHealthReport {
  success: boolean;
  healthStatus: 'HEALTHY' | 'EXPIRING_SOON' | 'EXPIRED' | 'INSUFFICIENT_PERMISSIONS' | 'INVALID_TOKEN' | 'PHONE_ERROR' | 'NO_TOKEN' | 'ERROR';
  statusSummary: string;
  checkedAt: string;
  token?: {
    isValid: boolean;
    tokenType: string;
    isPermanent: boolean;
    isExpired: boolean;
    isNearExpiry: boolean;
    expiresAt: string | null;
    expiresInSeconds: number | null;
    expiresInDays: number | null;
    expiresInHours: number | null;
    appId?: string;
    application?: string;
  };
  permissions?: {
    hasSufficientPermissions: boolean;
    grantedScopes: string[];
    missingRequiredScopes: string[];
    requiredScopes: string[];
  };
  phone?: {
    reachable: boolean;
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    status?: string;
    codeVerificationStatus?: string;
    error?: string;
  };
  error?: string;
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
  whatsAppAccountId?: string;
  phoneNumberId?: string;
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
  phoneNumberId?: string;
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
  cancelledAt?: string;
  stats?: CampaignStats;
  scheduleData?: any;
}

export interface DripStep {
  id: string;
  stepNumber: number;
  title: string;
  delayValue: number;
  delayUnit: 'minutes' | 'hours' | 'days';
  templateId: string;
  templateName: string;
  templateCategory?: string;
  template?: Template;
  headerMediaUrl?: string;
  headerMediaId?: string;
  variableValues?: Record<string, string>;
  condition?: 'always' | 'if_not_replied' | 'if_read';
  stats?: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  nextExecutionAt?: string | null;
  waitingSubscribers?: number;
}

export interface DripSubscriberLog {
  stepNumber: number;
  templateName: string;
  sentAt: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
  metaMessageId?: string;
  error?: string;
  note?: string;
}

export interface DripSubscriber {
  id: string;
  dripCampaignId: string;
  organizationId: string;
  phone: string;
  name?: string;
  currentStep: number;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  enrolledAt: string;
  lastStepSentAt?: string;
  nextExecutionAt?: string;
  stepHistory?: DripSubscriberLog[];
}

export interface DripCampaign {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  whatsAppAccountId: string;
  status: 'active' | 'paused' | 'draft' | 'completed';
  triggerType: 'group_enrollment' | 'manual_contacts' | 'all_opted_in';
  targetGroupId?: string;
  steps: DripStep[];
  enrolledCount: number;
  activeSubscribers: number;
  completedSubscribers: number;
  stats?: {
    totalMessagesSent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  createdAt: string;
  updatedAt: string;
  lastScannedAt?: string;
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
  action: 'next_step' | 'url' | 'call' | 'assign_agent' | 'none';
  targetStepId?: string;
  targetStepIds?: string[];
  url?: string;
  phoneNumber?: string;
}

export interface BotListRow {
  id: string;
  title: string; // up to 24 chars
  description?: string; // up to 72 chars
  targetStepId?: string;
  targetStepIds?: string[];
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
  autoNextStepIds?: string[];
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
  version?: string; // e.g. "v1.0 (Final)"
  isFinal?: boolean; // indicates this is the designated Final Version
  versionNotes?: string;
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
