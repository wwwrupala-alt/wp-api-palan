import type { Request, Response } from 'express';
import {
  collectionGroup,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { serverDb } from './serverDb.ts';
import { executeCampaignDispatchCore } from './metaService.ts';

let schedulerInterval: any = null;
let isProcessingScheduled = false;

/**
 * Scan for any scheduled campaigns whose scheduledAt time has passed,
 * and dispatch them automatically via Meta WhatsApp Cloud API.
 */
let quotaExceededBackoffUntil = 0;

export async function checkAndExecuteScheduledCampaigns(): Promise<void> {
  if (Date.now() < quotaExceededBackoffUntil) return;
  if (isProcessingScheduled) return;
  isProcessingScheduled = true;

  try {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    // Query campaigns across all tenant organizations where status == 'scheduled'
    const scheduledQuery = query(
      collectionGroup(serverDb, 'campaigns'),
      where('status', '==', 'scheduled')
    );

    const snapshot = await getDocs(scheduledQuery);
    if (snapshot.empty) {
      isProcessingScheduled = false;
      return;
    }

    for (const docSnap of snapshot.docs) {
      const camp = docSnap.data();
      const scheduledAt = camp.scheduledAt;

      // Skip if scheduledAt is still in the future
      if (!scheduledAt || new Date(scheduledAt).getTime() > nowMs) {
        continue;
      }

      const pathSegments = docSnap.ref.path.split('/');
      const orgId = pathSegments[1] || camp.organizationId || camp.scheduleData?.organizationId;
      const campaignId = docSnap.id;

      console.log(`[CampaignScheduler] Executing scheduled campaign "${camp.name}" (${campaignId}) for org "${orgId}"...`);

      // Atomically update status to 'sending' with startedAt timestamp
      try {
        await updateDoc(docSnap.ref, {
          status: 'sending',
          startedAt: nowIso,
          updatedAt: nowIso,
        });
      } catch (markErr) {
        console.warn(`[CampaignScheduler] Failed to mark campaign ${campaignId} as sending:`, markErr);
        continue;
      }

      // Verify organization subscription is active
      if (orgId && orgId !== 'org_master_platform') {
        try {
          const orgSnap = await getDoc(doc(serverDb, 'organizations', orgId));
          if (orgSnap.exists()) {
            const orgData = orgSnap.data();
            if (orgData.status === 'suspended') {
              console.warn(`[CampaignScheduler] Org ${orgId} suspended, cancelling scheduled campaign.`);
              await updateDoc(docSnap.ref, {
                status: 'cancelled',
                errorReason: 'Organization workspace is suspended by Master Admin.',
                updatedAt: nowIso,
              });
              continue;
            }
          }
        } catch (orgCheckErr) {
          console.warn('[CampaignScheduler] Org check error:', orgCheckErr);
        }
      }

      // Retrieve dispatch payload from scheduleData or root campaign document
      const scheduleData = camp.scheduleData || {};
      const phoneNumberId = scheduleData.phoneNumberId || camp.phoneNumberId || camp.whatsAppAccountId;
      const template = scheduleData.template || camp.template;
      const recipients = scheduleData.recipients || camp.recipients || [];
      const variableValues = scheduleData.variableValues || camp.variableValues || {};
      const customToken = scheduleData.customToken || camp.customToken;
      const campaignName = camp.name || scheduleData.campaignName;

      if (!phoneNumberId || !template || !Array.isArray(recipients) || recipients.length === 0) {
        console.error(`[CampaignScheduler] Missing dispatch data for scheduled campaign ${campaignId}. Marking as failed.`);
        await updateDoc(docSnap.ref, {
          status: 'failed',
          errorReason: 'Missing phone number ID, template, or target recipients in schedule data.',
          updatedAt: nowIso,
        });
        continue;
      }

      // Execute dispatch via Meta WhatsApp Cloud API
      try {
        const result = await executeCampaignDispatchCore({
          phoneNumberId,
          template,
          recipients,
          variableValues,
          customToken,
          campaignId,
          campaignName,
          organizationId: orgId,
        });

        console.log(`[CampaignScheduler] Scheduled campaign "${campaignName}" dispatched successfully:`, result.stats);
      } catch (dispatchErr: any) {
        console.error(`[CampaignScheduler] Error dispatching scheduled campaign ${campaignId}:`, dispatchErr);
        await updateDoc(docSnap.ref, {
          status: 'failed',
          errorReason: dispatchErr?.message || 'Error executing scheduled broadcast dispatch',
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('Quota') || err?.message?.includes('quota')) {
      // Pause background scheduler queries for 15 minutes to allow daily quota cooldown
      console.warn('[CampaignScheduler] Firebase Quota reached. Backing off for 15 minutes.');
      quotaExceededBackoffUntil = Date.now() + 15 * 60 * 1000;
    } else {
      console.error('[CampaignScheduler] Error in checkAndExecuteScheduledCampaigns:', err);
    }
  } finally {
    isProcessingScheduled = false;
  }
}

/**
 * Start the background polling loop for scheduled campaigns.
 */
export function startCampaignScheduler(): void {
  if (schedulerInterval) return;

  console.log('[CampaignScheduler] Starting background campaign scheduler (checking every 60s)...');
  // Polling interval: every 60 seconds (optimized for Firestore quota preservation)
  schedulerInterval = setInterval(() => {
    checkAndExecuteScheduledCampaigns().catch((err) => {
      console.warn('[CampaignScheduler] Interval tick error:', err);
    });
  }, 60000);
}

/**
 * Handler: Cancel a scheduled campaign
 * POST /api/meta/campaigns/:campaignId/cancel-schedule
 */
export async function handleCancelScheduledCampaign(req: Request, res: Response): Promise<void> {
  try {
    const { campaignId } = req.params;
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId;

    if (!campaignId || !orgId) {
      res.status(400).json({ error: 'campaignId and x-organization-id header are required.' });
      return;
    }

    const campRef = doc(serverDb, `organizations/${orgId}/campaigns`, campaignId);
    const campSnap = await getDoc(campRef);

    if (!campSnap.exists()) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }

    const camp = campSnap.data();
    if (camp.status !== 'scheduled') {
      res.status(400).json({ error: `Cannot cancel campaign with status "${camp.status}". Only scheduled campaigns can be cancelled.` });
      return;
    }

    await updateDoc(campRef, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Scheduled campaign "${camp.name}" cancelled successfully.`,
    });
  } catch (err: any) {
    console.error('[handleCancelScheduledCampaign] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to cancel scheduled campaign.' });
  }
}

/**
 * Handler: Reschedule a campaign to a new date & time
 * POST /api/meta/campaigns/:campaignId/reschedule
 */
export async function handleRescheduleCampaign(req: Request, res: Response): Promise<void> {
  try {
    const { campaignId } = req.params;
    const { scheduledAt } = req.body;
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId;

    if (!campaignId || !orgId || !scheduledAt) {
      res.status(400).json({ error: 'campaignId, scheduledAt, and organizationId are required.' });
      return;
    }

    const targetDate = new Date(scheduledAt);
    if (isNaN(targetDate.getTime())) {
      res.status(400).json({ error: 'Invalid scheduledAt date format.' });
      return;
    }

    const campRef = doc(serverDb, `organizations/${orgId}/campaigns`, campaignId);
    const campSnap = await getDoc(campRef);

    if (!campSnap.exists()) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }

    const camp = campSnap.data();
    if (camp.status !== 'scheduled' && camp.status !== 'cancelled' && camp.status !== 'draft') {
      res.status(400).json({ error: `Cannot reschedule campaign with status "${camp.status}".` });
      return;
    }

    await updateDoc(campRef, {
      status: 'scheduled',
      scheduledAt: targetDate.toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Campaign "${camp.name}" rescheduled for ${targetDate.toLocaleString()}.`,
      scheduledAt: targetDate.toISOString(),
    });
  } catch (err: any) {
    console.error('[handleRescheduleCampaign] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to reschedule campaign.' });
  }
}

/**
 * Handler: Send a scheduled campaign immediately (bypass schedule timer)
 * POST /api/meta/campaigns/:campaignId/send-now
 */
export async function handleSendScheduledCampaignNow(req: Request, res: Response): Promise<void> {
  try {
    const { campaignId } = req.params;
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId;

    if (!campaignId || !orgId) {
      res.status(400).json({ error: 'campaignId and x-organization-id header are required.' });
      return;
    }

    const campRef = doc(serverDb, `organizations/${orgId}/campaigns`, campaignId);
    const campSnap = await getDoc(campRef);

    if (!campSnap.exists()) {
      res.status(404).json({ error: 'Campaign not found.' });
      return;
    }

    const camp = campSnap.data();
    const allowedStatuses = ['ready', 'scheduled', 'draft', 'queued', 'completed', 'failed', 'cancelled'];
    if (!allowedStatuses.includes(camp.status)) {
      if (camp.status === 'sending') {
        res.status(400).json({ error: 'Campaign broadcast is already actively sending in the background.' });
        return;
      }
      res.status(400).json({ error: `Campaign has status "${camp.status}". Triggering is allowed for ready, scheduled, draft, or re-run campaigns.` });
      return;
    }

    const scheduleData = camp.scheduleData || {};
    const phoneNumberId = scheduleData.phoneNumberId || camp.phoneNumberId || camp.whatsAppAccountId;
    const template = scheduleData.template || camp.template;
    const recipients = scheduleData.recipients || camp.recipients || [];
    const variableValues = scheduleData.variableValues || camp.variableValues || {};
    const customToken = scheduleData.customToken || camp.customToken;
    const campaignName = camp.name || scheduleData.campaignName || 'Broadcast Campaign';

    if (!phoneNumberId || !template || !Array.isArray(recipients) || recipients.length === 0) {
      await updateDoc(campRef, { status: 'failed', errorReason: 'Missing dispatch data (phone number, template, or recipients)' });
      res.status(400).json({ error: 'Missing phone number ID, template, or target recipients in campaign data.' });
      return;
    }

    // Mark as sending immediately in Firestore
    const nowIso = new Date().toISOString();
    await updateDoc(campRef, {
      status: 'sending',
      startedAt: nowIso,
      updatedAt: nowIso,
    });

    // Send immediate response so the user interface never freezes or blocks!
    res.json({
      success: true,
      message: `Broadcast for "${campaignName}" triggered successfully! Sending to ${recipients.length} recipients in the background.`,
      status: 'sending',
      recipientCount: recipients.length,
    });

    // Run dispatch asynchronously in background
    executeCampaignDispatchCore({
      phoneNumberId,
      template,
      recipients,
      variableValues,
      customToken,
      campaignId,
      campaignName,
      organizationId: orgId,
    }).catch(async (dispatchErr: any) => {
      console.error(`[handleSendScheduledCampaignNow] Background broadcast error for ${campaignId}:`, dispatchErr);
      try {
        await updateDoc(campRef, {
          status: 'failed',
          errorReason: dispatchErr?.message || 'Background broadcast error',
          updatedAt: new Date().toISOString(),
        });
      } catch {}
    });
  } catch (err: any) {
    console.error('[handleSendScheduledCampaignNow] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to dispatch campaign now.' });
  }
}
