import type { Request, Response } from 'express';
import {
  collectionGroup,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { serverDb } from './serverDb.ts';
import { executeCampaignDispatchCore, getEffectiveMetaConfig } from './metaService.ts';

let dripInterval: any = null;
let isProcessingDrip = false;

/**
 * Scan active drip campaigns and dispatch scheduled sequential steps to subscribers.
 */
export async function checkAndExecuteDripCampaigns(): Promise<void> {
  if (isProcessingDrip) return;
  isProcessingDrip = true;

  try {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    // 1. Query all active drip campaigns across tenant organizations
    const activeDripsQuery = query(
      collectionGroup(serverDb, 'drip_campaigns'),
      where('status', '==', 'active')
    );

    const dripsSnapshot = await getDocs(activeDripsQuery);
    if (dripsSnapshot.empty) {
      isProcessingDrip = false;
      return;
    }

    for (const dripDoc of dripsSnapshot.docs) {
      const camp = dripDoc.data();
      const pathSegments = dripDoc.ref.path.split('/');
      const orgId = pathSegments[1] || camp.organizationId;
      const campaignId = dripDoc.id;

      if (!orgId || !Array.isArray(camp.steps) || camp.steps.length === 0) {
        continue;
      }

      // 2. Fetch active subscribers for this drip campaign
      const subsRef = collection(serverDb, `organizations/${orgId}/drip_campaigns/${campaignId}/subscribers`);
      const activeSubsQuery = query(subsRef, where('status', '==', 'active'));
      const subsSnap = await getDocs(activeSubsQuery);

      if (subsSnap.empty) continue;

      for (const subDoc of subsSnap.docs) {
        const sub = subDoc.data();

        // Check if subscriber is due for execution
        if (sub.nextExecutionAt && new Date(sub.nextExecutionAt).getTime() > nowMs) {
          continue; // Not yet due
        }

        const currentStepNum = sub.currentStep || 1;
        const currentStep = camp.steps.find((s: any) => s.stepNumber === currentStepNum);

        // If step doesn't exist (all steps finished)
        if (!currentStep) {
          await updateDoc(subDoc.ref, {
            status: 'completed',
            completedAt: nowIso,
            updatedAt: nowIso,
          }).catch(() => {});

          await updateDoc(dripDoc.ref, {
            completedSubscribers: (camp.completedSubscribers || 0) + 1,
            activeSubscribers: Math.max(0, (camp.activeSubscribers || 1) - 1),
            updatedAt: nowIso,
          }).catch(() => {});
          continue;
        }

        // Condition Check: if_not_replied
        if (currentStep.condition === 'if_not_replied' && sub.lastStepSentAt) {
          try {
            // Check if contact replied since lastStepSentAt
            const cleanPhone = (sub.phone || '').replace(/[^0-9]/g, '');
            const msgQuery = query(
              collection(serverDb, `organizations/${orgId}/messages`),
              where('direction', '==', 'inbound')
            );
            const msgSnap = await getDocs(msgQuery);
            const hasReplied = msgSnap.docs.some((d) => {
              const m = d.data();
              const mPhone = (m.contactId || m.senderPhone || '').replace(/[^0-9]/g, '');
              return mPhone.includes(cleanPhone) && m.timestamp > sub.lastStepSentAt;
            });

            if (hasReplied) {
              console.log(`[DripScheduler] Contact ${sub.phone} replied; completing sequence early.`);
              const updatedHistory = [
                ...(sub.stepHistory || []),
                {
                  stepNumber: currentStepNum,
                  templateName: currentStep.templateName,
                  sentAt: nowIso,
                  status: 'skipped',
                  note: 'Skipped: Contact replied to previous message',
                },
              ];
              await updateDoc(subDoc.ref, {
                status: 'completed',
                completedAt: nowIso,
                stepHistory: updatedHistory,
                updatedAt: nowIso,
              });
              continue;
            }
          } catch (replyCheckErr) {
            console.warn('[DripScheduler] Reply check warning:', replyCheckErr);
          }
        }

        // Condition Check: if_read (Only send if previous message was read)
        if (currentStep.condition === 'if_read' && sub.lastStepSentAt) {
          try {
            const cleanPhone = (sub.phone || '').replace(/[^0-9]/g, '');
            let isRead = false;
            let isDelivered = false;

            // A. Check recipient records in previous campaign step
            const prevStepNum = currentStepNum - 1;
            try {
              const prevRecsQuery = query(
                collection(serverDb, `organizations/${orgId}/campaigns/${campaignId}_step_${prevStepNum}/recipients`)
              );
              const prevRecsSnap = await getDocs(prevRecsQuery);
              for (const rDoc of prevRecsSnap.docs) {
                const r = rDoc.data();
                const rPhone = (r.phoneNumber || r.phone || '').replace(/[^0-9]/g, '');
                if (rPhone.includes(cleanPhone) || cleanPhone.includes(rPhone)) {
                  if (r.currentStatus === 'read' || r.status === 'read' || r.timeline?.some((t: any) => t.status === 'read')) {
                    isRead = true;
                    break;
                  }
                  if (r.currentStatus === 'delivered' || r.status === 'delivered') {
                    isDelivered = true;
                  }
                }
              }
            } catch (prevErr) {
              console.warn('[DripScheduler] Prev step recipients check notice:', prevErr);
            }

            // B. Check messages collection
            if (!isRead) {
              try {
                const msgQuery = query(
                  collection(serverDb, `organizations/${orgId}/messages`),
                  where('direction', '==', 'outbound')
                );
                const msgSnap = await getDocs(msgQuery);
                for (const d of msgSnap.docs) {
                  const m = d.data();
                  const mPhone = (m.contactId || m.recipientPhone || m.to || '').replace(/[^0-9]/g, '');
                  if ((mPhone.includes(cleanPhone) || cleanPhone.includes(mPhone)) && m.timestamp >= sub.lastStepSentAt) {
                    if (m.status === 'read') {
                      isRead = true;
                      break;
                    }
                    if (m.status === 'delivered') {
                      isDelivered = true;
                    }
                  }
                }
              } catch (msgErr) {
                console.warn('[DripScheduler] Messages check notice:', msgErr);
              }
            }

            // C. WhatsApp Privacy Grace Policy:
            // WhatsApp contacts frequently have "Read Receipts" (blue ticks) turned off in settings.
            // If the message was delivered and more than 30 minutes have elapsed, or if more than 60 minutes
            // have elapsed since sending, release the step so the sequence does not freeze permanently.
            const timeSinceLastStepMs = Date.now() - new Date(sub.lastStepSentAt).getTime();
            const MAX_READ_WAIT_MS = 60 * 60 * 1000; // 1 hour

            if (!isRead) {
              if (timeSinceLastStepMs > MAX_READ_WAIT_MS || (isDelivered && timeSinceLastStepMs > 30 * 60 * 1000)) {
                console.log(`[DripScheduler] Read receipt wait timeout reached for ${sub.phone} (${Math.round(timeSinceLastStepMs / 60000)} mins); auto-releasing step.`);
                isRead = true;
              } else {
                console.log(`[DripScheduler] Previous message for ${sub.phone} not yet read; holding step for up to 1 hr.`);
                // Postpone check by 2 minutes
                await updateDoc(subDoc.ref, {
                  nextExecutionAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
                  updatedAt: nowIso,
                });
                continue;
              }
            }
          } catch (readCheckErr) {
            console.warn('[DripScheduler] Read check warning:', readCheckErr);
          }
        }

        // 3. Prepare dispatch for this subscriber's step
        const phoneNumberId = camp.whatsAppAccountId || camp.phoneNumberId;
        let template = currentStep.template;

        // Fallback: If template object is missing or incomplete, load it by templateId or templateName
        if ((!template || !template.name) && (currentStep.templateId || currentStep.templateName)) {
          try {
            if (currentStep.templateId) {
              const tDoc = await getDoc(doc(serverDb, `organizations/${orgId}/templates/${currentStep.templateId}`));
              if (tDoc.exists()) {
                template = tDoc.data();
              }
            }
            if (!template && currentStep.templateName) {
              const tQuery = query(
                collection(serverDb, `organizations/${orgId}/templates`),
                where('name', '==', currentStep.templateName)
              );
              const tSnap = await getDocs(tQuery);
              if (!tSnap.empty) {
                template = tSnap.docs[0].data();
              }
            }
          } catch (tErr) {
            console.warn('[DripScheduler] Could not fetch template fallback:', tErr);
          }
        }

        const stepHeaderMedia = currentStep.headerMediaUrl || currentStep.variableValues?.header_media_url || currentStep.variableValues?.media_url;
        const subCustom = sub.customFields || {};
        const recipient = {
          phone: sub.phone,
          name: sub.name,
          variableValues: {
            ...(currentStep.variableValues || {}),
            ...subCustom,
            body_1: subCustom.var1 || subCustom.body_1 || sub.name || currentStep.variableValues?.body_1 || 'Customer',
            ...(stepHeaderMedia ? { header_media_url: stepHeaderMedia, media_url: stepHeaderMedia } : {}),
          },
        };

        if (!phoneNumberId || !template) {
          console.warn(`[DripScheduler] Missing sender or template for drip step ${currentStepNum}`);
          continue;
        }

        // Resolve active WhatsApp Account token
        let resolvedToken = camp.customToken;
        if (!resolvedToken && phoneNumberId) {
          try {
            const accSnap = await getDoc(doc(serverDb, `organizations/${orgId}/whatsappAccounts/${phoneNumberId}`));
            if (accSnap.exists()) {
              const accData = accSnap.data();
              resolvedToken = accData.customToken || accData.permanentToken || accData.userAccessToken;
            }
          } catch (tokErr) {
            console.warn('[DripScheduler] Could not fetch account for token:', tokErr);
          }
        }
        if (!resolvedToken) {
          try {
            const orgMetaConfig = await getEffectiveMetaConfig(orgId);
            resolvedToken = orgMetaConfig.systemToken;
          } catch (cfgErr) {
            console.warn('[DripScheduler] Could not fetch org meta config for token:', cfgErr);
          }
        }

        let dispatchSuccess = false;
        let errorMessage = '';

        try {
          console.log(`[DripScheduler] Dispatching Step ${currentStepNum} ("${currentStep.title}") to ${sub.phone}...`);
          const dispatchRes = await executeCampaignDispatchCore({
            phoneNumberId,
            template,
            recipients: [recipient],
            variableValues: recipient.variableValues,
            customToken: resolvedToken,
            campaignId: `${campaignId}_step_${currentStepNum}`,
            campaignName: `${camp.name} - Step ${currentStepNum}`,
            organizationId: orgId,
          });

          dispatchSuccess = (dispatchRes?.stats?.sent || 0) > 0;
          if (!dispatchSuccess && dispatchRes?.errors?.length > 0) {
            errorMessage = dispatchRes.errors[0]?.error || 'Failed to dispatch message';
            console.warn(`[DripScheduler] Dispatch returned 0 sent messages for ${sub.phone}:`, errorMessage);
          }
        } catch (dispatchErr: any) {
          errorMessage = dispatchErr?.message || 'Dispatch failed';
          console.error(`[DripScheduler] Failed to dispatch step ${currentStepNum} to ${sub.phone}:`, dispatchErr);
        }

        // 4. Update subscriber progression and step history
        const newHistoryItem = {
          stepNumber: currentStepNum,
          templateName: currentStep.templateName,
          sentAt: nowIso,
          status: dispatchSuccess ? 'sent' : 'failed',
          ...(errorMessage ? { error: errorMessage } : {}),
        };

        const updatedHistory = [...(sub.stepHistory || []), newHistoryItem];

        if (dispatchSuccess) {
          // Find next step
          const nextStepNum = currentStepNum + 1;
          const nextStep = camp.steps.find((s: any) => s.stepNumber === nextStepNum);

          if (nextStep) {
            const delayUnit = nextStep.delayUnit || 'hours';
            const rawDelay = Number(nextStep.delayValue);
            const delayVal = isNaN(rawDelay) ? 0 : Math.max(0, rawDelay);
            const delayMs =
              delayUnit === 'minutes'
                ? delayVal * 60 * 1000
                : delayUnit === 'hours'
                ? delayVal * 3600 * 1000
                : delayVal * 86400 * 1000;

            const nextExecutionAt = new Date(Date.now() + delayMs).toISOString();

            await updateDoc(subDoc.ref, {
              currentStep: nextStepNum,
              lastStepSentAt: nowIso,
              nextExecutionAt,
              stepHistory: updatedHistory,
              updatedAt: nowIso,
            }).catch(() => {});
          } else {
            // Completed entire sequence
            await updateDoc(subDoc.ref, {
              status: 'completed',
              completedAt: nowIso,
              lastStepSentAt: nowIso,
              nextExecutionAt: null,
              stepHistory: updatedHistory,
              updatedAt: nowIso,
            }).catch(() => {});

            await updateDoc(dripDoc.ref, {
              completedSubscribers: (camp.completedSubscribers || 0) + 1,
              activeSubscribers: Math.max(0, (camp.activeSubscribers || 1) - 1),
              updatedAt: nowIso,
            }).catch(() => {});
          }
        } else {
          // If dispatch failed, DO NOT skip step! Record failure and retry in 1 minute
          await updateDoc(subDoc.ref, {
            nextExecutionAt: new Date(Date.now() + 60000).toISOString(),
            stepHistory: updatedHistory,
            lastError: errorMessage,
            updatedAt: nowIso,
          }).catch(() => {});
        }

        // Update step stats inside campaign doc
        try {
          const freshCampSnap = await getDoc(dripDoc.ref);
          const freshCamp = freshCampSnap.data() || camp;
          const updatedSteps = (freshCamp.steps || camp.steps).map((st: any) => {
            if (st.stepNumber === currentStepNum) {
              const curStats = st.stats || { sent: 0, delivered: 0, read: 0, failed: 0 };
              return {
                ...st,
                stats: {
                  ...curStats,
                  sent: curStats.sent + (dispatchSuccess ? 1 : 0),
                  failed: curStats.failed + (dispatchSuccess ? 0 : 1),
                },
              };
            }
            return st;
          });

          const currentCampStats = freshCamp.stats || { totalMessagesSent: 0, delivered: 0, read: 0, failed: 0 };
          await updateDoc(dripDoc.ref, {
            steps: updatedSteps,
            stats: {
              ...currentCampStats,
              totalMessagesSent: (currentCampStats.totalMessagesSent || 0) + (dispatchSuccess ? 1 : 0),
              failed: (currentCampStats.failed || 0) + (dispatchSuccess ? 0 : 1),
            },
            updatedAt: nowIso,
          });
        } catch (statErr) {
          console.warn('[DripScheduler] Stat update notice:', statErr);
        }
      }
    }
  } catch (err: any) {
    console.error('[DripScheduler] Error in checkAndExecuteDripCampaigns:', err);
  } finally {
    isProcessingDrip = false;
  }
}

/**
 * Start background polling loop for drip campaigns (every 20s)
 */
export function startDripScheduler(): void {
  if (dripInterval) return;
  console.log('[DripScheduler] Starting background WhatsApp Drip Campaign engine (every 20s)...');

  checkAndExecuteDripCampaigns().catch(() => {});

  dripInterval = setInterval(() => {
    checkAndExecuteDripCampaigns().catch((err) => {
      console.warn('[DripScheduler] Interval error:', err);
    });
  }, 20000);
}

/**
 * Handler: Toggle Drip Campaign Status (active <-> paused)
 * POST /api/drip/campaigns/:id/toggle
 */
export async function handleToggleDripCampaignStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, organizationId } = req.body;
    const orgId = (req.headers['x-organization-id'] as string) || organizationId;

    if (!id || !orgId) {
      res.status(400).json({ error: 'Campaign ID and organizationId are required.' });
      return;
    }

    const campRef = doc(serverDb, `organizations/${orgId}/drip_campaigns`, id);
    const snap = await getDoc(campRef);

    if (!snap.exists()) {
      res.status(404).json({ error: 'Drip campaign not found.' });
      return;
    }

    const newStatus = status === 'active' ? 'active' : 'paused';
    await updateDoc(campRef, {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      status: newStatus,
      message: `Drip campaign status updated to ${newStatus}.`,
    });
  } catch (err: any) {
    console.error('[handleToggleDripCampaignStatus] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to toggle drip campaign status.' });
  }
}

/**
 * Handler: Enroll recipients into a Drip Campaign
 * POST /api/drip/campaigns/:id/enroll
 */
export async function handleEnrollDripSubscribers(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { recipients, organizationId } = req.body;
    const orgId = (req.headers['x-organization-id'] as string) || organizationId;

    if (!id || !orgId || !Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: 'id, organizationId, and recipients array are required.' });
      return;
    }

    const campRef = doc(serverDb, `organizations/${orgId}/drip_campaigns`, id);
    const snap = await getDoc(campRef);

    if (!snap.exists()) {
      res.status(404).json({ error: 'Drip campaign not found.' });
      return;
    }

    const camp = snap.data();
    const firstStep = (camp.steps || [])[0];

    // Compute first step execution time
    const now = Date.now();
    let initialDelayMs = 0;
    if (firstStep && firstStep.delayValue > 0) {
      const u = firstStep.delayUnit || 'minutes';
      initialDelayMs =
        u === 'minutes'
          ? firstStep.delayValue * 60 * 1000
          : u === 'hours'
          ? firstStep.delayValue * 3600 * 1000
          : firstStep.delayValue * 86400 * 1000;
    }
    const nextExecutionAt = new Date(now + initialDelayMs).toISOString();
    const nowIso = new Date().toISOString();

    let enrolledCount = 0;
    for (const r of recipients) {
      const cleanPhone = String(r.phone || '').trim();
      if (!cleanPhone) continue;

      const subId = `sub_${cleanPhone.replace(/[^0-9]/g, '')}`;
      const subRef = doc(serverDb, `organizations/${orgId}/drip_campaigns/${id}/subscribers`, subId);

      await setDoc(
        subRef,
        {
          id: subId,
          dripCampaignId: id,
          organizationId: orgId,
          phone: cleanPhone,
          name: r.name || 'Customer',
          currentStep: 1,
          status: 'active',
          enrolledAt: nowIso,
          nextExecutionAt,
          stepHistory: [],
          updatedAt: nowIso,
        },
        { merge: true }
      );
      enrolledCount++;
    }

    // Update campaign counters
    await updateDoc(campRef, {
      enrolledCount: (camp.enrolledCount || 0) + enrolledCount,
      activeSubscribers: (camp.activeSubscribers || 0) + enrolledCount,
      updatedAt: nowIso,
    });

    res.json({
      success: true,
      enrolledCount,
      message: `Enrolled ${enrolledCount} contacts into Drip Campaign "${camp.name}".`,
    });
  } catch (err: any) {
    console.error('[handleEnrollDripSubscribers] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to enroll subscribers.' });
  }
}

/**
 * Handler: Test send a specific step of a Drip Campaign
 * POST /api/drip/campaigns/:id/test-step
 */
export async function handleTestDripStep(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { stepNumber, testPhone, organizationId, customToken, step: directStep, phoneNumberId: directPhoneId } = req.body;
    const orgId = (req.headers['x-organization-id'] as string) || organizationId;

    if (!orgId || !testPhone) {
      res.status(400).json({ error: 'organizationId and testPhone are required.' });
      return;
    }

    let step = directStep;
    let phoneNumberId = directPhoneId;
    let campName = 'Drip Sequence';
    let campToken: string | undefined = undefined;
    const targetStepNum = Number(stepNumber) || 1;

    if (!step) {
      const campRef = doc(serverDb, `organizations/${orgId}/drip_campaigns`, id);
      const snap = await getDoc(campRef);

      if (!snap.exists()) {
        res.status(404).json({ error: 'Drip campaign not found.' });
        return;
      }

      const camp = snap.data();
      campName = camp.name || 'Drip Sequence';
      campToken = camp.customToken;
      step = (camp.steps || []).find((s: any) => s.stepNumber === targetStepNum);
      phoneNumberId = phoneNumberId || camp.whatsAppAccountId || camp.phoneNumberId;
    }

    if (!step || !step.template) {
      res.status(400).json({ error: `Step ${targetStepNum} not found or missing template.` });
      return;
    }

    if (!phoneNumberId) {
      res.status(400).json({ error: 'Sender WhatsApp number is required for test send.' });
      return;
    }
    const stepHeaderMedia = step.headerMediaUrl || step.variableValues?.header_media_url || step.variableValues?.media_url;
    const recipient = {
      phone: testPhone.trim(),
      name: 'Test Recipient',
      variableValues: {
        ...(step.variableValues || {}),
        body_1: step.variableValues?.body_1 || 'Test Name',
        ...(stepHeaderMedia ? { header_media_url: stepHeaderMedia, media_url: stepHeaderMedia } : {}),
      },
    };

    await executeCampaignDispatchCore({
      phoneNumberId,
      template: step.template,
      recipients: [recipient],
      variableValues: recipient.variableValues,
      customToken: customToken || campToken,
      campaignId: `test_drip_${id}`,
      campaignName: `[TEST] ${campName} - Step ${targetStepNum}`,
      organizationId: orgId,
    });

    res.json({
      success: true,
      message: `Test template for Step ${targetStepNum} sent successfully to ${testPhone}!`,
    });
  } catch (err: any) {
    console.error('[handleTestDripStep] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to send test drip step.' });
  }
}

/**
 * Handler: Advance or trigger subscriber immediately to next step
 * POST /api/drip/campaigns/:id/subscribers/:subId/advance
 */
export async function handleAdvanceDripSubscriber(req: Request, res: Response): Promise<void> {
  try {
    const { id, subId } = req.params;
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId;

    if (!id || !subId || !orgId) {
      res.status(400).json({ error: 'id, subId, and organizationId are required.' });
      return;
    }

    const subRef = doc(serverDb, `organizations/${orgId}/drip_campaigns/${id}/subscribers`, subId);
    const subSnap = await getDoc(subRef);

    if (!subSnap.exists()) {
      res.status(404).json({ error: 'Subscriber not found.' });
      return;
    }

    // Set nextExecutionAt to now so background runner executes immediately
    await updateDoc(subRef, {
      nextExecutionAt: new Date(Date.now() - 5000).toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Run trigger immediately
    checkAndExecuteDripCampaigns().catch(() => {});

    res.json({
      success: true,
      message: `Subscriber marked to trigger immediately.`,
    });
  } catch (err: any) {
    console.error('[handleAdvanceDripSubscriber] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to advance subscriber.' });
  }
}

/**
 * Handler: Cancel a subscriber from Drip Campaign
 * POST /api/drip/campaigns/:id/subscribers/:subId/cancel
 */
export async function handleCancelDripSubscriber(req: Request, res: Response): Promise<void> {
  try {
    const { id, subId } = req.params;
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId;

    if (!id || !subId || !orgId) {
      res.status(400).json({ error: 'id, subId, and organizationId are required.' });
      return;
    }

    const subRef = doc(serverDb, `organizations/${orgId}/drip_campaigns/${id}/subscribers`, subId);
    await updateDoc(subRef, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Subscriber cancelled from drip sequence.',
    });
  } catch (err: any) {
    console.error('[handleCancelDripSubscriber] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to cancel subscriber.' });
  }
}

/**
 * Handler: Scan and Refresh Audience Progress data
 * POST /api/drip/campaigns/:id/rescan
 */
export async function handleRescanDripCampaign(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId;

    if (!id || !orgId) {
      res.status(400).json({ error: 'id and organizationId are required.' });
      return;
    }

    const campRef = doc(serverDb, `organizations/${orgId}/drip_campaigns`, id);
    const snap = await getDoc(campRef);

    if (!snap.exists()) {
      res.status(404).json({ error: 'Drip campaign not found.' });
      return;
    }

    const camp = snap.data();
    const subsRef = collection(serverDb, `organizations/${orgId}/drip_campaigns/${id}/subscribers`);
    const subsSnap = await getDocs(subsRef);

    let totalSubscribers = subsSnap.size;
    let completedSubscribers = 0;
    let activeSubscribers = 0;
    let cancelledSubscribers = 0;
    let totalMessagesSent = 0;
    let failedMessages = 0;

    // Track per-step waiting and next execution times
    const stepStatsMap: Record<number, { sent: number; failed: number; waiting: number; nextExecutionAt: string | null }> = {};
    (camp.steps || []).forEach((st: any) => {
      stepStatsMap[st.stepNumber] = { sent: 0, failed: 0, waiting: 0, nextExecutionAt: null };
    });

    subsSnap.forEach((docItem) => {
      const sub = docItem.data();
      if (sub.status === 'completed') {
        completedSubscribers++;
      } else if (sub.status === 'active') {
        activeSubscribers++;
        const curStep = sub.currentStep || 1;
        if (stepStatsMap[curStep]) {
          stepStatsMap[curStep].waiting++;
          if (sub.nextExecutionAt) {
            const currentEarliest = stepStatsMap[curStep].nextExecutionAt;
            if (!currentEarliest || new Date(sub.nextExecutionAt).getTime() < new Date(currentEarliest).getTime()) {
              stepStatsMap[curStep].nextExecutionAt = sub.nextExecutionAt;
            }
          }
        }
      } else if (sub.status === 'cancelled') {
        cancelledSubscribers++;
      }

      if (Array.isArray(sub.stepHistory)) {
        sub.stepHistory.forEach((h: any) => {
          if (h.status === 'sent') {
            totalMessagesSent++;
            if (stepStatsMap[h.stepNumber]) stepStatsMap[h.stepNumber].sent++;
          } else if (h.status === 'failed') {
            failedMessages++;
            if (stepStatsMap[h.stepNumber]) stepStatsMap[h.stepNumber].failed++;
          }
        });
      }
    });

    const updatedSteps = (camp.steps || []).map((st: any) => {
      const sMap = stepStatsMap[st.stepNumber] || { sent: 0, failed: 0, waiting: 0, nextExecutionAt: null };
      return {
        ...st,
        stats: {
          sent: sMap.sent,
          delivered: sMap.sent,
          read: 0,
          failed: sMap.failed,
        },
        waitingSubscribers: sMap.waiting,
        nextExecutionAt: sMap.nextExecutionAt,
      };
    });

    const nowIso = new Date().toISOString();
    await updateDoc(campRef, {
      enrolledCount: totalSubscribers,
      activeSubscribers,
      completedSubscribers,
      steps: updatedSteps,
      stats: {
        totalMessagesSent,
        delivered: totalMessagesSent,
        read: 0,
        failed: failedMessages,
      },
      lastScannedAt: nowIso,
      updatedAt: nowIso,
    });

    // Run background worker to execute any steps that are now due
    checkAndExecuteDripCampaigns().catch(() => {});

    res.json({
      success: true,
      enrolledCount: totalSubscribers,
      completedSubscribers,
      activeSubscribers,
      totalMessagesSent,
      message: `Audience progress synced: Scanned ${totalSubscribers} subscribers (${completedSubscribers} completed, ${activeSubscribers} in progress).`,
    });
  } catch (err: any) {
    console.error('[handleRescanDripCampaign] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to scan and refresh audience progress.' });
  }
}
