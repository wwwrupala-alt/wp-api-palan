import fs from 'fs';
import path from 'path';

// In-memory cache to avoid re-uploading the same file during a broadcast campaign
const metaMediaIdCache = new Map<string, string>();

/**
 * Resolves any media reference (local file in public/uploads, numeric Meta Media ID,
 * internal scontent.whatsapp.net example URL, or remote public URL)
 * into a Meta-compliant payload for template parameters or direct media messages:
 * - Either { id: "<META_MEDIA_ID>" } (for local files, scontent URLs, or uploaded media)
 * - Or { link: "<PUBLIC_HTTPS_URL>" } (for public external URLs)
 */
export async function resolveMetaMediaObject(
  mediaRef: string | undefined,
  phoneNumberId: string,
  token: string,
  mediaType: 'image' | 'video' | 'document' = 'image',
  graphVersion: string = 'v22.0'
): Promise<{ id?: string; link?: string; filename?: string } | null> {
  if (!mediaRef || typeof mediaRef !== 'string') return null;
  const trimmed = mediaRef.trim();
  if (!trimmed) return null;

  // 1. If it's already a numeric Meta Media ID (e.g. "2381431199056815")
  if (/^\d{10,}$/.test(trimmed)) {
    return { id: trimmed };
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

        const blob = new Blob([buffer], { type: mimeType });
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

  // 3. If it's a remote public HTTPS/HTTP URL (and not localhost, not 127.0.0.1, and not our Google Cloud Run dev preview domain)
  const isInternalPreviewDomain =
    trimmed.includes('run.app') ||
    trimmed.includes('localhost') ||
    trimmed.includes('127.0.0.1') ||
    trimmed.includes('/uploads/');

  if (
    (trimmed.startsWith('https://') || trimmed.startsWith('http://')) &&
    !isInternalPreviewDomain &&
    !trimmed.includes('scontent.whatsapp.net') &&
    !trimmed.includes('lookaside.fbsbx.com')
  ) {
    const filename = path.basename(trimmed.split('?')[0]) || undefined;
    return { link: trimmed, filename };
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

  // Find file on disk
  const cleanSubPath = localRelative.replace(/^\//, '');
  let filePath = path.join(process.cwd(), 'public', cleanSubPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(process.cwd(), cleanSubPath);
  }

  if (!fs.existsSync(filePath)) {
    console.warn(`[resolveMetaMediaObject] Local media file not found on disk at: ${filePath}`);
    // If it's an external public URL, we can attempt link fallback
    if (trimmed.startsWith('https://') && !isInternalPreviewDomain) {
      return { link: trimmed };
    }
    return null;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.3gp') mimeType = 'video/3gpp';
    else if (ext === '.pdf') mimeType = 'application/pdf';

    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: mimeType });
    const originalFileName = path.basename(filePath);

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

