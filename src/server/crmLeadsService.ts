import type { Request, Response } from 'express';
import {
  serverDb,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  deleteDoc,
} from './serverDb.ts';
import type {
  CrmLead,
  CrmLeadsSummary,
  LeadPipelineStage,
  LeadInteractionType,
} from '../types/index.ts';

// In-memory cache of CRM leads grouped by organizationId
// orgId -> Map<leadId, CrmLead>
const crmLeadsStore = new Map<string, Map<string, CrmLead>>();
const hydratedOrgs = new Set<string>();
const hydratingPromises = new Map<string, Promise<void>>();

/**
 * Recursively removes undefined fields from an object or array so Firestore never rejects writes.
 */
function cleanUndefined<T>(val: T): T {
  if (val === undefined) return undefined as any;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.filter((item) => item !== undefined).map((item) => cleanUndefined(item)) as any;
  }
  const clean: any = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (v !== undefined) {
      clean[k] = cleanUndefined(v);
    }
  }
  return clean;
}

function phonesMatch(a: string, b: string): boolean {
  const cleanA = (a || '').replace(/[^0-9]/g, '');
  const cleanB = (b || '').replace(/[^0-9]/g, '');
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.length >= 10 && cleanB.length >= 10) {
    return cleanA.slice(-10) === cleanB.slice(-10);
  }
  return false;
}

// Fresh start: No demo or fake leads are seeded by default.
// Leads are ONLY created when actual WhatsApp recipients reply or click interactive buttons.
function ensureOrgLeads(orgId: string): Map<string, CrmLead> {
  let orgMap = crmLeadsStore.get(orgId);
  if (!orgMap) {
    orgMap = new Map<string, CrmLead>();
    crmLeadsStore.set(orgId, orgMap);
  }
  return orgMap;
}

/**
 * Loads existing CRM leads for an organization from Firestore into memory.
 * Prevents leads from disappearing across server restarts or serverless cold starts.
 */
async function loadOrgLeadsFromFirestore(orgId: string, forceRefresh = false): Promise<Map<string, CrmLead>> {
  const orgMap = ensureOrgLeads(orgId);
  if (!forceRefresh && hydratedOrgs.has(orgId)) {
    return orgMap;
  }

  const inflight = hydratingPromises.get(orgId);
  if (inflight && !forceRefresh) {
    await inflight;
    return ensureOrgLeads(orgId);
  }

  const loadPromise = (async () => {
    try {
      const snapshot = await getDocs(collection(serverDb, `organizations/${orgId}/crm_leads`));
      snapshot.forEach((snapDoc) => {
        const data = snapDoc.data() as CrmLead;
        if (data && (data.id || snapDoc.id)) {
          const leadId = data.id || snapDoc.id;
          const cleanPhone = (data.cleanPhone || data.phone || '').replace(/[^0-9]/g, '');
          orgMap.set(leadId, {
            ...data,
            id: leadId,
            organizationId: data.organizationId || orgId,
            cleanPhone,
            notes: Array.isArray(data.notes) ? data.notes : [],
            dealValue: Number(data.dealValue) || 0,
            stage: data.stage || 'new',
          });
        }
      });
      hydratedOrgs.add(orgId);
    } catch (err) {
      console.warn(`[CrmLeads] Failed to hydrate leads from Firestore for org ${orgId}:`, err);
    } finally {
      hydratingPromises.delete(orgId);
    }
  })();

  hydratingPromises.set(orgId, loadPromise);
  await loadPromise;
  return orgMap;
}

/**
 * Automatically records or updates a CRM lead whenever an inbound customer
 * replies or clicks a Quick Reply button on WhatsApp!
 */
export async function recordCrmLeadFromInteraction(params: {
  organizationId: string;
  phone: string;
  customerName?: string;
  interactionType: LeadInteractionType;
  buttonText?: string;
  buttonPayload?: string;
  replyText?: string;
  campaignId?: string;
  campaignName?: string;
  templateName?: string;
}): Promise<CrmLead> {
  const {
    organizationId,
    phone,
    customerName,
    interactionType,
    buttonText,
    buttonPayload,
    replyText,
    campaignId,
    campaignName,
    templateName,
  } = params;

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const orgMap = await loadOrgLeadsFromFirestore(organizationId);

  // Check if lead with this phone already exists
  let existingLead: CrmLead | undefined;
  for (const lead of orgMap.values()) {
    if (phonesMatch(lead.cleanPhone || lead.phone, cleanPhone)) {
      existingLead = lead;
      break;
    }
  }

  const now = new Date().toISOString();

  if (existingLead) {
    existingLead.interactionType = interactionType;
    if (buttonText) existingLead.buttonText = buttonText;
    if (buttonPayload) existingLead.buttonPayload = buttonPayload;
    if (replyText) existingLead.replyText = replyText;
    if (campaignId) existingLead.campaignId = campaignId;
    if (campaignName) existingLead.campaignName = campaignName;
    if (templateName) existingLead.templateName = templateName;
    if (customerName && (!existingLead.customerName || existingLead.customerName === existingLead.phone || existingLead.customerName.startsWith('+'))) {
      existingLead.customerName = customerName;
    }
    existingLead.lastInteractedAt = now;
    existingLead.updatedAt = now;

    // Auto-progress stage if button indicates high intent
    if (interactionType === 'button_click' && existingLead.stage === 'new') {
      const lowerBtn = (buttonText || '').toLowerCase();
      if (lowerBtn.includes('interested') || lowerBtn.includes('buy') || lowerBtn.includes('demo') || lowerBtn.includes('order')) {
        existingLead.stage = 'qualified';
      } else {
        existingLead.stage = 'contacted';
      }
    }

    // Persist to Firestore (await so serverless doesn't drop the write)
    try {
      await setDoc(
        doc(serverDb, `organizations/${organizationId}/crm_leads`, existingLead.id),
        cleanUndefined(existingLead),
        { merge: true }
      );
    } catch (persistErr) {
      console.warn(`[CrmLeads] Failed to persist updated lead ${existingLead.id}:`, persistErr);
    }
    return existingLead;
  }

  // Create brand new lead
  const newLeadId = `lead_${cleanPhone}_${Date.now().toString(36)}`;
  let initialStage: LeadPipelineStage = 'new';
  if (interactionType === 'button_click') {
    const lowerBtn = (buttonText || '').toLowerCase();
    if (lowerBtn.includes('interested') || lowerBtn.includes('buy') || lowerBtn.includes('demo') || lowerBtn.includes('order')) {
      initialStage = 'qualified';
    } else {
      initialStage = 'contacted';
    }
  }

  const newLead: CrmLead = cleanUndefined({
    id: newLeadId,
    organizationId,
    customerName: customerName || `+${cleanPhone}`,
    phone: phone.startsWith('+') ? phone : `+${cleanPhone}`,
    cleanPhone,
    campaignId: campaignId || 'inbound_direct',
    campaignName: campaignName || 'Direct WhatsApp Inbound',
    templateName,
    interactionType,
    buttonText,
    buttonPayload,
    replyText,
    stage: initialStage,
    dealValue: 0,
    notes: [],
    lastInteractedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  orgMap.set(newLeadId, newLead);

  // Persist to Firestore (await so serverless doesn't drop the write)
  try {
    await setDoc(
      doc(serverDb, `organizations/${organizationId}/crm_leads`, newLeadId),
      newLead
    );
  } catch (persistErr) {
    console.warn(`[CrmLeads] Failed to persist new lead ${newLeadId}:`, persistErr);
  }
  return newLead;
}

// -------------------------------------------------------------
// EXPRESS ROUTE HANDLERS
// -------------------------------------------------------------

/**
 * GET /api/crm/leads
 * Returns list of leads for the organization with rich filtering,
 * summary counters, and available campaign/button tags.
 */
export async function handleGetCrmLeads(req: Request, res: Response): Promise<void> {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || (req.query.orgId as string) || 'org_lax_1';
    const { campaignId, interactionType, buttonText, stage, search, refresh } = req.query;

    const orgMap = await loadOrgLeadsFromFirestore(orgId, refresh === 'true');
    let leads = Array.from(orgMap.values());

    // Collect all campaigns and distinct button texts across all leads
    const campaignsSet = new Set<string>();
    const buttonsSet = new Set<string>();

    for (const lead of leads) {
      if (lead.campaignName) campaignsSet.add(lead.campaignName);
      if (lead.buttonText) buttonsSet.add(lead.buttonText);
    }

    // Apply Filters
    if (campaignId && campaignId !== 'all') {
      leads = leads.filter(
        (l) => l.campaignId === campaignId || l.campaignName === campaignId
      );
    }

    if (interactionType && interactionType !== 'all') {
      leads = leads.filter((l) => l.interactionType === interactionType);
    }

    if (buttonText && buttonText !== 'all') {
      leads = leads.filter((l) => l.buttonText === buttonText);
    }

    if (stage && stage !== 'all') {
      leads = leads.filter((l) => l.stage === stage);
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase().trim();
      leads = leads.filter(
        (l) =>
          l.customerName.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          (l.email && l.email.toLowerCase().includes(q)) ||
          (l.campaignName && l.campaignName.toLowerCase().includes(q)) ||
          (l.buttonText && l.buttonText.toLowerCase().includes(q)) ||
          (l.replyText && l.replyText.toLowerCase().includes(q))
      );
    }

    // Sort by most recently interacted first
    leads.sort((a, b) => new Date(b.lastInteractedAt).getTime() - new Date(a.lastInteractedAt).getTime());

    // Calculate Summary Stats
    const totalLeads = leads.length;
    const buttonClicksCount = leads.filter((l) => l.interactionType === 'button_click').length;
    const textRepliesCount = leads.filter((l) => l.interactionType === 'text_reply').length;
    const wonCount = leads.filter((l) => l.stage === 'won').length;
    const totalPipelineValue = leads.reduce((sum, l) => sum + (Number(l.dealValue) || 0), 0);

    const summary: CrmLeadsSummary = {
      totalLeads,
      buttonClicksCount,
      textRepliesCount,
      wonCount,
      totalPipelineValue,
      campaignsCount: campaignsSet.size,
    };

    res.json({
      success: true,
      leads,
      summary,
      campaignsList: Array.from(campaignsSet),
      availableButtons: Array.from(buttonsSet),
    });
  } catch (err: any) {
    console.error('[CrmLeads] Error in handleGetCrmLeads:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch CRM leads.' });
  }
}

/**
 * PUT /api/crm/leads/:id
 * Updates stage, dealValue, or assignedAgent
 */
export async function handleUpdateCrmLead(req: Request, res: Response): Promise<void> {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId || 'org_lax_1';
    const { id } = req.params;
    const { stage, dealValue, assignedAgentId, assignedAgentName, customerName, email } = req.body;

    const orgMap = await loadOrgLeadsFromFirestore(orgId);
    const lead = orgMap.get(id);

    if (!lead) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    if (stage) lead.stage = stage;
    if (dealValue !== undefined) lead.dealValue = Math.max(0, Number(dealValue) || 0);
    if (assignedAgentId !== undefined) lead.assignedAgentId = assignedAgentId;
    if (assignedAgentName !== undefined) lead.assignedAgentName = assignedAgentName;
    if (customerName) lead.customerName = customerName;
    if (email !== undefined) lead.email = email;
    lead.updatedAt = new Date().toISOString();

    await setDoc(
      doc(serverDb, `organizations/${orgId}/crm_leads`, id),
      cleanUndefined(lead),
      { merge: true }
    );

    res.json({ success: true, lead });
  } catch (err: any) {
    console.error('[CrmLeads] Error in handleUpdateCrmLead:', err);
    res.status(500).json({ error: err.message || 'Failed to update lead.' });
  }
}

/**
 * POST /api/crm/leads/:id/notes
 * Adds an internal comment / follow-up note to the lead
 */
export async function handleAddCrmLeadNote(req: Request, res: Response): Promise<void> {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId || 'org_lax_1';
    const { id } = req.params;
    const { text, authorName = 'Agent' } = req.body;

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Note text cannot be empty.' });
      return;
    }

    const orgMap = await loadOrgLeadsFromFirestore(orgId);
    const lead = orgMap.get(id);

    if (!lead) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    const note = {
      id: `note_${Date.now().toString(36)}`,
      text: text.trim(),
      authorName: authorName.trim(),
      createdAt: new Date().toISOString(),
    };

    if (!lead.notes) lead.notes = [];
    lead.notes.unshift(note);
    lead.updatedAt = new Date().toISOString();

    await setDoc(
      doc(serverDb, `organizations/${orgId}/crm_leads`, id),
      cleanUndefined(lead),
      { merge: true }
    );

    res.json({ success: true, note, lead });
  } catch (err: any) {
    console.error('[CrmLeads] Error in handleAddCrmLeadNote:', err);
    res.status(500).json({ error: err.message || 'Failed to add note.' });
  }
}

/**
 * POST /api/crm/leads/bulk-stage
 * Moves multiple leads to a selected pipeline stage
 */
export async function handleBulkUpdateStage(req: Request, res: Response): Promise<void> {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || req.body.organizationId || 'org_lax_1';
    const { leadIds, stage } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0 || !stage) {
      res.status(400).json({ error: 'leadIds array and target stage are required.' });
      return;
    }

    const orgMap = await loadOrgLeadsFromFirestore(orgId);

    await Promise.all(
      leadIds.map(async (id: string) => {
        const lead = orgMap.get(id);
        if (lead) {
          lead.stage = stage;
          lead.updatedAt = new Date().toISOString();
          await setDoc(
            doc(serverDb, `organizations/${orgId}/crm_leads`, id),
            cleanUndefined(lead),
            { merge: true }
          );
        }
      })
    );

    res.json({ success: true, message: `Updated ${leadIds.length} lead(s) to ${stage}.` });
  } catch (err: any) {
    console.error('[CrmLeads] Error in handleBulkUpdateStage:', err);
    res.status(500).json({ error: err.message || 'Failed to update leads in bulk.' });
  }
}

/**
 * DELETE /api/crm/leads/:id
 * Deletes a lead
 */
export async function handleDeleteCrmLead(req: Request, res: Response): Promise<void> {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || (req.query.orgId as string) || 'org_lax_1';
    const { id } = req.params;

    const orgMap = await loadOrgLeadsFromFirestore(orgId);
    orgMap.delete(id);

    await deleteDoc(doc(serverDb, `organizations/${orgId}/crm_leads`, id));

    res.json({ success: true, message: 'Lead removed.' });
  } catch (err: any) {
    console.error('[CrmLeads] Error in handleDeleteCrmLead:', err);
    res.status(500).json({ error: err.message || 'Failed to delete lead.' });
  }
}

/**
 * POST /api/crm/leads/reset or DELETE /api/crm/leads/reset
 * Wipes all leads so the workspace starts completely fresh with 0 leads.
 */
export async function handleResetCrmLeads(req: Request, res: Response): Promise<void> {
  try {
    const orgId = (req.headers['x-organization-id'] as string) || (req.query.orgId as string) || req.body?.organizationId || 'org_lax_1';
    const resetAllOrgs = req.body?.allOrgs === true || req.query.allOrgs === 'true';

    let deletedCount = 0;

    if (resetAllOrgs) {
      for (const [oId, map] of crmLeadsStore.entries()) {
        deletedCount += map.size;
        map.clear();
        hydratedOrgs.add(oId);
        try {
          const snapshot = await getDocs(collection(serverDb, `organizations/${oId}/crm_leads`));
          await Promise.all(snapshot.docs.map((snapDoc) => deleteDoc(snapDoc.ref).catch(() => {})));
        } catch {}
      }
      crmLeadsStore.clear();
    } else {
      const orgMap = await loadOrgLeadsFromFirestore(orgId);
      deletedCount = orgMap.size;
      orgMap.clear();
      hydratedOrgs.add(orgId);

      try {
        const snapshot = await getDocs(collection(serverDb, `organizations/${orgId}/crm_leads`));
        deletedCount = Math.max(deletedCount, snapshot.size);
        await Promise.all(snapshot.docs.map((snapDoc) => deleteDoc(snapDoc.ref).catch(() => {})));
      } catch {}
    }

    console.log(`[CrmLeads] Fresh start reset executed. Cleared ${deletedCount} lead(s) for org: ${orgId}.`);

    res.json({
      success: true,
      message: 'All leads successfully reset. Starting fresh with 0 leads.',
      deletedCount,
      count: 0,
    });
  } catch (err: any) {
    console.error('[CrmLeads] Error in handleResetCrmLeads:', err);
    res.status(500).json({ error: err.message || 'Failed to reset CRM leads.' });
  }
}

