import express from 'express';
import {
  handleGetMetaStatus,
  handleEmbeddedSignupExchange,
  handleVerifyAccount,
  handleSyncMetaAccount,
  handleGetTemplates,
  handleCreateTemplate,
  handleDeleteTemplate,
  handleSendMessage,
  handleSendCampaign,
  handleRegisterPhone,
  handleTestConnection,
  handleWebhookVerification,
  handleWebhookPost,
  handleGetWebhookLogs,
  handleSaveAdminMetaConfig,
} from './metaService.ts';
import {
  handleGetCampaignAnalytics,
  handleGetCampaignMessages,
  handleGetMessageDetails,
  getWebhookAuditEvents,
} from './campaignAnalyticsService.ts';

export const apiApp = express();

// Parse JSON bodies
apiApp.use(express.json());
apiApp.use(express.urlencoded({ extended: true }));

// Meta Cloud API Routes
apiApp.get('/api/meta/status', handleGetMetaStatus);
apiApp.post('/api/meta/admin-config', handleSaveAdminMetaConfig);
apiApp.post('/api/meta/embedded-signup-exchange', handleEmbeddedSignupExchange);
apiApp.post('/api/meta/verify-account', handleVerifyAccount);
apiApp.post('/api/meta/sync-account', handleSyncMetaAccount);
apiApp.post('/api/meta/test-connection', handleTestConnection);
apiApp.post('/api/meta/register-phone', handleRegisterPhone);
apiApp.get('/api/meta/templates', handleGetTemplates);
apiApp.post('/api/meta/templates', handleCreateTemplate);
apiApp.delete('/api/meta/templates', handleDeleteTemplate);
apiApp.post('/api/meta/send-message', handleSendMessage);
apiApp.post('/api/meta/campaigns/send', handleSendCampaign);

// WhatsApp Campaign Real-Time Tracking & Analytics Endpoints (Item 12)
apiApp.get('/api/campaigns/:campaignId/analytics', handleGetCampaignAnalytics);
apiApp.get('/api/campaigns/:campaignId/messages', handleGetCampaignMessages);
apiApp.get('/api/messages/:messageId', handleGetMessageDetails);
apiApp.get('/api/analytics/webhook-audit', (req, res) => {
  res.json({ events: getWebhookAuditEvents() });
});

// Official WhatsApp Webhook endpoints (/api/webhooks/whatsapp & /api/meta/webhook)
apiApp.get('/api/webhooks/whatsapp', handleWebhookVerification);
apiApp.post('/api/webhooks/whatsapp', handleWebhookPost);
apiApp.get('/api/meta/webhook', handleWebhookVerification);
apiApp.post('/api/meta/webhook', handleWebhookPost);
apiApp.get('/api/meta/webhook/logs', handleGetWebhookLogs);
