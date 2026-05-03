export interface SharedChatMetadata {
  title?: string;
  snippet?: string;
}

const FETCH_TIMEOUT_MS = 10_000;

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'Mozilla/5.0 (compatible; H2OStudio/1.0)',
};

/**
 * Fetches raw HTML from the given URL.
 * Throws if the response is non-200 or if the request is aborted.
 */
export async function fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, headers: FETCH_HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/**
 * Parses basic metadata from raw HTML.
 * Extraction order: og:title > <title>, og:description > meta[name=description].
 */
export function parseSharedChatMetadata(html: string): SharedChatMetadata {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch ? headMatch[1] : html;

  const title =
    extractMetaAttr(head, 'property', 'og:title', 'content') ??
    extractTitleTag(head);

  const snippet =
    extractMetaAttr(head, 'property', 'og:description', 'content') ??
    extractMetaAttr(head, 'name', 'description', 'content');

  return {
    title: title ? decodeEntities(title.trim()) : undefined,
    snippet: snippet ? decodeEntities(snippet.trim()) : undefined,
  };
}

/**
 * Convenience function — kept for backward compatibility with Phase 2A callers.
 * Fetches the URL and returns parsed metadata.
 */
export async function fetchSharedChatMetadata(
  url: string,
  signal?: AbortSignal,
): Promise<SharedChatMetadata> {
  const html = await fetchHtml(url, signal);
  return parseSharedChatMetadata(html);
}

function extractMetaAttr(
  html: string,
  keyAttr: string,
  keyValue: string,
  targetAttr: string,
): string | undefined {
  const fwd = new RegExp(
    `<meta[^>]+${keyAttr}=["']${escapeRegex(keyValue)}["'][^>]+${targetAttr}=["']([^"'<>]*)["']`,
    'i',
  );
  const rev = new RegExp(
    `<meta[^>]+${targetAttr}=["']([^"'<>]*)["'][^>]+${keyAttr}=["']${escapeRegex(keyValue)}["']`,
    'i',
  );
  return html.match(fwd)?.[1] ?? html.match(rev)?.[1];
}

function extractTitleTag(html: string): string | undefined {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Exported so transcript extractor can reuse the same decoding. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

/** Creates an AbortController that auto-aborts after FETCH_TIMEOUT_MS. */
export function createFetchController(): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return { controller, clear: () => clearTimeout(id) };
}
