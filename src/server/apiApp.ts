import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { inMemoryMediaBufferCache } from './metaMediaManager.ts';
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
  handleUploadMedia,
  processIncomingWhatsAppStatusUpdate,
} from './metaService.ts';
import {
  handleGetCampaignAnalytics,
  handleGetCampaignMessages,
  handleGetMessageDetails,
  getWebhookAuditEvents,
} from './campaignAnalyticsService.ts';

export const apiApp = express();

// Parse JSON bodies with support for media file uploads (up to 60MB)
apiApp.use(express.json({ limit: '60mb' }));
apiApp.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Serve uploaded media files publicly from /uploads (supports memory cache, tmpdir, and static disk)
apiApp.get('/uploads/:filename', (req, res, next) => {
  const filename = req.params.filename;
  // 1. Check in-memory media buffer cache
  const memCached = inMemoryMediaBufferCache.get(filename);
  if (memCached) {
    res.setHeader('Content-Type', memCached.mimeType || 'application/octet-stream');
    return res.send(memCached.buffer);
  }

  // 2. Check os.tmpdir()/cloudwaba_uploads
  const tmpPath = path.join(os.tmpdir(), 'cloudwaba_uploads', filename);
  if (fs.existsSync(tmpPath)) {
    return res.sendFile(tmpPath);
  }

  // 3. Fallback to standard static serving
  next();
});
apiApp.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Media Upload from PC / Device
apiApp.post('/api/media/upload', handleUploadMedia);

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
apiApp.post('/api/meta/simulate-status', async (req, res) => {
  try {
    const { wamid, status, phone } = req.body;
    const statusObj = {
      id: wamid || `wamid_${Date.now()}`,
      status: status || 'read',
      timestamp: Math.floor(Date.now() / 1000).toString(),
      recipient_id: phone ? String(phone).replace(/[^0-9]/g, '') : '',
    };
    await processIncomingWhatsAppStatusUpdate(statusObj);
    res.json({ success: true, statusObj });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error simulating status' });
  }
});

