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
  handleDeregisterPhone,
  handleDisconnectAndRelease,
  handleTestConnection,
  handleVerifyConnectionHealth,
  handleCheckWabaMigration,
  handleTriggerWabaMigration,
  handleWebhookVerification,
  handleWebhookPost,
  handleGetWebhookLogs,
  handleGetApiHealth,
  handlePingWebhookTest,
  handleClearWebhookLogs,
  handleSaveAdminMetaConfig,
  handleUploadMedia,
  processIncomingWhatsAppStatusUpdate,
  getMetaConfig,
} from './metaService.ts';
import {
  handleCancelScheduledCampaign,
  handleRescheduleCampaign,
  handleSendScheduledCampaignNow,
} from './campaignSchedulerService.ts';
import {
  handleGetCampaignAnalytics,
  handleGetCampaignMessages,
  handleGetMessageDetails,
  getWebhookAuditEvents,
} from './campaignAnalyticsService.ts';
import {
  handleToggleDripCampaignStatus,
  handleEnrollDripSubscribers,
  handleTestDripStep,
  handleAdvanceDripSubscriber,
  handleCancelDripSubscriber,
  handleRescanDripCampaign,
  handleGetDripCampaignAnalytics,
  handleReconcileDripCampaignDeliveries,
  handleMarkDripSubscriberRead,
} from './dripSchedulerService.ts';
import {
  handleTenantAuthLogin,
  handleLookupIdentifier,
  handleSelfChangePassword,
  handleGetMasterOverview,
  handleGetMasterCloudUsage,
  handleGetMasterAdmins,
  handleCreateMasterAdmin,
  handleUpdateMasterAdmin,
  handleDeleteMasterAdmin,
  handleResetAdminPassword,
  handleMasterImpersonate,
  handleGetMasterPlans,
  handleSaveMasterPlan,
  handleGetMasterAuditLogs,
  handleGetMasterFeatures,
  handleUpdateMasterFeatures,
  handleGetAdminUsers,
  handleCreateAdminUser,
  handleUpdateAdminUser,
  handleResetAdminUserPassword,
  handleDeleteAdminUser,
  handleAdminImpersonate,
  ensureDefaultAccounts,
} from './multiTenantService.ts';
import {
  getStorageMetrics,
  saveStorageSettings,
  purgeOldDataAndMedia,
  cascadeDeleteWhatsAppAccountData,
  startStorageCleanupScheduler,
} from './storageCleanupService.ts';

// Initialize default accounts and persistent disk backups
ensureDefaultAccounts().catch((err) => {
  console.warn('[MultiTenant] Startup seed notice:', err?.message);
});

// Initialize background storage auto-cleanup scheduler
startStorageCleanupScheduler();

export const apiApp = express();

// Parse JSON bodies safely - support both raw stream and pre-parsed bodies (e.g. Vercel serverless)
apiApp.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    return next();
  }
  express.json({ limit: '60mb' })(req, res, (err) => {
    if (err) {
      console.warn('[apiApp] JSON body parse error:', err.message);
      return res.status(400).json({ error: 'Invalid JSON request payload: ' + err.message, success: false });
    }
    next();
  });
});
apiApp.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Serve uploaded media files publicly from /uploads (supports memory cache, tmpdir, static disk, and fuzzy base prefix matching)
apiApp.get('/uploads/:filename', (req, res, next) => {
  const filename = req.params.filename;

  // 1. Check in-memory media buffer cache (exact filename)
  const memCached = inMemoryMediaBufferCache.get(filename);
  if (memCached) {
    res.setHeader('Content-Type', memCached.mimeType || 'application/octet-stream');
    return res.send(memCached.buffer);
  }

  // 2. Check exact path in public/uploads
  const publicDir = path.join(process.cwd(), 'public', 'uploads');
  const exactPublicPath = path.join(publicDir, filename);
  if (fs.existsSync(exactPublicPath)) {
    return res.sendFile(exactPublicPath);
  }

  // 3. Check exact path in dist/uploads (if production build exists)
  const distDir = path.join(process.cwd(), 'dist', 'uploads');
  const exactDistPath = path.join(distDir, filename);
  if (fs.existsSync(exactDistPath)) {
    return res.sendFile(exactDistPath);
  }

  // 4. Check os.tmpdir()/cloudwaba_uploads
  const tmpDir = path.join(os.tmpdir(), 'cloudwaba_uploads');
  const tmpPath = path.join(tmpDir, filename);
  if (fs.existsSync(tmpPath)) {
    return res.sendFile(tmpPath);
  }

  // 5. Smart Fuzzy Fallback: if exact timestamped filename was requested (e.g. 24X4_1793012982079.jpg),
  // search directories for any file sharing the same base prefix (e.g. 24X4_*.jpg)
  const basePrefix = filename.split('_')[0];
  const ext = path.extname(filename).toLowerCase();
  const searchDirs = [publicDir, distDir, tmpDir];

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        if (basePrefix && basePrefix.length >= 2) {
          const match = files.find(
            (f) => f.toLowerCase().startsWith(basePrefix.toLowerCase()) && path.extname(f).toLowerCase() === ext
          );
          if (match) {
            return res.sendFile(path.join(dir, match));
          }
        }
      } catch {}
    }
  }

  // 6. If not found in uploads directories, return 404 instead of falling through to Vite index.html
  return res.status(404).type('text/plain').send('File not found in uploads');
});
apiApp.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Media Upload from PC / Device
apiApp.post('/api/media/upload', handleUploadMedia);

// Media Proxy: Safely fetch Meta scontent, lookaside or external image buffers for live preview
apiApp.get('/api/meta/media-proxy', async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
    return res.status(400).json({ error: 'Valid url query param required' });
  }
  try {
    const config = getMetaConfig();
    const token = (req.query.token as string) || (req.headers['x-meta-token'] as string) || config.systemToken;
    const fetchHeaders: Record<string, string> = {};
    if (token && (targetUrl.includes('facebook.com') || targetUrl.includes('fbsbx.com') || targetUrl.includes('whatsapp.net'))) {
      fetchHeaders['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(targetUrl, { headers: fetchHeaders });
    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch remote media: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    return res.status(500).send(err?.message || 'Media proxy error');
  }
});

// Multi-Tenant Authentication & Master/Admin Routes
apiApp.get('/api/server-time', (req, res) => {
  res.json({ serverTime: new Date().toISOString(), timestamp: Date.now() });
});
apiApp.get('/api/auth/lookup-identifier', handleLookupIdentifier);
apiApp.post('/api/auth/lookup-identifier', handleLookupIdentifier);
apiApp.post('/api/auth/login', handleTenantAuthLogin);
apiApp.post('/api/auth/change-password', handleSelfChangePassword);
apiApp.get('/api/master/overview', handleGetMasterOverview);
apiApp.get('/api/master/cloud-usage', handleGetMasterCloudUsage);
apiApp.get('/api/master/admins', handleGetMasterAdmins);
apiApp.post('/api/master/admins', handleCreateMasterAdmin);
apiApp.put('/api/master/admins/:adminId', handleUpdateMasterAdmin);
apiApp.delete('/api/master/admins/:adminId', handleDeleteMasterAdmin);
apiApp.post('/api/master/admins/:adminId/reset-password', handleResetAdminPassword);
apiApp.post('/api/master/impersonate', handleMasterImpersonate);
apiApp.get('/api/master/plans', handleGetMasterPlans);
apiApp.post('/api/master/plans', handleSaveMasterPlan);
apiApp.get('/api/master/audit-logs', handleGetMasterAuditLogs);
apiApp.get('/api/master/features', handleGetMasterFeatures);
apiApp.post('/api/master/features', handleUpdateMasterFeatures);
apiApp.get('/api/master/api-health', handleGetApiHealth);
apiApp.post('/api/master/api-health/ping-webhook', handlePingWebhookTest);
apiApp.post('/api/master/api-health/clear-logs', handleClearWebhookLogs);
apiApp.get('/api/admin/api-health', handleGetApiHealth);
apiApp.post('/api/admin/api-health/ping-webhook', handlePingWebhookTest);
apiApp.post('/api/admin/api-health/clear-logs', handleClearWebhookLogs);
apiApp.get('/api/meta/api-health', handleGetApiHealth);

// Tenant-level User Management
apiApp.get('/api/admin/users', handleGetAdminUsers);
apiApp.post('/api/admin/users', handleCreateAdminUser);
apiApp.put('/api/admin/users/:userId', handleUpdateAdminUser);
apiApp.post('/api/admin/users/:userId/reset-password', handleResetAdminUserPassword);
apiApp.delete('/api/admin/users/:userId', handleDeleteAdminUser);
apiApp.post('/api/admin/impersonate', handleAdminImpersonate);

// Meta Cloud API Routes
apiApp.get('/api/meta/status', handleGetMetaStatus);
apiApp.post('/api/meta/admin-config', handleSaveAdminMetaConfig);
apiApp.post('/api/meta/embedded-signup-exchange', handleEmbeddedSignupExchange);
apiApp.post('/api/meta/exchange-code', handleEmbeddedSignupExchange);
apiApp.post('/api/meta/verify-account', handleVerifyAccount);
apiApp.post('/api/meta/sync-account', handleSyncMetaAccount);
apiApp.post('/api/meta/test-connection', handleTestConnection);
apiApp.post('/api/meta/connection-health', handleVerifyConnectionHealth);
apiApp.post('/api/meta/register-phone', handleRegisterPhone);
apiApp.post('/api/meta/deregister-phone', handleDeregisterPhone);
apiApp.post('/api/meta/disconnect-and-release', handleDisconnectAndRelease);
apiApp.post('/api/meta/waba-migration/check', handleCheckWabaMigration);
apiApp.post('/api/meta/waba-migration/trigger', handleTriggerWabaMigration);
apiApp.get('/api/meta/templates', handleGetTemplates);
apiApp.post('/api/meta/templates', handleCreateTemplate);
apiApp.delete('/api/meta/templates', handleDeleteTemplate);
apiApp.post('/api/meta/send-message', handleSendMessage);
apiApp.post('/api/meta/campaigns/send', handleSendCampaign);
apiApp.post('/api/meta/campaigns/:campaignId/send-now', handleSendScheduledCampaignNow);
apiApp.post('/api/meta/campaigns/:campaignId/trigger', handleSendScheduledCampaignNow);
apiApp.post('/api/meta/campaigns/:campaignId/reschedule', handleRescheduleCampaign);
apiApp.post('/api/meta/campaigns/:campaignId/cancel-schedule', handleCancelScheduledCampaign);

// WhatsApp Drip Campaigns Sequential Engine Endpoints
apiApp.post('/api/drip/campaigns/:id/toggle', handleToggleDripCampaignStatus);
apiApp.post('/api/drip/campaigns/:id/enroll', handleEnrollDripSubscribers);
apiApp.post('/api/drip/campaigns/:id/test-step', handleTestDripStep);
apiApp.post('/api/drip/campaigns/:id/subscribers/:subId/advance', handleAdvanceDripSubscriber);
apiApp.post('/api/drip/campaigns/:id/subscribers/:subId/cancel', handleCancelDripSubscriber);
apiApp.post('/api/drip/campaigns/:id/rescan', handleRescanDripCampaign);
apiApp.post('/api/drip/campaigns/:id/reconcile', handleReconcileDripCampaignDeliveries);
apiApp.post('/api/drip/campaigns/:id/subscribers/:subId/mark-read', handleMarkDripSubscriberRead);
apiApp.get('/api/drip/campaigns/:id/analytics', handleGetDripCampaignAnalytics);

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

// -------------------------------------------------------------
// STORAGE LIFECYCLE & DATA RETENTION ENDPOINTS
// -------------------------------------------------------------
apiApp.get('/api/storage/metrics', async (req, res) => {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || (req.query.organizationId as string);
    const metrics = await getStorageMetrics(orgId);
    res.json({ success: true, ...metrics });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching storage metrics' });
  }
});

apiApp.post('/api/storage/settings', async (req, res) => {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || req.body?.organizationId;
    const updated = await saveStorageSettings(req.body, orgId);
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error saving storage settings' });
  }
});

apiApp.post('/api/storage/purge', async (req, res) => {
  try {
    const days = Number(req.body?.retentionDays) || 30;
    const result = await purgeOldDataAndMedia(days);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error executing storage purge' });
  }
});

// Dedicated Cascade Deletion on WhatsApp Account Removal:
// Automatically wipes all linked campaigns, tracking records, WAMID logs & media files
apiApp.post('/api/meta/accounts/:accountId/cascade-delete', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { organizationId, phoneNumberId } = req.body || {};
    const effectiveOrgId = (req.headers['x-organization-id'] as string) || organizationId;

    if (!effectiveOrgId) {
      return res.status(400).json({ error: 'organizationId is required for cascade deletion' });
    }

    const result = await cascadeDeleteWhatsAppAccountData({
      organizationId: effectiveOrgId,
      accountId,
      phoneNumberId,
      deleteAccountDoc: true,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error executing cascade account deletion' });
  }
});

// Global Error Handler: Always return structured JSON instead of default HTML 500
apiApp.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[apiApp Global Error Handler]:', err);
  if (res.headersSent) {
    return next(err);
  }
  const status = typeof err?.status === 'number' ? err.status : 500;
  return res.status(status).json({
    error: err?.message || 'Internal server error occurred during request processing.',
    code: err?.code || 'SERVER_ERROR',
    success: false,
  });
});


