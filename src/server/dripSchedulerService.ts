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

        // 3. Prepare dispatch for this subscriber's step
        const phoneNumberId = camp.whatsAppAccountId || camp.phoneNumberId;
        const template = currentStep.template;
        const stepHeaderMedia = currentStep.headerMediaUrl || currentStep.variableValues?.header_media_url || currentStep.variableValues?.media_url;
        const recipient = {
          phone: sub.phone,
          name: sub.name,
          variableValues: {
            ...(currentStep.variableValues || {}),
            body_1: sub.name || currentStep.variableValues?.body_1 || 'Customer',
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
            const delayVal = Number(nextStep.delayValue) || 1;
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
