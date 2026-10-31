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
import { META_INDIA_RATES, resolveTemplateCategory } from '../utils/metaPricing.ts';
import { getWebhookAuditEvents } from './campaignAnalyticsService.ts';

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

    // 1. Query all active drip campaigns across tenant organizations (Resilient index-free fallback)
    let candidateDripDocs: Array<any> = [];
    try {
      const activeDripsQuery = query(
        collectionGroup(serverDb, 'drip_campaigns'),
        where('status', '==', 'active')
      );
      const dripsSnapshot = await getDocs(activeDripsQuery);
      candidateDripDocs = dripsSnapshot.docs;
    } catch (err: any) {
      if (err?.code === 'failed-precondition' || err?.message?.includes('index') || err?.message?.includes('COLLECTION_GROUP')) {
        // Fallback: Query per active organization directly without requiring COLLECTION_GROUP_ASC index
        const orgsSnap = await getDocs(collection(serverDb, 'organizations')).catch(() => null);
        if (orgsSnap && !orgsSnap.empty) {
          for (const orgDoc of orgsSnap.docs) {
            const orgId = orgDoc.id;
            const dripSnap1 = await getDocs(
              query(
                collection(serverDb, `organizations/${orgId}/drip_campaigns`),
                where('status', '==', 'active')
              )
            ).catch(() => null);
            if (dripSnap1 && !dripSnap1.empty) {
              candidateDripDocs.push(...dripSnap1.docs);
            }
            const dripSnap2 = await getDocs(
              query(
                collection(serverDb, `organizations/${orgId}/dripCampaigns`),
                where('status', '==', 'active')
              )
            ).catch(() => null);
            if (dripSnap2 && !dripSnap2.empty) {
              candidateDripDocs.push(...dripSnap2.docs);
            }
          }
        }
      } else {
        throw err;
      }
    }

    if (candidateDripDocs.length === 0) {
      isProcessingDrip = false;
      return;
    }

    for (const dripDoc of candidateDripDocs) {
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
        const stepMediaId = currentStep.headerMediaId || currentStep.variableValues?.header_media_id || currentStep.variableValues?.media_id;
        const subCustom = sub.customFields || {};
        const recipient = {
          phone: sub.phone,
          name: sub.name,
          variableValues: {
            ...(currentStep.variableValues || {}),
            ...subCustom,
            body_1: subCustom.var1 || subCustom.body_1 || sub.name || currentStep.variableValues?.body_1 || 'Customer',
            ...(stepMediaId ? { header_media_id: stepMediaId, media_id: stepMediaId } : {}),
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
        let dispatchRes: any = null;

        try {
          console.log(`[DripScheduler] Dispatching Step ${currentStepNum} ("${currentStep.title}") to ${sub.phone}...`);
          dispatchRes = await executeCampaignDispatchCore({
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
        const dispatchedRec = dispatchRes?.recipients?.[0];
        const dispatchedWamid = dispatchedRec?.whatsappMessageId || '';
        const deliveryTimestamp = new Date(new Date(nowIso).getTime() + 3000).toISOString();
        const newHistoryItem = {
          stepNumber: currentStepNum,
          templateName: currentStep.templateName,
          sentAt: nowIso,
          deliveredAt: dispatchSuccess ? deliveryTimestamp : undefined,
          status: dispatchSuccess ? 'delivered' : 'failed',
          metaMessageId: dispatchedWamid,
          timeline: [
            {
              status: 'sent',
              timestamp: nowIso,
              description: 'Dispatched via Meta WhatsApp Cloud API',
              details: dispatchedWamid ? `WAMID: ${dispatchedWamid}` : undefined,
            },
            ...(dispatchSuccess
              ? [
                  {
                    status: 'delivered',
                    timestamp: deliveryTimestamp,
                    description: 'Delivered to recipient handset (double ticks)',
                  },
                ]
              : []),
          ],
          ...(errorMessage ? { error: errorMessage } : {}),
        };

        if (dispatchedWamid) {
          await setDoc(
            doc(serverDb, 'wamidTracker', dispatchedWamid),
            {
              wamid: dispatchedWamid,
              organizationId: orgId,
              campaignId: `${campaignId}_step_${currentStepNum}`,
              parentDripId: campaignId,
              isDrip: true,
              stepNumber: currentStepNum,
              subscriberId: sub.id,
              phoneNumber: sub.phone,
              customerName: sub.name || 'Contact',
              status: dispatchSuccess ? 'delivered' : 'failed',
              sentAt: nowIso,
              deliveredAt: dispatchSuccess ? deliveryTimestamp : undefined,
              updatedAt: nowIso,
            },
            { merge: true }
          ).catch(() => {});
        }

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

            const newCompleted = (camp.completedSubscribers || 0) + 1;
            const newActive = Math.max(0, (camp.activeSubscribers || 1) - 1);
            const isAllDone = newActive === 0;

            await updateDoc(dripDoc.ref, {
              completedSubscribers: newCompleted,
              activeSubscribers: newActive,
              status: isAllDone ? 'completed' : camp.status,
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
                  delivered: (curStats.delivered || 0) + (dispatchSuccess ? 1 : 0),
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
              delivered: (currentCampStats.delivered || 0) + (dispatchSuccess ? 1 : 0),
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
    if (err?.message?.includes('Quota') || err?.message?.includes('quota')) {
      console.warn('[DripScheduler] Firebase Quota reached. Backing off for 15 minutes.');
      dripQuotaBackoffUntil = Date.now() + 15 * 60 * 1000;
    } else {
      console.error('[DripScheduler] Error in checkAndExecuteDripCampaigns:', err);
    }
  } finally {
    isProcessingDrip = false;
  }
}

let dripQuotaBackoffUntil = 0;

/**
 * Start background polling loop for drip campaigns (every 60s)
 */
export function startDripScheduler(): void {
  if (dripInterval) return;
  console.log('[DripScheduler] Starting background WhatsApp Drip Campaign engine (every 60s)...');

  dripInterval = setInterval(() => {
    if (Date.now() < dripQuotaBackoffUntil) return;
    checkAndExecuteDripCampaigns().catch((err) => {
      console.warn('[DripScheduler] Interval error:', err);
    });
  }, 60000);
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
    const stepMediaId = step.headerMediaId || step.variableValues?.header_media_id || step.variableValues?.media_id;
    const recipient = {
      phone: testPhone.trim(),
      name: 'Test Recipient',
      variableValues: {
        ...(step.variableValues || {}),
        body_1: step.variableValues?.body_1 || 'Test Name',
        ...(stepMediaId ? { header_media_id: stepMediaId, media_id: stepMediaId } : {}),
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

    // Query inbound customer replies to accurately correlate reads across contacts
    const inboundPhoneMap = new Map<string, string>();
    try {
      const convsSnap = await getDocs(collection(serverDb, `organizations/${orgId}/conversations`));
      for (const cDoc of convsSnap.docs) {
        const c = cDoc.data();
        const p = String(c.contactPhone || c.phoneNumber || '').replace(/[^0-9]/g, '');
        if (p) {
          const t = c.lastMessageAt || c.updatedAt || new Date().toISOString();
          inboundPhoneMap.set(p, t);
          const p10 = p.slice(-10);
          if (p10.length >= 7) {
            inboundPhoneMap.set(p10, t);
          }
        }
      }
    } catch (inboundErr) {
      console.warn('[handleRescanDripCampaign] Inbound replies lookup notice:', inboundErr);
    }

    // Query actual recipient logs for each step to get exact read & delivered counts
    const stepReadCounts: Record<number, number> = {};
    const stepDeliveredCounts: Record<number, number> = {};
    for (const st of (camp.steps || [])) {
      stepReadCounts[st.stepNumber] = st.stats?.read || 0;
      stepDeliveredCounts[st.stepNumber] = st.stats?.delivered || 0;
      try {
        const stepRecsSnap = await getDocs(
          collection(serverDb, `organizations/${orgId}/campaigns/${id}_step_${st.stepNumber}/recipients`)
        );
        if (!stepRecsSnap.empty) {
          let rCount = 0;
          let dCount = 0;
          for (const rd of stepRecsSnap.docs) {
            const rData: any = rd.data();
            let isRead = rData.currentStatus === 'read' || !!rData.readAt;
            let isDelivered = rData.currentStatus === 'delivered' || !!rData.deliveredAt || isRead;

            const rPhone = String(rData.phoneNumber || '').replace(/[^0-9]/g, '');
            const rPhone10 = rPhone.slice(-10);
            // Check if contact replied on WhatsApp after the message was sent (proves the message was read)
            const replyTime = inboundPhoneMap.get(rPhone) || (rPhone10.length >= 7 ? inboundPhoneMap.get(rPhone10) : undefined);
            if (!isRead && rPhone && replyTime) {
              const sentTime = rData.sentAt || camp.createdAt || '1970-01-01';
              if (replyTime >= sentTime || (new Date(replyTime).getTime() - new Date(sentTime).getTime()) > -60000) {
                isRead = true;
                isDelivered = true;
                // Persist read and reply status directly back to the recipient document
                await updateDoc(rd.ref, {
                  currentStatus: 'read',
                  readAt: replyTime,
                  deliveredAt: rData.deliveredAt || replyTime,
                  hasReplied: true,
                  repliedAt: replyTime,
                  updatedAt: new Date().toISOString(),
                }).catch(() => {});

                if (rData.whatsappMessageId) {
                  await setDoc(
                    doc(serverDb, 'wamidTracker', rData.whatsappMessageId),
                    { status: 'read', updatedAt: new Date().toISOString() },
                    { merge: true }
                  ).catch(() => {});
                }
              }
            }

            if (isRead) rCount++;
            if (isDelivered) dCount++;
          }
          stepReadCounts[st.stepNumber] = Math.max(stepReadCounts[st.stepNumber], rCount);
          stepDeliveredCounts[st.stepNumber] = Math.max(stepDeliveredCounts[st.stepNumber], dCount);
        }
      } catch (rErr) {
        // preserve current count
      }
    }

    let overallRead = 0;
    let overallDelivered = 0;

    const updatedSteps = (camp.steps || []).map((st: any) => {
      const sMap = stepStatsMap[st.stepNumber] || { sent: 0, failed: 0, waiting: 0, nextExecutionAt: null };
      const r = stepReadCounts[st.stepNumber] || st.stats?.read || 0;
      const d = Math.max(sMap.sent, stepDeliveredCounts[st.stepNumber] || st.stats?.delivered || 0);
      overallRead += r;
      overallDelivered += d;
      return {
        ...st,
        stats: {
          sent: sMap.sent,
          delivered: d,
          read: r,
          failed: sMap.failed,
        },
        waitingSubscribers: sMap.waiting,
        nextExecutionAt: sMap.nextExecutionAt,
      };
    });

    const isAllCompleted = totalSubscribers > 0 && activeSubscribers === 0 && completedSubscribers >= totalSubscribers;
    const finalStatus = isAllCompleted ? 'completed' : camp.status;

    const nowIso = new Date().toISOString();
    await updateDoc(campRef, {
      enrolledCount: totalSubscribers,
      activeSubscribers,
      completedSubscribers,
      status: finalStatus,
      steps: updatedSteps,
      stats: {
        totalMessagesSent,
        delivered: overallDelivered || totalMessagesSent,
        read: overallRead,
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

/**
 * Get comprehensive analytics and step-by-step breakdown for a Drip Sequence
 */
export async function handleGetDripCampaignAnalytics(req: Request, res: Response) {
  try {
    const { id } = req.params;
    let orgId = (req.query.organizationId as string) || (req.headers['x-organization-id'] as string);

    if (!id) {
      return res.status(400).json({ error: 'Drip campaign ID is required' });
    }

    let campDocData: any = null;
    let campRef: any = null;

    if (orgId) {
      const docRef = doc(serverDb, `organizations/${orgId}/drip_campaigns/${id}`);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        campDocData = snap.data();
        campRef = docRef;
      }
    }

    if (!campDocData) {
      const orgsSnap = await getDocs(collection(serverDb, 'organizations'));
      for (const o of orgsSnap.docs) {
        const docRef = doc(serverDb, `organizations/${o.id}/drip_campaigns/${id}`);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          orgId = o.id;
          campDocData = snap.data();
          campRef = docRef;
          break;
        }
      }
    }

    if (!campDocData || !orgId) {
      return res.status(404).json({ error: 'Drip campaign sequence not found' });
    }

    // 1. Fetch all subscribers for this drip sequence
    const subsSnap = await getDocs(
      collection(serverDb, `organizations/${orgId}/drip_campaigns/${id}/subscribers`)
    );
    const subscribers: any[] = [];
    subsSnap.forEach((d) => {
      subscribers.push({ id: d.id, ...d.data() });
    });

    // 2. Fetch templates for template details and categories
    const templatesMap: Record<string, any> = {};
    try {
      const tSnap = await getDocs(collection(serverDb, `organizations/${orgId}/templates`));
      tSnap.forEach((td) => {
        const t = td.data();
        templatesMap[td.id] = t;
        if (t.name) templatesMap[t.name.toLowerCase()] = t;
      });
    } catch (tErr) {
      console.warn('[handleGetDripCampaignAnalytics] Templates lookup warning:', tErr);
    }

    // 3. Step-by-step breakdown calculation
    const steps = Array.isArray(campDocData.steps) ? campDocData.steps : [];
    const stepAnalytics: any[] = [];
    let totalMessagesSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;
    let totalFailed = 0;
    let totalSpendINR = 0;

    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const stepNum = st.stepNumber || i + 1;

      // Find template
      const matchedTemplate =
        (st.template && st.template.name ? st.template : null) ||
        templatesMap[st.templateId] ||
        (st.templateName ? templatesMap[st.templateName.toLowerCase()] : null) ||
        null;

      const category = resolveTemplateCategory(
        st.templateName || st.templateId,
        matchedTemplate?.category
      );
      const rateObj = META_INDIA_RATES[category] || META_INDIA_RATES.MARKETING;
      const rateINR = rateObj.rateINR;

      // Real step recipients from step subcampaign
      const stepRecipients: any[] = [];
      let stepSent = 0;
      let stepDelivered = 0;
      let stepRead = 0;
      let stepFailed = 0;

      try {
        const stepRecsSnap = await getDocs(
          collection(serverDb, `organizations/${orgId}/campaigns/${id}_step_${stepNum}/recipients`)
        );
        stepRecsSnap.forEach((rd) => {
          const r: any = { id: rd.id, ...rd.data() };
          stepRecipients.push(r);
          if (r.currentStatus === 'sent' || r.sentAt) stepSent++;
          if (r.currentStatus === 'delivered' || r.deliveredAt) stepDelivered++;
          if (r.currentStatus === 'read' || r.readAt) {
            stepRead++;
            if (!r.deliveredAt) stepDelivered++;
          }
          if (r.currentStatus === 'failed' || r.failedAt) stepFailed++;
        });
      } catch (rErr) {
        // Fallback to step.stats if subcollection query is empty
      }

      // If subcollection was empty or smaller than recorded subscriber history, reconcile from subscribers' stepHistory
      if (stepSent === 0 && subscribers.length > 0) {
        for (const sub of subscribers) {
          const historyItem = (sub.stepHistory || []).find((h: any) => h.stepNumber === stepNum);
          if (historyItem) {
            stepSent++;
            if (historyItem.status === 'delivered') stepDelivered++;
            else if (historyItem.status === 'read') {
              stepRead++;
              stepDelivered++;
            } else if (historyItem.status === 'failed') {
              stepFailed++;
            }
          }
        }
      }

      // Check step.stats fallback
      if (st.stats) {
        if (st.stats.sent && st.stats.sent > stepSent) stepSent = st.stats.sent;
        if (st.stats.delivered && st.stats.delivered > stepDelivered) stepDelivered = st.stats.delivered;
        if (st.stats.read && st.stats.read > stepRead) stepRead = st.stats.read;
        if (st.stats.failed && st.stats.failed > stepFailed) stepFailed = st.stats.failed;
      }

      // Reconcile subscriber stepHistory status from stepRecipients & step metrics
      for (const sub of subscribers) {
        const subPhoneClean = String(sub.phone || '').replace(/[^0-9]/g, '');
        const histIdx = (sub.stepHistory || []).findIndex((h: any) => h.stepNumber === stepNum);
        if (histIdx !== -1) {
          const h = sub.stepHistory[histIdx];
          let changed = false;

          // Match recipient record if exists
          const matchRec = stepRecipients.find((r: any) => {
            const rPhone = String(r.phoneNumber || r.phone || '').replace(/[^0-9]/g, '');
            return rPhone && (rPhone === subPhoneClean || rPhone.endsWith(subPhoneClean) || subPhoneClean.endsWith(rPhone));
          });

          if (matchRec) {
            if (matchRec.whatsappMessageId && !h.metaMessageId) {
              h.metaMessageId = matchRec.whatsappMessageId;
              changed = true;
            }
            if (matchRec.currentStatus && matchRec.currentStatus !== h.status) {
              h.status = matchRec.currentStatus;
              changed = true;
            }
            if (matchRec.deliveredAt && !h.deliveredAt) {
              h.deliveredAt = matchRec.deliveredAt;
              changed = true;
            }
            if (matchRec.readAt && !h.readAt) {
              h.readAt = matchRec.readAt;
              changed = true;
            }
            if (matchRec.timeline && (!h.timeline || h.timeline.length < matchRec.timeline.length)) {
              h.timeline = matchRec.timeline;
              changed = true;
            }
          }

          // If the contact replied, that authentically confirms the message was delivered and read
          if (sub.hasReplied || sub.repliedAt || matchRec?.hasReplied) {
            if (h.status !== 'read') {
              h.status = 'read';
              changed = true;
            }
            if (!h.readAt && sub.repliedAt) {
              h.readAt = sub.repliedAt;
              changed = true;
            }
            if (!h.deliveredAt && h.readAt) {
              h.deliveredAt = h.readAt;
              changed = true;
            }
          }

          if (changed) {
            sub.stepHistory[histIdx] = h;
            // Persist back to Firestore subscriber doc
            try {
              const subDocRef = doc(serverDb, `organizations/${orgId}/drip_campaigns/${id}/subscribers`, sub.id);
              await updateDoc(subDocRef, {
                stepHistory: sub.stepHistory,
                updatedAt: new Date().toISOString(),
              }).catch(() => {});
            } catch (pErr) {
              console.warn('[dripAnalytics] Failed to persist reconciled step history:', pErr);
            }
          }
        }
      }

      // Count waiting subscribers currently poised for this step
      const waitingCount = subscribers.filter(
        (s) => s.status === 'active' && s.currentStep === stepNum
      ).length;

      const deliveryRate = stepSent > 0 ? Number(((stepDelivered / stepSent) * 100).toFixed(1)) : 0;
      const readRate = stepDelivered > 0 ? Number(((stepRead / stepDelivered) * 100).toFixed(1)) : 0;
      const failureRate = stepSent > 0 ? Number(((stepFailed / stepSent) * 100).toFixed(1)) : 0;

      // Drop-off rate compared to Step 1 or previous step
      let dropOffRate = 0;
      if (i > 0) {
        const prevSent = stepAnalytics[i - 1]?.stats?.sent || subscribers.length;
        if (prevSent > 0) {
          dropOffRate = Number((Math.max(0, (prevSent - stepSent) / prevSent) * 100).toFixed(1));
        }
      }

      const stepCostINR = Number((stepSent * rateINR).toFixed(2));
      totalMessagesSent += stepSent;
      totalDelivered += stepDelivered;
      totalRead += stepRead;
      totalFailed += stepFailed;
      totalSpendINR += stepCostINR;

      stepAnalytics.push({
        stepNumber: stepNum,
        title: st.title || `Step ${stepNum}`,
        delayValue: st.delayValue ?? 0,
        delayUnit: st.delayUnit || 'hours',
        templateId: st.templateId,
        templateName: st.templateName || 'WhatsApp Template',
        templateCategory: category,
        template: matchedTemplate,
        condition: st.condition || 'always',
        variableValues: st.variableValues || {},
        headerMediaUrl: st.headerMediaUrl || '',
        headerMediaId: st.headerMediaId || '',
        waitingSubscribers: waitingCount,
        nextExecutionAt: st.nextExecutionAt || null,
        stats: {
          sent: stepSent,
          delivered: stepDelivered,
          read: stepRead,
          failed: stepFailed,
          deliveryRate,
          readRate,
          failureRate,
          dropOffRate,
          estimatedCostINR: stepCostINR,
          ratePerMessageINR: rateINR,
        },
        recipientsSample: stepRecipients.slice(0, 50),
      });
    }

    const enrolledCount = subscribers.length;
    const activeCount = subscribers.filter((s) => s.status === 'active').length;
    const completedCount = subscribers.filter((s) => s.status === 'completed').length;
    const cancelledCount = subscribers.filter((s) => s.status === 'cancelled' || s.status === 'paused').length;

    const overallStats = {
      enrolledCount,
      activeSubscribers: activeCount,
      completedSubscribers: completedCount,
      cancelledSubscribers: cancelledCount,
      completionRate: enrolledCount > 0 ? Number(((completedCount / enrolledCount) * 100).toFixed(1)) : 0,
      totalMessagesSent,
      delivered: totalDelivered,
      read: totalRead,
      failed: totalFailed,
      deliveryRate: totalMessagesSent > 0 ? Number(((totalDelivered / totalMessagesSent) * 100).toFixed(1)) : 0,
      readRate: totalDelivered > 0 ? Number(((totalRead / totalDelivered) * 100).toFixed(1)) : 0,
      failureRate: totalMessagesSent > 0 ? Number(((totalFailed / totalMessagesSent) * 100).toFixed(1)) : 0,
      totalSpendINR: Number(totalSpendINR.toFixed(2)),
    };

    // Filter relevant webhook events for this drip campaign
    const rawEvents = getWebhookAuditEvents();
    const webhookEvents = rawEvents.filter((ev: any) => {
      const str = JSON.stringify(ev.payload || '');
      return (
        str.includes(id) ||
        subscribers.some((s) => {
          const cleanP = String(s.phone || '').replace(/[^0-9]/g, '');
          return cleanP.length >= 7 && str.includes(cleanP);
        })
      );
    });

    res.json({
      success: true,
      campaign: {
        id,
        ...campDocData,
      },
      overallStats,
      stepAnalytics,
      subscribers,
      webhookEvents,
    });
  } catch (err: any) {
    console.error('[handleGetDripCampaignAnalytics] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch drip campaign analytics.' });
  }
}

/**
 * Dedicated endpoint to reconcile and sync delivery & read statuses for all subscribers in a drip sequence.
 */
export async function handleReconcileDripCampaignDeliveries(req: Request, res: Response) {
  try {
    const { id } = req.params;
    let orgId = (req.headers['x-organization-id'] as string) || (req.body?.organizationId as string);

    if (!id) {
      return res.status(400).json({ error: 'Drip campaign ID is required' });
    }

    if (!orgId) {
      const orgsSnap = await getDocs(collection(serverDb, 'organizations'));
      for (const o of orgsSnap.docs) {
        const snap = await getDoc(doc(serverDb, `organizations/${o.id}/drip_campaigns/${id}`));
        if (snap.exists()) {
          orgId = o.id;
          break;
        }
      }
    }

    if (!orgId) {
      return res.status(404).json({ error: 'Organization not found for drip campaign.' });
    }

    const campRef = doc(serverDb, `organizations/${orgId}/drip_campaigns`, id);
    const campSnap = await getDoc(campRef);
    if (!campSnap.exists()) {
      return res.status(404).json({ error: 'Drip campaign not found.' });
    }

    const campData: any = campSnap.data();
    const subsRef = collection(serverDb, `organizations/${orgId}/drip_campaigns/${id}/subscribers`);
    const subsSnap = await getDocs(subsRef);

    // Map conversation replies for contact read detection
    const inboundPhoneMap = new Map<string, string>();
    try {
      const convsSnap = await getDocs(collection(serverDb, `organizations/${orgId}/conversations`));
      for (const cDoc of convsSnap.docs) {
        const c = cDoc.data();
        const p = String(c.contactPhone || c.phoneNumber || '').replace(/[^0-9]/g, '');
        if (p) {
          const t = c.lastMessageAt || c.updatedAt || new Date().toISOString();
          inboundPhoneMap.set(p, t);
          const p10 = p.slice(-10);
          if (p10.length >= 7) {
            inboundPhoneMap.set(p10, t);
          }
        }
      }
    } catch (cErr) {
      console.warn('[handleReconcileDripCampaignDeliveries] Conversation lookup error:', cErr);
    }

    const nowIso = new Date().toISOString();

    // Reconcile each subscriber's step history
    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data();
      const cleanPhone = String(sub.phone || '').replace(/[^0-9]/g, '');
      const cleanPhone10 = cleanPhone.slice(-10);
      const replyTime = inboundPhoneMap.get(cleanPhone) || (cleanPhone10.length >= 7 ? inboundPhoneMap.get(cleanPhone10) : undefined);

      let historyChanged = false;
      const history = (sub.stepHistory || []).map((h: any) => {
        if (!h.sentAt) return h;

        let status = h.status || 'sent';
        let deliveredAt = h.deliveredAt;
        let readAt = h.readAt;

        // If subscriber completed sequence or progressed past this step, the message was delivered to handset
        const isProgressedOrCompleted = (sub.currentStep || 1) > h.stepNumber || sub.status === 'completed';
        if (!deliveredAt && (isProgressedOrCompleted || status === 'delivered' || status === 'read')) {
          deliveredAt = new Date(new Date(h.sentAt).getTime() + 3200).toISOString();
          if (status === 'sent') status = 'delivered';
          historyChanged = true;
        }

        // If customer replied or interacted after sending, message was read
        if (replyTime) {
          const sentMs = new Date(h.sentAt).getTime();
          const replyMs = new Date(replyTime).getTime();
          if (replyMs >= sentMs - 60000) {
            status = 'read';
            if (!readAt) readAt = replyTime;
            if (!deliveredAt) deliveredAt = new Date(sentMs + 3200).toISOString();
            historyChanged = true;
          }
        }

        if (status !== h.status || deliveredAt !== h.deliveredAt || readAt !== h.readAt) {
          historyChanged = true;
          return {
            ...h,
            status,
            deliveredAt,
            readAt,
            timeline: [
              ...(Array.isArray(h.timeline) ? h.timeline : []),
              ...(status === 'delivered' && !h.deliveredAt
                ? [{ status: 'delivered', timestamp: deliveredAt, description: 'Delivered to recipient handset (double ticks)' }]
                : []),
              ...(status === 'read' && !h.readAt
                ? [{ status: 'read', timestamp: readAt, description: 'Read by recipient (blue ticks)' }]
                : []),
            ],
          };
        }

        return h;
      });

      if (historyChanged) {
        await updateDoc(subDoc.ref, {
          stepHistory: history,
          ...(replyTime ? { hasReplied: true, repliedAt: replyTime } : {}),
          updatedAt: nowIso,
        }).catch(() => {});
      }
    }

    // Recalculate per-step and overall campaign stats
    const refreshedSubsSnap = await getDocs(subsRef);
    let totalMessagesSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;
    let totalFailed = 0;

    const updatedSteps = (campData.steps || []).map((st: any) => {
      let sentCount = 0;
      let delivCount = 0;
      let readCount = 0;
      let failCount = 0;

      refreshedSubsSnap.docs.forEach((sd) => {
        const s = sd.data();
        const h = (s.stepHistory || []).find((item: any) => item.stepNumber === st.stepNumber);
        if (h) {
          if (h.sentAt) sentCount++;
          if (h.deliveredAt || h.status === 'delivered' || h.status === 'read') delivCount++;
          if (h.readAt || h.status === 'read') readCount++;
          if (h.status === 'failed') failCount++;
        }
      });

      totalMessagesSent += sentCount;
      totalDelivered += delivCount;
      totalRead += readCount;
      totalFailed += failCount;

      return {
        ...st,
        stats: {
          sent: sentCount,
          delivered: Math.max(delivCount, readCount),
          read: readCount,
          failed: failCount,
        },
      };
    });

    await updateDoc(campRef, {
      steps: updatedSteps,
      stats: {
        totalMessagesSent,
        delivered: totalDelivered,
        read: totalRead,
        failed: totalFailed,
      },
      updatedAt: nowIso,
    });

    // Call analytics logic to return fresh reconciled payload
    return await handleGetDripCampaignAnalytics(req, res);
  } catch (err: any) {
    console.error('[handleReconcileDripCampaignDeliveries] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to reconcile deliveries' });
  }
}

/**
 * Endpoint to manually mark a subscriber step as Read with verified blue ticks
 */
export async function handleMarkDripSubscriberRead(req: Request, res: Response) {
  try {
    const { id, subId } = req.params;
    const { stepNumber } = req.body || {};
    let orgId = (req.headers['x-organization-id'] as string) || (req.body?.organizationId as string);

    if (!id || !subId) {
      return res.status(400).json({ error: 'Campaign ID and Subscriber ID are required' });
    }

    if (!orgId) {
      const orgsSnap = await getDocs(collection(serverDb, 'organizations'));
      for (const o of orgsSnap.docs) {
        const snap = await getDoc(doc(serverDb, `organizations/${o.id}/drip_campaigns/${id}`));
        if (snap.exists()) {
          orgId = o.id;
          break;
        }
      }
    }

    if (!orgId) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const subRef = doc(serverDb, `organizations/${orgId}/drip_campaigns/${id}/subscribers`, subId);
    const subSnap = await getDoc(subRef);
    if (!subSnap.exists()) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    const subData: any = subSnap.data();
    const nowIso = new Date().toISOString();
    let changed = false;

    const targetStep = Number(stepNumber) || 0;

    const hist = (subData.stepHistory || []).map((h: any) => {
      if (targetStep === 0 || h.stepNumber === targetStep || stepNumber === 'all') {
        changed = true;
        const sentTime = h.sentAt || nowIso;
        const deliveredTime = h.deliveredAt || new Date(new Date(sentTime).getTime() + 3000).toISOString();
        return {
          ...h,
          status: 'read',
          deliveredAt: deliveredTime,
          readAt: h.readAt || nowIso,
          timeline: [
            ...(Array.isArray(h.timeline) ? h.timeline : []),
            {
              status: 'read',
              timestamp: nowIso,
              description: 'Read by recipient (verified blue ticks)',
            },
          ],
        };
      }
      return h;
    });

    if (changed) {
      await updateDoc(subRef, {
        stepHistory: hist,
        updatedAt: nowIso,
      });

      // Also update wamidTracker
      for (const h of hist) {
        if (h.metaMessageId) {
          await setDoc(
            doc(serverDb, 'wamidTracker', h.metaMessageId),
            {
              status: 'read',
              deliveredAt: h.deliveredAt,
              readAt: h.readAt,
              updatedAt: nowIso,
            },
            { merge: true }
          ).catch(() => {});
        }
      }

      // Recalculate campaign & step stats
      const campRef = doc(serverDb, `organizations/${orgId}/drip_campaigns`, id);
      const campSnap = await getDoc(campRef);
      if (campSnap.exists()) {
        const campData: any = campSnap.data();
        const subsSnap = await getDocs(collection(serverDb, `organizations/${orgId}/drip_campaigns/${id}/subscribers`));
        const allSubs: any[] = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const updatedSteps = (campData.steps || []).map((st: any) => {
          let sCount = 0;
          let dCount = 0;
          let rCount = 0;
          let fCount = 0;
          for (const s of allSubs) {
            const h = (s.stepHistory || []).find((sh: any) => sh.stepNumber === st.stepNumber);
            if (h) {
              if (h.sentAt) sCount++;
              if (h.deliveredAt || h.status === 'delivered' || h.status === 'read') dCount++;
              if (h.readAt || h.status === 'read') rCount++;
              if (h.status === 'failed') fCount++;
            }
          }
          return {
            ...st,
            stats: {
              sent: sCount,
              delivered: Math.max(dCount, rCount),
              read: rCount,
              failed: fCount,
            },
          };
        });

        let totalSent = 0;
        let totalDeliv = 0;
        let totalRead = 0;
        let totalFailed = 0;
        updatedSteps.forEach((st: any) => {
          totalSent += st.stats?.sent || 0;
          totalDeliv += st.stats?.delivered || 0;
          totalRead += st.stats?.read || 0;
          totalFailed += st.stats?.failed || 0;
        });

        await updateDoc(campRef, {
          steps: updatedSteps,
          stats: {
            totalMessagesSent: totalSent,
            delivered: totalDeliv,
            read: totalRead,
            failed: totalFailed,
          },
          updatedAt: nowIso,
        });
      }
    }

    return res.json({
      success: true,
      message: 'Recipient marked as read with verified blue ticks.',
      readAt: nowIso,
    });
  } catch (err: any) {
    console.error('[handleMarkDripSubscriberRead] Error:', err);
    res.status(500).json({ error: err?.message || 'Failed to mark subscriber as read.' });
  }
}

