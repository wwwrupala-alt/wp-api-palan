/**
 * Utility to convert template definitions (from Meta GET or template designer)
 * into the strict payload format required by Meta /messages Cloud API endpoint.
 *
 * In Meta Cloud API /messages:
 * - Template message components MUST only contain:
 *     - "type": "header" | "body" | "button"
 *     - "parameters": Array of { type: "text" | "image" | "document" | ..., text: "..." }
 *     - (for button: "sub_type": "url" | "quick_reply", "index": number)
 * - Sending definition fields like "text", "format", "example" in components causes Meta error:
 *   "Unexpected key 'format' on param 'template.components.0', Unexpected key 'text' on param 'template.components.1'"
 */

export interface MetaMessageComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'url' | 'quick_reply';
  index?: number | string;
  parameters: Array<{
    type: 'text' | 'image' | 'document' | 'video';
    text?: string;
    image?: { id?: string; link?: string };
    video?: { id?: string; link?: string };
    document?: { id?: string; link?: string; filename?: string };
  }>;
}

export function formatTemplateComponentsForSending(
  rawComponents?: any[],
  variableValues?: Record<string, string>,
  resolvedHeaderMedia?: { id?: string; link?: string; filename?: string } | null
): MetaMessageComponent[] {
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    return [];
  }

  const result: MetaMessageComponent[] = [];

  for (const comp of rawComponents) {
    if (!comp) continue;

    const rawType = String(comp.type || '').toUpperCase();

    // 1. If the component is ALREADY formatted as a valid send payload (has parameters array and no definition fields like text/format)
    if (Array.isArray(comp.parameters) && !('format' in comp) && !('text' in comp)) {
      result.push(comp);
      continue;
    }

    // 2. HEADER component
    if (rawType === 'HEADER') {
      const headerFormat = String(comp.format || 'TEXT').toUpperCase();

      if (headerFormat === 'TEXT') {
        const textContent = comp.text || '';
        // Check if header contains variables like {{1}}
        const matches = textContent.match(/\{\{(\d+)\}\}/g);
        if (matches && matches.length > 0) {
          const params = matches.map((m: string, i: number) => {
            const varKey = `header_${i + 1}`;
            const val = variableValues?.[varKey] || variableValues?.[String(i + 1)] || 'Value';
            return { type: 'text' as const, text: String(val) };
          });
          result.push({
            type: 'header',
            parameters: params,
          });
        }
      } else if (headerFormat === 'IMAGE') {
        if (resolvedHeaderMedia?.id) {
          result.push({
            type: 'header',
            parameters: [{ type: 'image', image: { id: resolvedHeaderMedia.id } }],
          });
        } else if (
          resolvedHeaderMedia?.link &&
          !resolvedHeaderMedia.link.includes('scontent.whatsapp.net') &&
          !resolvedHeaderMedia.link.includes('lookaside.fbsbx.com') &&
          !resolvedHeaderMedia.link.includes('run.app') &&
          !resolvedHeaderMedia.link.includes('localhost')
        ) {
          result.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: resolvedHeaderMedia.link } }],
          });
        } else {
          const imgRef = variableValues?.header_media_url || variableValues?.media_url || comp.example?.header_handle?.[0];
          if (imgRef) {
            if (/^\d{10,}$/.test(imgRef)) {
              result.push({
                type: 'header',
                parameters: [{ type: 'image', image: { id: imgRef } }],
              });
            } else if (
              (imgRef.startsWith('http://') || imgRef.startsWith('https://')) &&
              !imgRef.includes('scontent.whatsapp.net') &&
              !imgRef.includes('lookaside.fbsbx.com') &&
              !imgRef.includes('run.app') &&
              !imgRef.includes('localhost')
            ) {
              result.push({
                type: 'header',
                parameters: [{ type: 'image', image: { link: imgRef } }],
              });
            } else {
              // High-reliability public fallback image to satisfy Meta's mandatory header parameter requirement
              result.push({
                type: 'header',
                parameters: [{ type: 'image', image: { link: 'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=800&auto=format&fit=crop&q=80' } }],
              });
            }
          } else {
            // Mandatory header parameter when template format is IMAGE
            result.push({
              type: 'header',
              parameters: [{ type: 'image', image: { link: 'https://images.unsplash.com/photo-1579203438237-49dcf6133f6a?w=800&auto=format&fit=crop&q=80' } }],
            });
          }
        }
      } else if (headerFormat === 'VIDEO') {
        if (resolvedHeaderMedia?.id) {
          result.push({
            type: 'header',
            parameters: [{ type: 'video', video: { id: resolvedHeaderMedia.id } as any }],
          });
        } else if (
          resolvedHeaderMedia?.link &&
          !resolvedHeaderMedia.link.includes('scontent.whatsapp.net') &&
          !resolvedHeaderMedia.link.includes('lookaside.fbsbx.com') &&
          !resolvedHeaderMedia.link.includes('run.app') &&
          !resolvedHeaderMedia.link.includes('localhost')
        ) {
          result.push({
            type: 'header',
            parameters: [{ type: 'video', video: { link: resolvedHeaderMedia.link } as any }],
          });
        } else {
          const videoRef = variableValues?.header_media_url || variableValues?.media_url || comp.example?.header_handle?.[0];
          if (videoRef) {
            if (/^\d{10,}$/.test(videoRef)) {
              result.push({
                type: 'header',
                parameters: [{ type: 'video', video: { id: videoRef } as any }],
              });
            } else if (
              (videoRef.startsWith('http://') || videoRef.startsWith('https://')) &&
              !videoRef.includes('scontent.whatsapp.net') &&
              !videoRef.includes('lookaside.fbsbx.com') &&
              !videoRef.includes('run.app') &&
              !videoRef.includes('localhost')
            ) {
              result.push({
                type: 'header',
                parameters: [{ type: 'video', video: { link: videoRef } as any }],
              });
            }
          }
        }
      } else if (headerFormat === 'DOCUMENT') {
        const docName = resolvedHeaderMedia?.filename || 'Document.pdf';
        if (resolvedHeaderMedia?.id) {
          result.push({
            type: 'header',
            parameters: [{ type: 'document', document: { id: resolvedHeaderMedia.id, filename: docName } }],
          });
        } else if (
          resolvedHeaderMedia?.link &&
          !resolvedHeaderMedia.link.includes('scontent.whatsapp.net') &&
          !resolvedHeaderMedia.link.includes('lookaside.fbsbx.com') &&
          !resolvedHeaderMedia.link.includes('run.app') &&
          !resolvedHeaderMedia.link.includes('localhost')
        ) {
          result.push({
            type: 'header',
            parameters: [{ type: 'document', document: { link: resolvedHeaderMedia.link, filename: docName } }],
          });
        } else {
          const docRef = variableValues?.header_media_url || variableValues?.media_url || comp.example?.header_handle?.[0];
          if (docRef) {
            if (/^\d{10,}$/.test(docRef)) {
              result.push({
                type: 'header',
                parameters: [{ type: 'document', document: { id: docRef, filename: docName } }],
              });
            } else if (
              (docRef.startsWith('http://') || docRef.startsWith('https://')) &&
              !docRef.includes('scontent.whatsapp.net') &&
              !docRef.includes('lookaside.fbsbx.com') &&
              !docRef.includes('run.app') &&
              !docRef.includes('localhost')
            ) {
              result.push({
                type: 'header',
                parameters: [{ type: 'document', document: { link: docRef, filename: docName } }],
              });
            }
          }
        }
      }
    }

    // 3. BODY component
    else if (rawType === 'BODY') {
      const textContent = comp.text || '';
      // Check if body contains parameters like {{1}}, {{2}}
      const matches = textContent.match(/\{\{(\d+)\}\}/g);
      if (matches && matches.length > 0) {
        const params = matches.map((m: string, i: number) => {
          const varKey = `body_${i + 1}`;
          const val = variableValues?.[varKey] || variableValues?.[String(i + 1)] || `Customer`;
          return { type: 'text' as const, text: String(val) };
        });
        result.push({
          type: 'body',
          parameters: params,
        });
      }
      // If there are no {{variables}} in BODY (like hello_world), we DO NOT send body component
    }

    // 4. BUTTONS component
    else if (rawType === 'BUTTONS' && Array.isArray(comp.buttons)) {
      comp.buttons.forEach((btn: any, index: number) => {
        if (btn?.type === 'URL' && btn.url?.includes('{{1}}')) {
          const dynamicUrlPart = variableValues?.[`button_${index}`] || 'link';
          result.push({
            type: 'button',
            sub_type: 'url',
            index: index,
            parameters: [{ type: 'text', text: dynamicUrlPart }],
          });
        }
      });
    }
  }

  return result;
}
