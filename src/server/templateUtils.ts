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
            const safeVal = String(val).replace(/[\r\n\t]+/g, ' ').replace(/\s{4,}/g, '   ').trim();
            return { type: 'text' as const, text: safeVal || 'Value' };
          });
          result.push({
            type: 'header',
            parameters: params,
          });
        }
      } else if (headerFormat === 'IMAGE') {
        const directMediaId =
          variableValues?.header_media_id ||
          variableValues?.media_id ||
          resolvedHeaderMedia?.id;

        if (directMediaId && /^\d+$/.test(String(directMediaId).trim())) {
          result.push({
            type: 'header',
            parameters: [{ type: 'image', image: { id: String(directMediaId).trim() } }],
          });
        } else if (resolvedHeaderMedia?.id) {
          result.push({
            type: 'header',
            parameters: [{ type: 'image', image: { id: resolvedHeaderMedia.id } }],
          });
        } else if (
          resolvedHeaderMedia?.link &&
          !resolvedHeaderMedia.link.startsWith('blob:') &&
          !resolvedHeaderMedia.link.includes('localhost') &&
          !resolvedHeaderMedia.link.includes('127.0.0.1')
        ) {
          result.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: resolvedHeaderMedia.link } }],
          });
        } else {
          const imgRef =
            variableValues?.header_media_url ||
            variableValues?.media_url ||
            comp.example?.header_handle?.[0];

          if (imgRef) {
            const cleanRef = String(imgRef).trim();
            if (/^\d+$/.test(cleanRef)) {
              result.push({
                type: 'header',
                parameters: [{ type: 'image', image: { id: cleanRef } }],
              });
            } else if (cleanRef.startsWith('http://') || cleanRef.startsWith('https://')) {
              if (!cleanRef.startsWith('blob:')) {
                result.push({
                  type: 'header',
                  parameters: [{ type: 'image', image: { link: cleanRef } }],
                });
              }
            } else if (cleanRef.startsWith('/uploads/') || cleanRef.startsWith('/')) {
              // Convert relative path to canonical public URL on production domain
              const fullPublicUrl = `https://wabacloud.in${cleanRef.startsWith('/') ? '' : '/'}${cleanRef}`;
              result.push({
                type: 'header',
                parameters: [{ type: 'image', image: { link: fullPublicUrl } }],
              });
            }
          }
        }
      } else if (headerFormat === 'VIDEO') {
        const directMediaId =
          variableValues?.header_media_id ||
          variableValues?.media_id ||
          resolvedHeaderMedia?.id;

        if (directMediaId && /^\d+$/.test(String(directMediaId).trim())) {
          result.push({
            type: 'header',
            parameters: [{ type: 'video', video: { id: String(directMediaId).trim() } as any }],
          });
        } else if (resolvedHeaderMedia?.id) {
          result.push({
            type: 'header',
            parameters: [{ type: 'video', video: { id: resolvedHeaderMedia.id } as any }],
          });
        } else if (
          resolvedHeaderMedia?.link &&
          !resolvedHeaderMedia.link.startsWith('blob:') &&
          !resolvedHeaderMedia.link.includes('localhost') &&
          !resolvedHeaderMedia.link.includes('127.0.0.1')
        ) {
          result.push({
            type: 'header',
            parameters: [{ type: 'video', video: { link: resolvedHeaderMedia.link } as any }],
          });
        } else {
          const videoRef =
            variableValues?.header_media_url ||
            variableValues?.media_url ||
            comp.example?.header_handle?.[0];

          if (videoRef) {
            const cleanRef = String(videoRef).trim();
            if (/^\d+$/.test(cleanRef)) {
              result.push({
                type: 'header',
                parameters: [{ type: 'video', video: { id: cleanRef } as any }],
              });
            } else if (cleanRef.startsWith('http://') || cleanRef.startsWith('https://')) {
              if (!cleanRef.startsWith('blob:')) {
                result.push({
                  type: 'header',
                  parameters: [{ type: 'video', video: { link: cleanRef } as any }],
                });
              }
            } else if (cleanRef.startsWith('/uploads/') || cleanRef.startsWith('/')) {
              const fullPublicUrl = `https://wabacloud.in${cleanRef.startsWith('/') ? '' : '/'}${cleanRef}`;
              result.push({
                type: 'header',
                parameters: [{ type: 'video', video: { link: fullPublicUrl } as any }],
              });
            }
          }
        }
      } else if (headerFormat === 'DOCUMENT') {
        const docName = resolvedHeaderMedia?.filename || 'Document.pdf';
        const directMediaId =
          variableValues?.header_media_id ||
          variableValues?.media_id ||
          resolvedHeaderMedia?.id;

        if (directMediaId && /^\d+$/.test(String(directMediaId).trim())) {
          result.push({
            type: 'header',
            parameters: [{ type: 'document', document: { id: String(directMediaId).trim(), filename: docName } }],
          });
        } else if (resolvedHeaderMedia?.id) {
          result.push({
            type: 'header',
            parameters: [{ type: 'document', document: { id: resolvedHeaderMedia.id, filename: docName } }],
          });
        } else if (
          resolvedHeaderMedia?.link &&
          !resolvedHeaderMedia.link.startsWith('blob:') &&
          !resolvedHeaderMedia.link.includes('localhost') &&
          !resolvedHeaderMedia.link.includes('127.0.0.1')
        ) {
          result.push({
            type: 'header',
            parameters: [{ type: 'document', document: { link: resolvedHeaderMedia.link, filename: docName } }],
          });
        } else {
          const docRef =
            variableValues?.header_media_url ||
            variableValues?.media_url ||
            comp.example?.header_handle?.[0];

          if (docRef) {
            const cleanRef = String(docRef).trim();
            if (/^\d+$/.test(cleanRef)) {
              result.push({
                type: 'header',
                parameters: [{ type: 'document', document: { id: cleanRef, filename: docName } }],
              });
            } else if (cleanRef.startsWith('http://') || cleanRef.startsWith('https://')) {
              if (!cleanRef.startsWith('blob:')) {
                result.push({
                  type: 'header',
                  parameters: [{ type: 'document', document: { link: cleanRef, filename: docName } }],
                });
              }
            } else if (cleanRef.startsWith('/uploads/') || cleanRef.startsWith('/')) {
              const fullPublicUrl = `https://wabacloud.in${cleanRef.startsWith('/') ? '' : '/'}${cleanRef}`;
              result.push({
                type: 'header',
                parameters: [{ type: 'document', document: { link: fullPublicUrl, filename: docName } }],
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
          const num = i + 1;
          const rawVal =
            variableValues?.[`body_${num}`] ||
            variableValues?.[String(num)] ||
            variableValues?.[`var${num}`] ||
            variableValues?.[`var_${num}`] ||
            variableValues?.[`param${num}`] ||
            variableValues?.[`param_${num}`] ||
            variableValues?.[`variable${num}`] ||
            (num === 1 && variableValues?.name ? variableValues.name : null) ||
            `Customer`;

          // Meta Cloud API restriction: parameter text cannot contain newlines (\r, \n), tabs (\t) or >4 consecutive spaces
          // Sanitizing ensures Meta does not reject the campaign with error 100
          const safeVal = String(rawVal)
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s{4,}/g, '   ')
            .trim();

          return { type: 'text' as const, text: safeVal || 'Value' };
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
