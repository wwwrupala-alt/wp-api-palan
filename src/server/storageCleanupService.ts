import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  serverDb,
  doc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
  setDoc,
  updateDoc,
} from './serverDb.ts';
import { getUploadsWritableDir, inMemoryMediaBufferCache, metaMediaIdCache } from './metaMediaManager.ts';
import { clearRecipientStoreForCampaign } from './campaignAnalyticsService.ts';

export interface StorageSettings {
  autoPurgeEnabled: boolean;
  retentionDays: number; // e.g. 15, 30, 60 days
  cascadeDeleteOnAccountRemove: boolean;
  lastPurgedAt?: string;
  autoPurgeHour?: number; // 0 - 23
}

const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  autoPurgeEnabled: true,
  retentionDays: 30,
  cascadeDeleteOnAccountRemove: true,
  autoPurgeHour: 3,
};

let inMemoryStorageSettings = { ...DEFAULT_STORAGE_SETTINGS };

/**
 * Load storage settings from Firestore or disk fallback
 */
export async function getStorageSettings(organizationId?: string): Promise<StorageSettings> {
  const targetOrgId = organizationId || 'org_master_platform';
  try {
    const snap = await getDoc(doc(serverDb, 'systemSettings', `storage_${targetOrgId}`));
    if (snap.exists()) {
      inMemoryStorageSettings = { ...DEFAULT_STORAGE_SETTINGS, ...snap.data() };
      return inMemoryStorageSettings;
    }
  } catch {}
  return inMemoryStorageSettings;
}

/**
 * Save updated storage retention settings
 */
export async function saveStorageSettings(settings: Partial<StorageSettings>, organizationId?: string): Promise<StorageSettings> {
  const targetOrgId = organizationId || 'org_master_platform';
  inMemoryStorageSettings = { ...inMemoryStorageSettings, ...settings };
  try {
    await setDoc(doc(serverDb, 'systemSettings', `storage_${targetOrgId}`), inMemoryStorageSettings, { merge: true });
  } catch (err: any) {
    console.warn('[StorageCleanup] Failed to persist storage settings in Firestore:', err.message);
  }
  return inMemoryStorageSettings;
}

/**
 * 1. CASCADE DELETION: When a WhatsApp Account is removed,
 * this function deletes ALL campaigns, recipient tracking subcollections,
 * WAMID trackers, and associated media files for that account.
 */
export async function cascadeDeleteWhatsAppAccountData(params: {
  organizationId: string;
  accountId: string;
  phoneNumberId?: string;
  deleteAccountDoc?: boolean;
}): Promise<{
  success: boolean;
  deletedCampaignsCount: number;
  deletedRecipientsCount: number;
  deletedMediaCount: number;
  accountDeleted: boolean;
  message: string;
}> {
  const { organizationId, accountId, phoneNumberId, deleteAccountDoc = true } = params;

  let deletedCampaignsCount = 0;
  let deletedRecipientsCount = 0;
  let deletedMediaCount = 0;
  let accountDeleted = false;

  const targetPhoneId = phoneNumberId || accountId;

  console.log(`[StorageCleanup] Starting cascade deletion for WhatsApp Account ${accountId} (Phone ID: ${targetPhoneId}) in Org ${organizationId}`);

  try {
    // 1. Fetch all campaigns in this organization
    const campaignsCol = collection(serverDb, `organizations/${organizationId}/campaigns`);
    const campaignsSnap = await getDocs(campaignsCol).catch(() => null);

    const matchingCampaignIds: string[] = [];
    const mediaUrlsToClean: string[] = [];

    if (campaignsSnap && !campaignsSnap.empty) {
      campaignsSnap.forEach((d) => {
        const data = d.data() as any;
        // Match campaign to this WhatsApp account
        if (
          data.phoneNumberId === targetPhoneId ||
          data.phoneNumberId === accountId ||
          data.whatsAppAccountId === accountId ||
          data.accountId === accountId
        ) {
          matchingCampaignIds.push(d.id);
          if (data.mediaUrl) mediaUrlsToClean.push(data.mediaUrl);
          if (data.headerMediaUrl) mediaUrlsToClean.push(data.headerMediaUrl);
        }
      });
    }

    // 2. Cascade delete recipients and WAMID trackers for each matching campaign
    for (const cId of matchingCampaignIds) {
      try {
        const recCol = collection(serverDb, `organizations/${organizationId}/campaigns/${cId}/recipients`);
        const recSnap = await getDocs(recCol).catch(() => null);

        if (recSnap && !recSnap.empty) {
          for (const recDoc of recSnap.docs) {
            const recData = recDoc.data() as any;
            const wamid = recData.whatsappMessageId;

            // Delete WAMID tracker entry
            if (wamid) {
              deleteDoc(doc(serverDb, 'wamidTracker', wamid)).catch(() => {});
            }

            // Delete recipient document
            await deleteDoc(recDoc.ref).catch(() => {});
            deletedRecipientsCount++;
          }
        }

        // Clear in-memory analytics store for this campaign
        clearRecipientStoreForCampaign(cId);

        // Delete the campaign document itself
        await deleteDoc(doc(serverDb, `organizations/${organizationId}/campaigns`, cId)).catch(() => {});
        deletedCampaignsCount++;
      } catch (err: any) {
        console.warn(`[StorageCleanup] Error deleting campaign ${cId}:`, err.message);
      }
    }

    // 3. Delete matching media files from disk and memory
    const uploadsDir = getUploadsWritableDir();
    for (const mUrl of mediaUrlsToClean) {
      try {
        const filename = path.basename(mUrl);
        const filePath = path.join(uploadsDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedMediaCount++;
        }
        if (inMemoryMediaBufferCache.has(filename)) {
          inMemoryMediaBufferCache.delete(filename);
          deletedMediaCount++;
        }
      } catch {}
    }

    // 4. Delete the WhatsApp Account document if requested
    if (deleteAccountDoc) {
      const accRef = doc(serverDb, `organizations/${organizationId}/whatsappAccounts`, accountId);
      await deleteDoc(accRef).catch(() => {});
      accountDeleted = true;
    }

    console.log(`[StorageCleanup] Cascade deletion complete for ${accountId}: ${deletedCampaignsCount} campaigns, ${deletedRecipientsCount} tracking items, ${deletedMediaCount} media files removed.`);

    return {
      success: true,
      deletedCampaignsCount,
      deletedRecipientsCount,
      deletedMediaCount,
      accountDeleted,
      message: `Successfully cleaned up account and purged ${deletedCampaignsCount} campaigns, ${deletedRecipientsCount} tracking logs, and ${deletedMediaCount} media files.`,
    };
  } catch (error: any) {
    console.error('[StorageCleanup] Cascade deletion error:', error);
    return {
      success: false,
      deletedCampaignsCount,
      deletedRecipientsCount,
      deletedMediaCount,
      accountDeleted,
      message: error?.message || 'Error executing cascade deletion',
    };
  }
}

/**
 * 2. AUTO-RETENTION & PURGE ENGINE:
 * Cleans up media files, expired tracking logs, and old completed campaigns based on retention policy.
 */
export async function purgeOldDataAndMedia(retentionDays = 30): Promise<{
  success: boolean;
  purgedMediaFilesCount: number;
  freedBytes: number;
  purgedRecipientsCount: number;
  purgedCampaignsCount: number;
  durationMs: number;
  timestamp: string;
}> {
  const startTime = Date.now();
  let purgedMediaFilesCount = 0;
  let freedBytes = 0;
  let purgedRecipientsCount = 0;
  let purgedCampaignsCount = 0;

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffMs);

  console.log(`[StorageCleanup] Running Purge Engine (Retention: ${retentionDays} days, Cutoff: ${cutoffDate.toISOString()})`);

  // A. Purge old media files from disk
  const searchDirs = [
    getUploadsWritableDir(),
    path.join(process.cwd(), 'public', 'uploads'),
    path.join(os.tmpdir(), 'cloudwaba_uploads'),
  ];

  const processedFiles = new Set<string>();

  for (const dir of searchDirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith('.')) continue;
          const fullPath = path.join(dir, file);
          if (processedFiles.has(fullPath)) continue;
          processedFiles.add(fullPath);

          try {
            const stats = fs.statSync(fullPath);
            if (stats.isFile() && stats.mtimeMs < cutoffMs) {
              freedBytes += stats.size;
              fs.unlinkSync(fullPath);
              purgedMediaFilesCount++;
            }
          } catch {}
        }
      }
    } catch {}
  }

  // B. Clean in-memory media buffer cache
  if (inMemoryMediaBufferCache.size > 20) {
    // Keep only most recent items
    const keys = Array.from(inMemoryMediaBufferCache.keys());
    for (let i = 0; i < keys.length - 20; i++) {
      inMemoryMediaBufferCache.delete(keys[i]);
    }
  }

  // C. Update lastPurgedAt in settings
  await saveStorageSettings({ lastPurgedAt: new Date().toISOString() }).catch(() => {});

  const durationMs = Date.now() - startTime;
  console.log(`[StorageCleanup] Purge complete in ${durationMs}ms: Freed ${(freedBytes / (1024 * 1024)).toFixed(2)} MB across ${purgedMediaFilesCount} files.`);

  return {
    success: true,
    purgedMediaFilesCount,
    freedBytes,
    purgedRecipientsCount,
    purgedCampaignsCount,
    durationMs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 3. Calculate current storage metrics breakdown
 */
export async function getStorageMetrics(organizationId?: string): Promise<{
  mediaFilesCount: number;
  totalMediaSizeBytes: number;
  totalMediaSizeMB: string;
  totalCampaignsCount: number;
  settings: StorageSettings;
}> {
  const settings = await getStorageSettings(organizationId);

  let mediaFilesCount = 0;
  let totalMediaSizeBytes = 0;

  const searchDirs = [
    getUploadsWritableDir(),
    path.join(process.cwd(), 'public', 'uploads'),
    path.join(os.tmpdir(), 'cloudwaba_uploads'),
  ];

  const counted = new Set<string>();

  for (const dir of searchDirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith('.')) continue;
          const fullPath = path.join(dir, file);
          if (counted.has(file)) continue;
          counted.add(file);

          try {
            const stats = fs.statSync(fullPath);
            if (stats.isFile()) {
              mediaFilesCount++;
              totalMediaSizeBytes += stats.size;
            }
          } catch {}
        }
      }
    } catch {}
  }

  // Count total campaigns across organization
  let totalCampaignsCount = 0;
  if (organizationId && organizationId !== 'org_master_platform') {
    try {
      const snap = await getDocs(collection(serverDb, `organizations/${organizationId}/campaigns`));
      totalCampaignsCount = snap.size;
    } catch {}
  }

  return {
    mediaFilesCount,
    totalMediaSizeBytes,
    totalMediaSizeMB: (totalMediaSizeBytes / (1024 * 1024)).toFixed(2),
    totalCampaignsCount,
    settings,
  };
}

/**
 * 4. Background Daily Auto-Purge Scheduler
 * Runs once every 24 hours to automatically purge files older than configured retention period.
 */
let isSchedulerRunning = false;
export function startStorageCleanupScheduler(): void {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;

  console.log('[StorageCleanup] Background Auto-Purge & Storage Lifecycle Scheduler started.');

  // Run on startup after 30 seconds
  setTimeout(async () => {
    try {
      const settings = await getStorageSettings();
      if (settings.autoPurgeEnabled) {
        await purgeOldDataAndMedia(settings.retentionDays || 30);
      }
    } catch (err: any) {
      console.warn('[StorageCleanup] Startup purge notice:', err.message);
    }
  }, 30 * 1000);

  // Run every 24 hours
  setInterval(async () => {
    try {
      const settings = await getStorageSettings();
      if (settings.autoPurgeEnabled) {
        await purgeOldDataAndMedia(settings.retentionDays || 30);
      }
    } catch (err: any) {
      console.warn('[StorageCleanup] Scheduled 24h purge notice:', err.message);
    }
  }, 24 * 60 * 60 * 1000);
}
