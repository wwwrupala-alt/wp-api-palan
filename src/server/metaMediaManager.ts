import fs from 'fs';
import path from 'path';
import os from 'os';
import { serverDb, doc, getDoc, setDoc } from './serverDb.ts';

// In-memory cache to avoid re-uploading the same file during a broadcast campaign
export const metaMediaIdCache = new Map<string, string>();
const driveMediaMemoryCache = new Map<string, { id: string; filename: string; expiresAt: number }>();

const DRIVE_CACHE_TTL_MS = 25 * 24 * 60 * 60 * 1000; // 25 days (auto-refreshes before Meta's 30-day Media ID expiry)

function extractGoogleDriveFileId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  const patterns = [
    /^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,120})/i,
    /^https?:\/\/drive\.google\.com\/open\?(?:[^#]*&)?id=([a-zA-Z0-9_-]{10,120})/i,
    /^https?:\/\/drive\.google\.com\/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]{10,120})/i,
    /^https?:\/\/drive\.usercontent\.google\.com\/download\?(?:[^#]*&)?id=([a-zA-Z0-9_-]{10,120})/i,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1] && /^[a-zA-Z0-9_-]{10,120}$/.test(m[1])) {
      return m[1];
    }
  }
  return null;
}

function detectMimeAndExtFromBuffer(
  buffer: Buffer,
  headerMime: string,
  fallbackType: 'image' | 'video' | 'document' | 'audio'
): { mimeType: string; ext: string; isHtml: boolean } {
  const headAscii = buffer.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  if (
    headerMime.toLowerCase().includes('text/html') ||
    headAscii.startsWith('<!doctype html') ||
    headAscii.startsWith('<html')
  ) {
    return { mimeType: 'text/html', ext: '.html', isHtml: true };
  }
  // PDF magic bytes: %PDF-
  if (buffer.length >= 5 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d) {
    return { mimeType: 'application/pdf', ext: '.pdf', isHtml: false };
  }
  // PNG magic bytes: 89 50 4E 47
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mimeType: 'image/png', ext: '.png', isHtml: false };
  }
  // JPEG magic bytes: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: '.jpg', isHtml: false };
  }
  // WEBP: RIFF....WEBP
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mimeType: 'image/webp', ext: '.webp', isHtml: false };
  }
  // MP4: ....ftyp
  if (buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mimeType: 'video/mp4', ext: '.mp4', isHtml: false };
  }
  // Office OpenXML (DOCX/XLSX/PPTX) starts with PK\x03\x04
  if (headerMime && !headerMime.includes('octet-stream')) {
    const clean = headerMime.split(';')[0].trim().toLowerCase();
    if (clean === 'application/pdf') return { mimeType: 'application/pdf', ext: '.pdf', isHtml: false };
    if (clean === 'image/png') return { mimeType: 'image/png', ext: '.png', isHtml: false };
    if (clean === 'image/jpeg') return { mimeType: 'image/jpeg', ext: '.jpg', isHtml: false };
    if (clean === 'video/mp4') return { mimeType: 'video/mp4', ext: '.mp4', isHtml: false };
  }
  if (fallbackType === 'document') return { mimeType: 'application/pdf', ext: '.pdf', isHtml: false };
  if (fallbackType === 'video') return { mimeType: 'video/mp4', ext: '.mp4', isHtml: false };
  if (fallbackType === 'audio') return { mimeType: 'audio/mpeg', ext: '.mp3', isHtml: false };
  return { mimeType: 'image/jpeg', ext: '.jpg', isHtml: false };
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;\r\n]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).replace(/["/\\]/g, '').trim();
    } catch {}
  }
  const plainMatch = header.match(/filename="?([^";\r\n]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].replace(/["/\\]/g, '').trim();
  }
  return null;
}

export interface InMemoryMediaFile {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  filename: string;
}

// In-memory media store so files are accessible even on read-only serverless filesystems (/var/task)
export const inMemoryMediaBufferCache = new Map<string, InMemoryMediaFile>();

/**
 * Returns a guaranteed writable directory for uploaded media.
 * Prefers 'public/uploads' in standard Node environments,
 * and gracefully falls back to os.tmpdir() (/tmp/cloudwaba_uploads) in serverless / read-only filesystems.
 */
export function getUploadsWritableDir(): string {
  // 1. Try public/uploads
  const primaryDir = path.join(process.cwd(), 'public', 'uploads');
  try {
    if (!fs.existsSync(primaryDir)) {
      fs.mkdirSync(primaryDir, { recursive: true });
    }
    // Verify write permissions
    const testFile = path.join(primaryDir, `.test_${Date.now()}`);
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return primaryDir;
  } catch {
    // 2. Fallback to os.tmpdir() which is always writable in Vercel, AWS Lambda, Google Cloud Run
    const fallbackDir = path.join(os.tmpdir(), 'cloudwaba_uploads');
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      return fallbackDir;
    } catch {
      return os.tmpdir();
    }
  }
}

/**
 * Resolves any media reference (local file in public/uploads or /tmp, in-memory buffer, numeric Meta Media ID,
 * internal scontent.whatsapp.net example URL, or remote public URL)
 * into a Meta-compliant payload for template parameters or direct media messages:
 * - Either { id: "<META_MEDIA_ID>" } (for local files, in-memory buffers, scontent URLs, or uploaded media)
 * - Or { link: "<PUBLIC_HTTPS_URL>" } (for public external URLs)
 */
export async function resolveMetaMediaObject(
  mediaRef: string | undefined,
  phoneNumberId: string,
  token: string,
  mediaType: 'image' | 'video' | 'document' | 'audio' = 'image',
  graphVersion: string = 'v22.0'
): Promise<{ id?: string; link?: string; filename?: string } | null> {
  if (!mediaRef || typeof mediaRef !== 'string') return null;
  const trimmed = mediaRef.trim();
  if (!trimmed) return null;

  // 1. If it's already a numeric Meta Media ID (e.g. "2381431199056815")
  if (/^\d+$/.test(trimmed)) {
    return { id: trimmed };
  }

  // 1b. If it's our internal media-proxy URL referencing a Meta Media ID or remote URL
  if (trimmed.includes('/api/meta/media-proxy')) {
    const mediaIdMatch = trimmed.match(/[?&]mediaId=(\d+)/i);
    if (mediaIdMatch && mediaIdMatch[1]) {
      return { id: mediaIdMatch[1] };
    }
    const urlMatch = trimmed.match(/[?&]url=([^&]+)/i);
    if (urlMatch && urlMatch[1]) {
      return resolveMetaMediaObject(
        decodeURIComponent(urlMatch[1]),
        phoneNumberId,
        token,
        mediaType,
        graphVersion
      );
    }
  }

  const cacheKey = `${phoneNumberId}:${trimmed}`;
  if (metaMediaIdCache.has(cacheKey)) {
    const cachedId = metaMediaIdCache.get(cacheKey)!;
    return { id: cachedId, filename: path.basename(trimmed.split('?')[0]) || undefined };
  }

  // 2. Special Case: scontent.whatsapp.net or lookaside.fbsbx.com
  // Meta Cloud API strictly forbids scontent / internal Meta example links in image.link / video.link.
  // We download the buffer directly and upload it to Meta's /{phoneNumberId}/media endpoint to get a real Meta Media ID!
  if (trimmed.includes('scontent.whatsapp.net') || trimmed.includes('lookaside.fbsbx.com')) {
    try {
      console.log(`[resolveMetaMediaObject] Downloading Meta sample CDN media to upload as official Media ID: ${trimmed.slice(0, 80)}...`);
      const dlRes = await fetch(trimmed);
      if (dlRes.ok) {
        const arrayBuf = await dlRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        let mimeType = dlRes.headers.get('content-type') || 'image/png';
        if (mediaType === 'video') mimeType = 'video/mp4';
        if (mediaType === 'document') mimeType = 'application/pdf';

        const ext = mimeType.includes('png') ? '.png' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? '.jpg' : '.bin';
        const uploadFileName = `header_media_${Date.now()}${ext}`;

        const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');
        formData.append('type', mimeType);
        formData.append('file', blob, uploadFileName);

        const uploadUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/media`;
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (uploadRes.ok && uploadData.id) {
          metaMediaIdCache.set(cacheKey, uploadData.id);
          console.log(`[resolveMetaMediaObject] Successfully converted scontent URL to Meta Media ID: ${uploadData.id}`);
          return { id: uploadData.id, filename: uploadFileName };
        } else {
          console.error('[resolveMetaMediaObject] Failed to upload scontent buffer to Meta:', uploadData);
        }
      }
    } catch (scontentErr) {
      console.warn('[resolveMetaMediaObject] Error bridging scontent media to Meta media ID:', scontentErr);
    }
  }

  // 3. If it's a remote public HTTPS/HTTP URL (and not localhost, not 127.0.0.1, not blob, and not our own /uploads/ path)
  const isInternalDevHost =
    trimmed.startsWith('blob:') ||
    trimmed.includes('localhost') ||
    trimmed.includes('127.0.0.1') ||
    trimmed.includes('/uploads/');

  if (
    (trimmed.startsWith('https://') || trimmed.startsWith('http://')) &&
    !isInternalDevHost &&
    !trimmed.includes('scontent.whatsapp.net') &&
    !trimmed.includes('lookaside.fbsbx.com')
  ) {
    // 3a. Google Drive Direct Bridge:
    // Google Drive's uc?export=download returns application/octet-stream (or a virus-scan HTML page for >25MB PDFs),
    // which causes WhatsApp Cloud API to render the document as a ".bin" file!
    // Instead, we download the real PDF binary from drive.usercontent.google.com, verify magic bytes,
    // upload it to Meta with explicit "application/pdf" MIME type, and cache the Meta Media ID for 25 days (auto-refreshing forever!).
    const driveFileId = extractGoogleDriveFileId(trimmed);
    if (driveFileId && token && /^\d+$/.test((phoneNumberId || '').trim())) {
      const cleanPhoneId = phoneNumberId.trim();
      const driveCacheDocId = `${cleanPhoneId}_${driveFileId}`;

      // Step 1: In-memory cache hit (0ms)
      const memHit = driveMediaMemoryCache.get(driveCacheDocId);
      if (memHit && memHit.expiresAt > Date.now()) {
        return { id: memHit.id, filename: memHit.filename };
      }

      // Step 2: Firestore 25-day cache hit (1 read across Vercel cold starts)
      try {
        const fsCacheSnap = await getDoc(doc(serverDb, 'metaDriveMediaCache', driveCacheDocId));
        if (fsCacheSnap.exists()) {
          const cached = fsCacheSnap.data() as any;
          if (cached?.metaMediaId && Number(cached.expiresAt || 0) > Date.now()) {
            const safeName = cached.filename || 'Catalog.pdf';
            driveMediaMemoryCache.set(driveCacheDocId, {
              id: String(cached.metaMediaId),
              filename: safeName,
              expiresAt: Number(cached.expiresAt),
            });
            return { id: String(cached.metaMediaId), filename: safeName };
          }
        }
      } catch (cacheReadErr) {
        console.warn('[resolveMetaMediaObject] Drive cache read notice:', cacheReadErr);
      }

      // Step 3: Fetch verified binary from Google's direct usercontent download endpoint (strictly allowlisted host + validated ID)
      const directDownloadUrls = [
        `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&confirm=t`,
        `https://drive.google.com/uc?export=download&confirm=t&id=${driveFileId}`,
      ];

      for (const dlUrl of directDownloadUrls) {
        try {
          const dlRes = await fetch(dlUrl, { redirect: 'follow' });
          if (!dlRes.ok) continue;

          const contentLengthHeader = Number(dlRes.headers.get('content-length') || '0');
          if (contentLengthHeader > 100 * 1024 * 1024) {
            console.warn('[resolveMetaMediaObject] Google Drive file exceeds Meta 100 MB limit:', contentLengthHeader);
            break;
          }

          const arrBuf = await dlRes.arrayBuffer();
          const buffer = Buffer.from(arrBuf);
          if (buffer.length === 0 || buffer.length > 100 * 1024 * 1024) continue;

          const headerMime = dlRes.headers.get('content-type') || '';
          const detected = detectMimeAndExtFromBuffer(buffer, headerMime, mediaType);

          if (detected.isHtml) {
            console.warn('[resolveMetaMediaObject] Google Drive returned HTML page (file may not be public "Anyone with the link" or requires confirmation).');
            continue;
          }

          let resolvedFileName =
            parseFilenameFromContentDisposition(dlRes.headers.get('content-disposition')) ||
            `Catalog${detected.ext}`;
          if (!path.extname(resolvedFileName)) {
            resolvedFileName = `${resolvedFileName}${detected.ext}`;
          }

          const blob = new Blob([new Uint8Array(buffer)], { type: detected.mimeType });
          const formData = new FormData();
          formData.append('messaging_product', 'whatsapp');
          formData.append('type', detected.mimeType);
          formData.append('file', blob, resolvedFileName);

          const uploadUrl = `https://graph.facebook.com/${graphVersion}/${cleanPhoneId}/media`;
          const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          const uploadData = await uploadRes.json();

          if (uploadRes.ok && uploadData?.id) {
            const newMediaId = String(uploadData.id);
            const expiresAt = Date.now() + DRIVE_CACHE_TTL_MS;
            driveMediaMemoryCache.set(driveCacheDocId, {
              id: newMediaId,
              filename: resolvedFileName,
              expiresAt,
            });
            metaMediaIdCache.set(cacheKey, newMediaId);

            // Persist 25-day auto-refreshing cache in Firestore (best-effort)
            setDoc(doc(serverDb, 'metaDriveMediaCache', driveCacheDocId), {
              metaMediaId: newMediaId,
              driveFileId,
              phoneNumberId: cleanPhoneId,
              filename: resolvedFileName,
              mimeType: detected.mimeType,
              size: buffer.length,
              expiresAt,
              updatedAt: new Date().toISOString(),
            }).catch(() => {});

            console.log(
              `[resolveMetaMediaObject] Bridged Google Drive (${driveFileId}) as ${detected.mimeType} -> Meta Media ID: ${newMediaId}`
            );
            return { id: newMediaId, filename: resolvedFileName };
          } else {
            console.warn('[resolveMetaMediaObject] Meta upload of Google Drive buffer failed:', uploadData);
          }
        } catch (driveErr) {
          console.warn('[resolveMetaMediaObject] Google Drive bridge fetch notice:', driveErr);
        }
      }

      // Fallback link if upload failed — still use drive.usercontent.google.com and NEVER return "uc" as filename
      return {
        link: `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&confirm=t`,
        filename: mediaType === 'document' ? 'Catalog.pdf' : undefined,
      };
    }

    const rawBase = path.basename(trimmed.split('?')[0]) || '';
    const safeFilename =
      rawBase && rawBase !== 'uc' && rawBase !== 'download' && path.extname(rawBase)
        ? rawBase
        : mediaType === 'document'
        ? 'Catalog.pdf'
        : undefined;
    return { link: trimmed, filename: safeFilename };
  }

  // 4. Local file path or relative URL (e.g. "/uploads/aa11_1791101223567.png" or "https://ais-dev-.../uploads/...")
  let localRelative = trimmed;
  if (localRelative.startsWith('http://') || localRelative.startsWith('https://')) {
    try {
      localRelative = new URL(localRelative).pathname;
    } catch {
      // ignore
    }
  }

  const baseFilename = path.basename(localRelative);

  // Check In-Memory Cache first (vital for serverless / read-only environments)
  const memCached =
    inMemoryMediaBufferCache.get(baseFilename) ||
    inMemoryMediaBufferCache.get(localRelative) ||
    inMemoryMediaBufferCache.get(trimmed);

  let fileBuffer: Buffer | null = null;
  let mimeType = 'application/octet-stream';
  let originalFileName = baseFilename;

  if (memCached) {
    fileBuffer = memCached.buffer;
    mimeType = memCached.mimeType;
    originalFileName = memCached.originalName || baseFilename;
  } else {
    // Search disk locations: public/uploads, root, os.tmpdir()/cloudwaba_uploads, os.tmpdir()
    const cleanSubPath = localRelative.replace(/^\//, '');
    const possiblePaths = [
      path.join(process.cwd(), 'public', cleanSubPath),
      path.join(process.cwd(), cleanSubPath),
      path.join(os.tmpdir(), 'cloudwaba_uploads', baseFilename),
      path.join(os.tmpdir(), baseFilename),
    ];

    let foundPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (foundPath) {
      const ext = path.extname(foundPath).toLowerCase();
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.mp4') mimeType = 'video/mp4';
      else if (ext === '.3gp') mimeType = 'video/3gpp';
      else if (ext === '.pdf') mimeType = 'application/pdf';

      fileBuffer = fs.readFileSync(foundPath);
      originalFileName = path.basename(foundPath);
    } else if (baseFilename) {
      // If not on serverless disk, try fetching from production domain wabacloud.in
      try {
        const publicFallbackUrl = `https://wabacloud.in/uploads/${baseFilename}`;
        const fetchRes = await fetch(publicFallbackUrl);
        if (fetchRes.ok) {
          const arrBuf = await fetchRes.arrayBuffer();
          fileBuffer = Buffer.from(arrBuf);
          mimeType = fetchRes.headers.get('content-type') || mimeType;
        }
      } catch {}
    }
  }

  if (!fileBuffer) {
    console.warn(`[resolveMetaMediaObject] Local media file not found on disk or memory for: ${mediaRef}`);
    if (trimmed.startsWith('https://') && !isInternalDevHost) {
      return { link: trimmed };
    }
    if (baseFilename && (trimmed.includes('/uploads/') || trimmed.startsWith('/'))) {
      return { link: `https://wabacloud.in/uploads/${baseFilename}` };
    }
    return null;
  }

  try {
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', blob, originalFileName);

    const uploadUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/media`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await res.json();
    if (res.ok && data.id) {
      metaMediaIdCache.set(cacheKey, data.id);
      console.log(`[resolveMetaMediaObject] Successfully uploaded local media to Meta: ${originalFileName} -> Meta Media ID: ${data.id}`);
      return { id: data.id, filename: originalFileName };
    } else {
      console.error('[resolveMetaMediaObject] Meta media upload failed:', data);
      return null;
    }
  } catch (err) {
    console.error('[resolveMetaMediaObject] Error uploading media to Meta Cloud API:', err);
    return null;
  }
}

