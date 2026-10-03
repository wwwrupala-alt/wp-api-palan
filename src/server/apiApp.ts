import express from 'express';
import path from 'path';
import fs from 'fs';
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
  processIncomingWhatsAppStatusUpdate,
} from './metaService.ts';
import {
  handleGetCampaignAnalytics,
  handleGetCampaignMessages,
  handleGetMessageDetails,
  getWebhookAuditEvents,
} from './campaignAnalyticsService.ts';

export const apiApp = express();

// Parse JSON and URL-encoded bodies up to 50MB for media upload from PC/device
apiApp.use(express.json({ limit: '50mb' }));
apiApp.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure public uploads directory exists and mount static serving
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
apiApp.use('/uploads', express.static(uploadsDir));

// PC / Device File Upload API Route (Images, Videos, Documents)
apiApp.post('/api/upload', (req, res) => {
  try {
    const { fileName, fileType, base64Data } = req.body;
    if (!base64Data || !fileName) {
      return res.status(400).json({ error: 'base64Data and fileName are required' });
    }

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFileName = `${Date.now()}_${cleanName}`;
    const filePath = path.join(uploadsDir, uniqueFileName);

    const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');
    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/${uniqueFileName}`;
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const fullUrl = `${protocol}://${host}${relativeUrl}`;

    return res.json({
      success: true,
      fileName: cleanName,
      fileType: fileType || 'application/octet-stream',
      fileSize: buffer.length,
      url: relativeUrl,
      fullUrl,
    });
  } catch (err: any) {
    console.error('[Upload API] File upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save uploaded file' });
  }
});

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

