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
    image?: { link: string };
    document?: { link: string; filename?: string };
  }>;
}

export function formatTemplateComponentsForSending(
  rawComponents?: any[],
  variableValues?: Record<string, string>
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
      } else if (headerFormat === 'IMAGE' && comp.example?.header_handle?.[0]) {
        result.push({
          type: 'header',
          parameters: [{ type: 'image', image: { link: comp.example.header_handle[0] } }],
        });
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
