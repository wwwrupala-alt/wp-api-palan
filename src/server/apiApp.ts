import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { serverDb } from './serverDb.ts';
import { collection, getDocs } from 'firebase/firestore';
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
import {
  handleGetWallet,
  handleRechargeWallet,
  handleGetPricing,
  handleUpdatePricing,
  handleResetWallet,
  handleClearWalletTransactions,
  handleDeleteWalletTransaction,
  handleUpdateAutoDelete,
  handlePurgeOldTransactions,
} from './walletService.ts';
import {
  handleResolveWhiteLabel,
  handleVerifyDnsCname,
  handleUpdateAdminBranding,
} from './whiteLabelService.ts';
import {
  handleGetCrmLeads,
  handleUpdateCrmLead,
  handleAddCrmLeadNote,
  handleBulkUpdateStage,
  handleDeleteCrmLead,
  handleResetCrmLeads,
} from './crmLeadsService.ts';
import {
  handleExternalWhatsAppSend,
  handleGetExternalApiConfig,
  handleSaveExternalApiConfig,
  handleRegenerateExternalApiKey,
  handleGetExternalApiLogs,
  handleResetExternalApiLogs,
  handleGetExternalApiTriggers,
  handleSaveExternalApiTrigger,
  handleDeleteExternalApiTrigger,
} from './externalApiService.ts';

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

// Media Proxy: Safely fetch Meta scontent, lookaside or Meta Media ID buffers for live preview
apiApp.get('/api/meta/media-proxy', async (req, res) => {
  const mediaIdParam = ((req.query.mediaId as string) || '').trim();
  let targetUrl = ((req.query.url as string) || '').trim();
  const phoneNumberIdParam = ((req.query.phoneNumberId as string) || '').trim();
  const accountIdParam = ((req.query.accountId as string) || '').trim();
  const orgIdParam = ((req.headers['x-organization-id'] as string) || (req.query.orgId as string) || '').trim();

  // Unwrap if url itself points to /api/meta/media-proxy
  if (targetUrl.includes('/api/meta/media-proxy')) {
    const nestedMediaId = targetUrl.match(/[?&]mediaId=(\d+)/i)?.[1];
    const nestedUrl = targetUrl.match(/[?&]url=([^&]+)/i)?.[1];
    if (nestedMediaId) {
      targetUrl = nestedMediaId;
    } else if (nestedUrl) {
      targetUrl = decodeURIComponent(nestedUrl);
    }
  }

  // If url is actually a numeric Meta Media ID (e.g. "2381431199056815")
  const effectiveMediaId = mediaIdParam || (/^\d+$/.test(targetUrl) ? targetUrl : '');

  try {
    // 1. Check in-memory media buffer cache first for resolved Meta Media ID
    if (effectiveMediaId) {
      const cachedMedia = inMemoryMediaBufferCache.get(`media_${effectiveMediaId}`);
      if (cachedMedia) {
        res.setHeader('Content-Type', cachedMedia.mimeType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(cachedMedia.buffer);
      }
    }

    const config = getMetaConfig();
    const candidateTokens: string[] = [];
    const seenTokens = new Set<string>();
    const addToken = (t?: unknown) => {
      if (typeof t === 'string') {
        const clean = t.trim();
        if (clean && !seenTokens.has(clean)) {
          seenTokens.add(clean);
          candidateTokens.push(clean);
        }
      }
    };

    // Priority 1: Explicit token passed via query or header
    addToken(req.query.token);
    addToken(req.headers['x-meta-token']);

    // Priority 2: Look up WhatsApp accounts from Firestore (matching phoneNumberId / accountId first, then org, then all orgs)
    const matchedPhoneTokens: string[] = [];
    const orgTokens: string[] = [];
    const otherTokens: string[] = [];

    try {
      const collectAccountTokens = (accId: string, d: Record<string, any>, isTargetOrg: boolean) => {
        const accTok = d.customToken || d.permanentToken || d.userAccessToken;
        if (!accTok || typeof accTok !== 'string') return;
        const isPhoneMatch =
          (phoneNumberIdParam && (d.phoneNumberId === phoneNumberIdParam || accId === phoneNumberIdParam)) ||
          (accountIdParam && accId === accountIdParam);
        if (isPhoneMatch) {
          matchedPhoneTokens.push(accTok);
        } else if (isTargetOrg) {
          orgTokens.push(accTok);
        } else {
          otherTokens.push(accTok);
        }
      };

      if (orgIdParam) {
        const accSnap = await getDocs(collection(serverDb, `organizations/${orgIdParam}/whatsappAccounts`));
        for (const docSnap of accSnap.docs) {
          collectAccountTokens(docSnap.id, docSnap.data(), true);
        }
      }

      // Also scan all organizations so cross-org / missing orgId requests still resolve the right WABA token
      const allOrgs = await getDocs(collection(serverDb, 'organizations'));
      for (const o of allOrgs.docs) {
        if (orgIdParam && o.id === orgIdParam) continue;
        const oAccs = await getDocs(collection(serverDb, `organizations/${o.id}/whatsappAccounts`));
        for (const a of oAccs.docs) {
          collectAccountTokens(a.id, a.data(), false);
        }
      }
    } catch (dbErr) {
      console.warn('media-proxy token lookup notice:', dbErr);
    }

    matchedPhoneTokens.forEach(addToken);
    orgTokens.forEach(addToken);
    addToken(config.systemToken);
    addToken(process.env.META_ACCESS_TOKEN);
    addToken(process.env.WHATSAPP_ACCESS_TOKEN);
    otherTokens.forEach(addToken);

    let resolvedToken = candidateTokens[0] || '';

    if (effectiveMediaId) {
      if (candidateTokens.length === 0) {
        return res.status(400).json({ error: 'Meta token required to resolve mediaId' });
      }

      let lastErrorMsg = 'Media not found on Meta';
      let downloadedBuffer: Buffer | null = null;
      let downloadedContentType = 'image/jpeg';

      for (const tok of candidateTokens) {
        try {
          const metaLookupRes = await fetch(
            `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(effectiveMediaId)}?access_token=${encodeURIComponent(tok)}`
          );
          const metaLookup = await metaLookupRes.json();
          if (!metaLookupRes.ok || !metaLookup?.url) {
            if (metaLookup?.error?.message) lastErrorMsg = metaLookup.error.message;
            continue;
          }

          const mediaFetchRes = await fetch(metaLookup.url, {
            headers: { Authorization: `Bearer ${tok}` },
          });
          if (!mediaFetchRes.ok) {
            lastErrorMsg = `Failed to fetch remote media: ${mediaFetchRes.statusText}`;
            continue;
          }

          const arrBuf = await mediaFetchRes.arrayBuffer();
          downloadedBuffer = Buffer.from(arrBuf);
          downloadedContentType = mediaFetchRes.headers.get('content-type') || metaLookup.mime_type || 'image/jpeg';
          resolvedToken = tok;
          break;
        } catch (tryErr: any) {
          lastErrorMsg = tryErr?.message || lastErrorMsg;
        }
      }

      if (!downloadedBuffer) {
        return res.status(404).json({ error: lastErrorMsg });
      }

      // Cache in memory so subsequent preview / clone loads are instant
      inMemoryMediaBufferCache.set(`media_${effectiveMediaId}`, {
        buffer: downloadedBuffer,
        mimeType: downloadedContentType,
        originalName: `media_${effectiveMediaId}`,
        filename: `media_${effectiveMediaId}`,
      });

      res.setHeader('Content-Type', downloadedContentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(downloadedBuffer);
    }

    if (!targetUrl) {
      return res.status(400).json({ error: 'Valid url or mediaId query param required' });
    }

    // If it's a local relative path like /uploads/...
    if (targetUrl.startsWith('/uploads/')) {
      const filenameOnly = path.basename(targetUrl.split('?')[0]);
      const memCached = inMemoryMediaBufferCache.get(filenameOnly) || inMemoryMediaBufferCache.get(targetUrl);
      if (memCached) {
        res.setHeader('Content-Type', memCached.mimeType || 'image/jpeg');
        return res.send(memCached.buffer);
      }
      const publicUploads = path.join(process.cwd(), 'public', targetUrl);
      if (fs.existsSync(publicUploads)) {
        return res.sendFile(publicUploads);
      }
      return res.redirect(`https://wabacloud.in${targetUrl}`);
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Valid url required' });
    }

    const fetchHeaders: Record<string, string> = {};
    if (resolvedToken && (targetUrl.includes('facebook.com') || targetUrl.includes('fbsbx.com') || targetUrl.includes('whatsapp.net'))) {
      fetchHeaders['Authorization'] = `Bearer ${resolvedToken}`;
    }
    const response = await fetch(targetUrl, { headers: fetchHeaders });
    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch remote media: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    return res.status(500).send(err?.message || 'Media proxy error');
  }
});

// Multi-Tenant Authentication & Master/Admin Routes
apiApp.get('/api/whitelabel/resolve', handleResolveWhiteLabel);
apiApp.post('/api/whitelabel/verify-dns', handleVerifyDnsCname);

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
apiApp.post('/api/admin/branding', handleUpdateAdminBranding);

// Multi-Tenant Prepaid Wallet & Pricing Endpoints
apiApp.get('/api/wallet', handleGetWallet);
apiApp.post('/api/wallet/recharge', handleRechargeWallet);
apiApp.get('/api/wallet/pricing', handleGetPricing);
apiApp.post('/api/wallet/pricing', handleUpdatePricing);
apiApp.post('/api/wallet/reset', handleResetWallet);
apiApp.post('/api/wallet/clear-transactions', handleClearWalletTransactions);
apiApp.delete('/api/wallet/transactions/:id', handleDeleteWalletTransaction);
apiApp.post('/api/wallet/auto-delete-settings', handleUpdateAutoDelete);
apiApp.post('/api/wallet/purge-now', handlePurgeOldTransactions);

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
apiApp.post('/api/whatsapp/send', handleExternalWhatsAppSend);
apiApp.get('/api/external-api/config', handleGetExternalApiConfig);
apiApp.post('/api/external-api/config', handleSaveExternalApiConfig);
apiApp.post('/api/external-api/regenerate', handleRegenerateExternalApiKey);
apiApp.get('/api/external-api/logs', handleGetExternalApiLogs);
apiApp.delete('/api/external-api/logs', handleResetExternalApiLogs);
apiApp.get('/api/external-api/triggers', handleGetExternalApiTriggers);
apiApp.post('/api/external-api/triggers', handleSaveExternalApiTrigger);
apiApp.delete('/api/external-api/triggers/:triggerId', handleDeleteExternalApiTrigger);
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

// CRM Leads & Campaign Interactive Clicks / Replies Funnel
apiApp.get('/api/crm/leads', handleGetCrmLeads);
apiApp.post('/api/crm/leads/reset', handleResetCrmLeads);
apiApp.delete('/api/crm/leads/reset', handleResetCrmLeads);
apiApp.put('/api/crm/leads/:id', handleUpdateCrmLead);
apiApp.post('/api/crm/leads/:id/notes', handleAddCrmLeadNote);
apiApp.post('/api/crm/leads/bulk-stage', handleBulkUpdateStage);
apiApp.delete('/api/crm/leads/:id', handleDeleteCrmLead);

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


