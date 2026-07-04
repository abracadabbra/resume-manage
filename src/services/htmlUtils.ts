/**
 * Strip HTML tags and decode common entities, returning plain text.
 *
 * Behavior (aligned with the former aiService.ts implementation):
 * - `<br>` → `\n`
 * - block-level tags (p/div/li/ul/ol/h1-h6) → `\n`
 * - remaining tags → removed
 * - common entities (`&nbsp;` `&lt;` `&gt;` `&quot;` `&#39;` `&amp;`) → decoded
 * - 3+ consecutive newlines → collapsed to 2
 * - leading/trailing whitespace → trimmed
 */
export function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
