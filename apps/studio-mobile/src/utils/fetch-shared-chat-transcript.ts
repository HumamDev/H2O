import type { ImportedTranscript, ImportedTurn } from '@/types/import-chatgpt-link';
import { isKnownTranscriptArtifact } from '@/utils/transcript-artifacts';
import { decodeEntities } from './fetch-shared-chat-metadata';

// ---------------------------------------------------------------------------
// Debug instrumentation (temporary — remove once parser is confirmed)
// ---------------------------------------------------------------------------

export interface TranscriptDebugInfo {
  hasNextData: boolean;
  hasLdJson: boolean;
  hasDataMessageRole: boolean;
  scriptCount: number;
  jsonScriptCount: number;
  /** keyword → occurrence count (only keywords with count > 0) */
  keywords: Record<string, number>;
  /** first 300 chars of __NEXT_DATA__ content, or null */
  nextDataPreview: string | null;
  /** pageProps top-level keys if __NEXT_DATA__ is parseable */
  nextDataPagePropsKeys: string[] | null;
  /** keys of the first candidate conversation object found inside pageProps */
  nextDataConvKeys: string[] | null;
  /** other <script type="application/json"> id values (not __NEXT_DATA__) */
  otherJsonScriptIds: string[];
  /** first data-message-author-role text snippet, stripped of tags, truncated to 120 chars */
  dataRoleSnippet: string | null;
  /** first 300 chars of client-bootstrap content, or null */
  clientBootstrapPreview: string | null;
  /** top-level keys of parsed client-bootstrap JSON, or null */
  clientBootstrapTopKeys: string[] | null;
  /** dot-path at which the turn array was found inside client-bootstrap, or null */
  clientBootstrapTurnPath: string | null;
  // ---- secondary-source discovery signals (pass 2) ----
  /** external <script src="…"> URLs, up to 8 */
  scriptSrcs: string[];
  /** href/src attribute values containing any target keyword, up to 8 */
  resourceUrlsWithKeywords: string[];
  /** URL-like string literals in the page that contain target keywords, up to 8 */
  inlineEndpointHints: string[];
  /** 120-char context windows around the first occurrence of each strong keyword, up to 6 */
  keywordContextPreviews: Array<{ keyword: string; preview: string }>;
  /** 120-char context windows where the share ID appears in the HTML (null if share ID unknown) */
  shareIdOccurrences: string[] | null;
  /** snippets of escaped-JSON blobs near transcript-relevant keywords, up to 3 */
  escapedJsonHints: string[];
  // ---- runtime loading signals (pass 3) ----
  /** script src URLs that look like app/runtime bundles (not analytics/CDN noise), up to 5 */
  appBundleSrcs: string[];
  /** 150-char context windows around fetch()/XHR/backend-api hits inside inline scripts, up to 5 */
  inlineFetchHints: string[];
  /** true if "backend-api" appears anywhere in the HTML */
  hasBackendApiRef: boolean;
  // ---- direct backend probe (pass 4) ----
  /** whether a direct backend-endpoint probe was attempted */
  directProbeTried: boolean;
  /** last endpoint URL attempted by the probe */
  directProbeUrl: string | null;
  /** HTTP status of the last probe attempt, or null if network error */
  directProbeStatus: number | null;
  /** top-level keys of the JSON response, if response was valid JSON */
  directProbeJsonKeys: string[] | null;
  /** outcome of the direct probe */
  directProbeResult: 'success' | 'no-turns' | 'non-json' | 'http-error' | 'network-error' | 'not-tried';
}

export interface ExtractTranscriptResult {
  turns: ImportedTurn[];
  title?: string;
  debugInfo: TranscriptDebugInfo;
}

function buildDebugInfo(
  html: string,
  clientBootstrapTurnPath: string | null,
  sourceUrl: string | undefined,
  probeInfo: Pick<TranscriptDebugInfo,
    'directProbeTried' | 'directProbeUrl' | 'directProbeStatus' |
    'directProbeJsonKeys' | 'directProbeResult'>,
): TranscriptDebugInfo {
  const KW = [
    'linear_conversation', 'mapping', 'messages', 'turns',
    'author', 'content', 'parts', 'conversation',
  ];
  // Superset used for secondary-source discovery
  const DISCOVERY_KW = [
    'conversation', 'share', 'message', 'messages', 'backend', 'api', 'data',
    'fetch', 'graphql', 'linear_conversation', 'mapping', 'turns', 'author', 'content',
  ];
  const htmlLower = html.toLowerCase();

  // ---- original signals ----
  const scriptOpenTags = html.match(/<script[^>]*>/gi) ?? [];
  const jsonScriptTags = html.match(/<script[^>]+type=["']application\/json["'][^>]*/gi) ?? [];

  const otherJsonScriptIds: string[] = [];
  for (const tag of jsonScriptTags) {
    const idMatch = tag.match(/\bid=["']([^"']+)["']/i);
    const tagId = idMatch?.[1] ?? null;
    if (tagId && tagId !== '__NEXT_DATA__') otherJsonScriptIds.push(tagId);
  }

  const nextDataMatch =
    html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i) ??
    html.match(/<script[^>]+type=["']application\/json["'][^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);

  let nextDataPreview: string | null = null;
  let nextDataPagePropsKeys: string[] | null = null;
  let nextDataConvKeys: string | null = null;

  if (nextDataMatch) {
    const raw = nextDataMatch[1];
    nextDataPreview = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const pp = (parsed as any)?.props?.pageProps;
      if (pp && typeof pp === 'object') {
        nextDataPagePropsKeys = Object.keys(pp).slice(0, 30);
        const convData: unknown =
          (pp as any)?.serverResponse?.data ??
          (pp as any)?.shareData?.conversation ??
          (pp as any)?.continueSharing?.conversation ??
          (pp as any)?.data ??
          null;
        if (convData && typeof convData === 'object' && !Array.isArray(convData)) {
          nextDataConvKeys = Object.keys(convData as object).slice(0, 30).join(', ');
        }
      }
    } catch { /* preview still shown */ }
  }

  const cbMatch = extractClientBootstrapRaw(html);
  let clientBootstrapPreview: string | null = null;
  let clientBootstrapTopKeys: string[] | null = null;
  if (cbMatch) {
    clientBootstrapPreview = cbMatch.slice(0, 300);
    try {
      const parsed = JSON.parse(cbMatch);
      if (parsed && typeof parsed === 'object') {
        clientBootstrapTopKeys = Object.keys(parsed as object).slice(0, 30);
      }
    } catch { /* preview still shown */ }
  }

  const ldJsonMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>/i);

  const dataRoleMatch = html.match(
    /data-message-author-role=["'](user|assistant|system)["'][^>]*>([\s\S]{0,200})/i,
  );
  const dataRoleSnippet = dataRoleMatch
    ? dataRoleMatch[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    : null;

  const kwHits: Record<string, number> = {};
  for (const kw of KW) {
    const count = (html.match(new RegExp(kw, 'g')) ?? []).length;
    if (count > 0) kwHits[kw] = count;
  }

  // ---- secondary-source discovery signals ----

  // 1. External script src URLs
  const scriptSrcs: string[] = [];
  const srcRe = /<script[^>]+src=["']([^"']{4,200})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(html)) !== null && scriptSrcs.length < 8) {
    scriptSrcs.push(m[1].slice(0, 150));
  }

  // 2. href/src attribute values containing any discovery keyword
  const resourceUrlsWithKeywords: string[] = [];
  const urlAttrRe = /(?:href|src|action)=["']([^"']{4,200})["']/gi;
  while ((m = urlAttrRe.exec(html)) !== null && resourceUrlsWithKeywords.length < 8) {
    const val = m[1].toLowerCase();
    if (DISCOVERY_KW.some(kw => val.includes(kw))) {
      resourceUrlsWithKeywords.push(m[1].slice(0, 150));
    }
  }

  // 3. URL-like string literals (inline) containing discovery keywords
  // Matches quoted strings that start with / or https?:// and are at least 6 chars
  const inlineEndpointHints: string[] = [];
  const endpointRe = /["']((?:https?:\/\/|\/)[^"'\s<>]{5,150})["']/g;
  while ((m = endpointRe.exec(html)) !== null && inlineEndpointHints.length < 8) {
    const val = m[1].toLowerCase();
    if (DISCOVERY_KW.some(kw => val.includes(kw))) {
      inlineEndpointHints.push(m[1].slice(0, 150));
    }
  }

  // 4. Short context windows around first occurrence of each strong keyword
  const STRONG_KW = [
    'backend', 'graphql', 'linear_conversation', 'mapping',
    'conversation', 'messages', 'share', 'turns',
  ];
  const keywordContextPreviews: Array<{ keyword: string; preview: string }> = [];
  for (const kw of STRONG_KW) {
    if (keywordContextPreviews.length >= 6) break;
    const idx = htmlLower.indexOf(kw);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 40);
    const end = Math.min(html.length, idx + kw.length + 80);
    const preview = html
      .slice(start, end)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 140);
    keywordContextPreviews.push({ keyword: kw, preview });
  }

  // 5. Share-ID occurrence contexts
  const shareId = sourceUrl?.match(/\/share\/([^/?#\s]{4,})/)?.[1] ?? null;
  let shareIdOccurrences: string[] | null = null;
  if (shareId) {
    shareIdOccurrences = [];
    // Escape special regex chars in the share ID
    const escaped = shareId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const shareRe = new RegExp(escaped, 'g');
    let sm: RegExpExecArray | null;
    while ((sm = shareRe.exec(html)) !== null && shareIdOccurrences.length < 5) {
      const start = Math.max(0, sm.index - 35);
      const end = Math.min(html.length, sm.index + shareId.length + 55);
      const ctx = html
        .slice(start, end)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 130);
      shareIdOccurrences.push(ctx);
    }
  }

  // 6. Escaped-JSON blobs near transcript-relevant keywords
  // Pattern: \\\" followed by a relevant key — signals that a JSON payload is embedded as a string
  const escapedJsonHints: string[] = [];
  const escRe = /\\{1,2}"(?:conversation|messages|linear_conversation|mapping|turns|author)[^"\\]{0,100}/g;
  while ((m = escRe.exec(html)) !== null && escapedJsonHints.length < 3) {
    escapedJsonHints.push(m[0].slice(0, 130));
  }

  // ---- runtime loading signals (pass 3) ----

  // 7. App/runtime bundle srcs — filter scriptSrcs to those that look like application JS.
  //    Exclude common noise: analytics (gtag, pixel, clarity, hotjar, sentry CDN),
  //    fonts, polyfills, and plain CDN libraries.
  const NOISE_PATTERNS = [
    'gtag', 'analytics', 'pixel', 'hotjar', 'clarity', 'sentry',
    'fonts.google', 'font-awesome', 'jquery', 'bootstrap.min', 'polyfill',
  ];
  const BUNDLE_PATTERNS = [
    '_next/', '/static/', 'chunks/', 'runtime', 'webpack', 'main.',
    'bundle', 'app-', 'vendor-', 'pages/', 'framework',
  ];
  const appBundleSrcs = scriptSrcs
    .filter(src => {
      const s = src.toLowerCase();
      if (NOISE_PATTERNS.some(n => s.includes(n))) return false;
      return BUNDLE_PATTERNS.some(b => s.includes(b)) || s.endsWith('.js');
    })
    .slice(0, 5);

  // 8. Inline fetch/XHR hints — extract content of <script> tags without a src attribute,
  //    then scan for runtime-fetch patterns.
  const FETCH_KW = [
    'fetch(', 'xmlhttprequest', 'backend-api', 'axios.get', 'axios.post',
    'graphql', '/api/', '/share/', 'conversation',
  ];
  const inlineFetchHints: string[] = [];

  // Two-pass: collect inline script bodies, then scan them.
  const inlineBlockRe = /<script(?:\s+(?!src=)[^>]*)?>(?!\s*<\/)([\s\S]*?)<\/script>/gi;
  const inlineBodies: string[] = [];
  while ((m = inlineBlockRe.exec(html)) !== null) {
    // Skip if the opening tag has a src= attribute
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    if (/\bsrc\s*=/i.test(openTag)) continue;
    const body = m[1];
    if (body.trim().length > 20) inlineBodies.push(body);
  }

  for (const body of inlineBodies) {
    if (inlineFetchHints.length >= 5) break;
    const lower = body.toLowerCase();
    for (const kw of FETCH_KW) {
      if (inlineFetchHints.length >= 5) break;
      const idx = lower.indexOf(kw);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 40);
      const end = Math.min(body.length, idx + kw.length + 110);
      const preview = body
        .slice(start, end)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 160);
      inlineFetchHints.push(`[${kw}] ${preview}`);
    }
  }

  // 9. Direct backend-api reference anywhere in the HTML (quick yes/no)
  const hasBackendApiRef = htmlLower.includes('backend-api');

  return {
    hasNextData: !!nextDataMatch,
    hasLdJson: !!ldJsonMatch,
    hasDataMessageRole: /data-message-author-role/i.test(html),
    scriptCount: scriptOpenTags.length,
    jsonScriptCount: jsonScriptTags.length,
    keywords: kwHits,
    nextDataPreview,
    nextDataPagePropsKeys,
    nextDataConvKeys: nextDataConvKeys ? [nextDataConvKeys] : null,
    otherJsonScriptIds,
    dataRoleSnippet,
    clientBootstrapPreview,
    clientBootstrapTopKeys,
    clientBootstrapTurnPath,
    scriptSrcs,
    resourceUrlsWithKeywords,
    inlineEndpointHints,
    keywordContextPreviews,
    shareIdOccurrences,
    escapedJsonHints,
    appBundleSrcs,
    inlineFetchHints,
    hasBackendApiRef,
    ...probeInfo,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts a conversation transcript from raw ChatGPT shared-link HTML.
 *
 * Extraction order:
 *   1. Direct backend-endpoint probe (async, best-effort — current ChatGPT runtime path)
 *   2. client-bootstrap JSON (in-page JSON script)
 *   3. __NEXT_DATA__ JSON (legacy Next.js SSR format)
 *   4. data-message-author-role HTML attribute scraping (last resort)
 *
 * @param sourceUrl  The original shared-link URL — used to derive the share ID for the
 *                   direct probe and for debug instrumentation.
 */
export async function extractTranscriptFromHtml(
  html: string,
  sourceUrl?: string,
): Promise<ExtractTranscriptResult> {
  let turns: ImportedTurn[] | null = null;
  let title: string | undefined;
  let clientBootstrapTurnPath: string | null = null;

  // --- Pass 1: direct backend probe ---
  const shareId = sourceUrl?.match(/\/share\/([^/?#\s]{4,})/)?.[1] ?? null;
  const probeResult = shareId
    ? await probeDirectEndpoints(shareId)
    : { turns: [], info: NOT_TRIED_PROBE };

  if (probeResult.turns.length > 0) {
    turns = probeResult.turns;
  }
  if (probeResult.title) title = probeResult.title;

  // --- Pass 2-4: HTML-based fallbacks ---
  if (!turns || turns.length === 0) {
    const cbResult = extractFromClientBootstrap(html);
    if (cbResult) {
      turns = cbResult.turns;
      clientBootstrapTurnPath = cbResult.path;
      if (!title) title = cbResult.title;
    }
  }

  if (!turns || turns.length === 0) {
    const nextDataResult = extractFromNextData(html);
    turns = nextDataResult?.turns ?? null;
    if (!title) title = nextDataResult?.title;
  }

  if (!turns || turns.length === 0) {
    turns = extractFromHtmlFallback(html);
  }

  const debugInfo = buildDebugInfo(html, clientBootstrapTurnPath, sourceUrl, probeResult.info);
  return { turns: turns ?? [], title, debugInfo };
}

const NOT_TRIED_PROBE: Pick<TranscriptDebugInfo,
  'directProbeTried' | 'directProbeUrl' | 'directProbeStatus' |
  'directProbeJsonKeys' | 'directProbeResult'> = {
  directProbeTried: false,
  directProbeUrl: null,
  directProbeStatus: null,
  directProbeJsonKeys: null,
  directProbeResult: 'not-tried',
};

// ---------------------------------------------------------------------------
// Direct backend probe (async, best-effort)
// ---------------------------------------------------------------------------

type ProbeOutcome = {
  turns: ImportedTurn[];
  title?: string;
  info: Pick<TranscriptDebugInfo,
    'directProbeTried' | 'directProbeUrl' | 'directProbeStatus' |
    'directProbeJsonKeys' | 'directProbeResult'>;
};

const PROBE_ENDPOINTS = (shareId: string) => [
  `https://chatgpt.com/backend-api/share/${shareId}`,
  `https://chatgpt.com/backend-api/shared_conversations/${shareId}`,
];

const PROBE_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; H2OStudio/1.0)',
};

const PROBE_TIMEOUT_MS = 5_000;

async function probeDirectEndpoints(shareId: string): Promise<ProbeOutcome> {
  let lastUrl: string | null = null;
  let lastStatus: number | null = null;
  let lastIsJson = false;
  let lastJsonKeys: string[] | null = null;
  let lastResult: TranscriptDebugInfo['directProbeResult'] = 'not-tried';

  for (const endpoint of PROBE_ENDPOINTS(shareId)) {
    lastUrl = endpoint;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: PROBE_HEADERS,
      });
      lastStatus = response.status;

      if (!response.ok) {
        lastResult = 'http-error';
        // 404 means this endpoint doesn't exist — continue to next.
        // 4xx/5xx other than 404 also fall through.
        continue;
      }

      let data: unknown;
      try {
        data = await response.json();
        lastIsJson = true;
      } catch {
        lastResult = 'non-json';
        continue;
      }

      if (data && typeof data === 'object' && !Array.isArray(data)) {
        lastJsonKeys = Object.keys(data as object).slice(0, 20);
      }

      const turns = extractTurnsFromProbeJson(data);
      const title = extractConversationTitle(data);
      if (turns.length > 0) {
        lastResult = 'success';
        return {
          turns,
          title,
          info: {
            directProbeTried: true,
            directProbeUrl: lastUrl,
            directProbeStatus: lastStatus,
            directProbeJsonKeys: lastJsonKeys,
            directProbeResult: 'success',
          },
        };
      }

      lastResult = 'no-turns';
      // Don't break — try next endpoint in case this one returned an empty/wrong object.
    } catch {
      lastResult = 'network-error';
      lastStatus = null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    turns: [],
    info: {
      directProbeTried: true,
      directProbeUrl: lastUrl,
      directProbeStatus: lastStatus,
      directProbeJsonKeys: lastIsJson ? lastJsonKeys : null,
      directProbeResult: lastResult,
    },
  };
}

function cleanPayloadTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const title = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (!title) return undefined;
  if (/^(?:ChatGPT|See what this chat'?s about)$/i.test(title)) return undefined;
  return title;
}

function extractConversationTitle(data: unknown, depth = 0): string | undefined {
  if (!data || typeof data !== 'object' || depth > 5) return undefined;
  const d = data as any;

  const direct =
    cleanPayloadTitle(d.title) ??
    cleanPayloadTitle(d.conversation?.title) ??
    cleanPayloadTitle(d.data?.title) ??
    cleanPayloadTitle(d.data?.conversation?.title) ??
    cleanPayloadTitle(d.result?.title) ??
    cleanPayloadTitle(d.result?.conversation?.title) ??
    cleanPayloadTitle(d.shareData?.conversation?.title) ??
    cleanPayloadTitle(d.continueSharing?.conversation?.title) ??
    cleanPayloadTitle(d.serverResponse?.data?.title);
  if (direct) return direct;

  if (Array.isArray(data)) {
    for (const item of data.slice(0, 8)) {
      const title = extractConversationTitle(item, depth + 1);
      if (title) return title;
    }
    return undefined;
  }

  for (const key of Object.keys(data).slice(0, 20)) {
    const title = extractConversationTitle((data as Record<string, unknown>)[key], depth + 1);
    if (title) return title;
  }
  return undefined;
}

/**
 * Attempts to extract turns from a JSON payload returned by a backend probe endpoint.
 * Tries known ChatGPT API response shapes first, then falls back to bounded recursion.
 */
function extractTurnsFromProbeJson(data: unknown): ImportedTurn[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const d = data as any;

  // Shape 1: top-level linear_conversation array (common API response)
  if (Array.isArray(d.linear_conversation) && d.linear_conversation.length > 0) {
    const turns = turnsFromLinearConversation(d.linear_conversation);
    if (turns.length > 0) return turns;
  }

  // Shape 2: top-level mapping graph
  if (d.mapping && typeof d.mapping === 'object' && !Array.isArray(d.mapping)) {
    const turns = turnsFromMapping(d.mapping as Record<string, unknown>);
    if (turns.length > 0) return turns;
  }

  // Shape 3: nested under conversation key
  const conv = d.conversation ?? d.data?.conversation ?? d.result?.conversation ?? null;
  if (conv && typeof conv === 'object') {
    if (Array.isArray(conv.linear_conversation) && conv.linear_conversation.length > 0) {
      const turns = turnsFromLinearConversation(conv.linear_conversation);
      if (turns.length > 0) return turns;
    }
    if (conv.mapping && typeof conv.mapping === 'object') {
      const turns = turnsFromMapping(conv.mapping as Record<string, unknown>);
      if (turns.length > 0) return turns;
    }
  }

  // Shape 4: bounded recursive search as a last resort
  const recursive = findTurnsRecursive(data, '', 0, 5);
  if (recursive) return recursive.turns;

  return [];
}

// ---------------------------------------------------------------------------
// Primary path: client-bootstrap JSON
// ---------------------------------------------------------------------------

/** Returns the raw string content of the client-bootstrap script tag, or null. */
function extractClientBootstrapRaw(html: string): string | null {
  // Attribute order: id first, then type
  const m =
    html.match(/<script[^>]+id=["']client-bootstrap["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i) ??
    html.match(/<script[^>]+type=["']application\/json["'][^>]+id=["']client-bootstrap["'][^>]*>([\s\S]*?)<\/script>/i);
  return m?.[1] ?? null;
}

interface ClientBootstrapResult {
  turns: ImportedTurn[];
  path: string;
  title?: string;
}

function extractFromClientBootstrap(html: string): ClientBootstrapResult | null {
  const raw = extractClientBootstrapRaw(html);
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!data || typeof data !== 'object') return null;

  // Walk a set of known plausible shallow paths first before falling back to recursion.
  const knownPaths: Array<{ path: string; getValue: (d: any) => unknown }> = [
    { path: 'conversation.messages',             getValue: d => d?.conversation?.messages },
    { path: 'conversation.turns',                getValue: d => d?.conversation?.turns },
    { path: 'conversation.linear_conversation',  getValue: d => d?.conversation?.linear_conversation },
    { path: 'conversation.mapping',              getValue: d => d?.conversation?.mapping },
    { path: 'messages',                          getValue: d => d?.messages },
    { path: 'turns',                             getValue: d => d?.turns },
    { path: 'linear_conversation',               getValue: d => d?.linear_conversation },
    { path: 'data.conversation.messages',        getValue: d => d?.data?.conversation?.messages },
    { path: 'data.conversation.turns',           getValue: d => d?.data?.conversation?.turns },
    { path: 'data.messages',                     getValue: d => d?.data?.messages },
    { path: 'data.linear_conversation',          getValue: d => d?.data?.linear_conversation },
    { path: 'props.conversation.messages',       getValue: d => d?.props?.conversation?.messages },
    { path: 'props.messages',                    getValue: d => d?.props?.messages },
  ];

  for (const { path, getValue } of knownPaths) {
    const candidate = getValue(data);
    if (Array.isArray(candidate) && candidate.length > 0) {
      const turns = turnsFromCandidateArray(candidate);
      if (turns.length > 0) return { turns, path, title: extractConversationTitle(data) };

      // mapping object (non-array)
    } else if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const turns = turnsFromMapping(candidate as Record<string, unknown>);
      if (turns.length > 0) return { turns, path: `${path}[mapping]`, title: extractConversationTitle(data) };
    }
  }

  // Bounded recursive search — max depth 6, stops at first hit.
  const recursive = findTurnsRecursive(data, '', 0, 6);
  if (recursive) return { ...recursive, title: extractConversationTitle(data) };

  return null;
}

/**
 * Recursive search: walks object/array trees looking for the shallowest
 * array of turn-candidate objects. Returns null if nothing found within depth.
 */
function findTurnsRecursive(
  node: unknown,
  path: string,
  depth: number,
  maxDepth: number,
): ClientBootstrapResult | null {
  if (depth > maxDepth || node === null || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    // Check if this array looks like a turns list.
    if (node.length >= 2 && node.every(isTurnCandidate)) {
      const turns = turnsFromCandidateArray(node);
      if (turns.length > 0) return { turns, path: path || '[root]' };
    }
    // Otherwise recurse into each element (but don't go too wide).
    for (let i = 0; i < Math.min(node.length, 5); i++) {
      const result = findTurnsRecursive(node[i], `${path}[${i}]`, depth + 1, maxDepth);
      if (result) return result;
    }
  } else {
    for (const key of Object.keys(node as object)) {
      const result = findTurnsRecursive(
        (node as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        depth + 1,
        maxDepth,
      );
      if (result) return result;
    }
  }

  return null;
}

/**
 * Returns true if `item` looks like a conversation turn:
 * must have a string `role` field + at least one text-bearing field.
 */
function isTurnCandidate(item: unknown): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const o = item as Record<string, unknown>;
  if (typeof o.role !== 'string') return false;
  return (
    typeof o.text === 'string' ||
    typeof o.message === 'string' ||
    (typeof o.content === 'string' && o.content.length > 0) ||
    (o.content !== null && typeof o.content === 'object' && Array.isArray((o.content as any)?.parts))
  );
}

/** Normalizes a raw turn array (from any candidate path) into ImportedTurn[]. */
function turnsFromCandidateArray(arr: unknown[]): ImportedTurn[] {
  const turns: ImportedTurn[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i] as any;
    const role = typeof item?.role === 'string' ? item.role : '';
    if (role === 'tool' || role === 'function') continue;

    let text = '';
    if (typeof item?.content === 'string') {
      text = item.content;
    } else if (Array.isArray(item?.content?.parts)) {
      if (isTextContentType(item?.content?.content_type)) {
        text = joinParts(item.content.parts);
      }
    } else if (typeof item?.text === 'string') {
      text = item.text;
    } else if (typeof item?.message === 'string') {
      text = item.message;
    }

    // Also handle the linear_conversation node shape: item.message.content.parts
    if (!text && item?.message?.content?.parts && Array.isArray(item.message.content.parts)) {
      if (isTextContentType(item?.message?.content?.content_type)) {
        const msgRole = item?.message?.author?.role ?? item?.message?.role;
        const msgText = joinParts(item.message.content.parts);
        const msgRoleMapped = mapRole(typeof msgRole === 'string' ? msgRole : '');
        const decoded = decodeEntities(msgText.trim());
        if (decoded && !isKnownTranscriptArtifact(decoded) && !seen.has(decoded)) {
          seen.add(decoded);
          turns.push({ id: item?.message?.id ?? String(i), role: msgRoleMapped, text: decoded });
        }
      }
      continue;
    }

    const decoded = decodeEntities(text.trim());
    if (!decoded || isKnownTranscriptArtifact(decoded)) continue;
    if (seen.has(decoded)) continue;
    seen.add(decoded);

    const id = item?.id ?? item?.message_id ?? item?.messageId ?? String(i);
    turns.push({ id: String(id), role: mapRole(role), text: decoded });
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Secondary path: __NEXT_DATA__ JSON (legacy Next.js SSR)
// ---------------------------------------------------------------------------

function extractFromNextData(html: string): { turns: ImportedTurn[]; title?: string } | null {
  const match = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i,
  ) ?? html.match(
    /<script[^>]+type=["']application\/json["'][^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const pp = (data as any)?.props?.pageProps;
  if (!pp) return null;

  const linConv: unknown =
    pp?.serverResponse?.data?.linear_conversation ??
    pp?.shareData?.conversation?.linear_conversation ??
    pp?.continueSharing?.conversation?.linear_conversation ??
    pp?.data?.linear_conversation ??
    null;

  if (Array.isArray(linConv) && linConv.length > 0) {
    const turns = turnsFromLinearConversation(linConv);
    if (turns.length > 0) return { turns, title: extractConversationTitle(pp) };
  }

  const mapping: unknown =
    pp?.serverResponse?.data?.mapping ??
    pp?.shareData?.conversation?.mapping ??
    pp?.continueSharing?.conversation?.mapping ??
    pp?.data?.mapping ??
    null;

  if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
    const turns = turnsFromMapping(mapping as Record<string, unknown>);
    if (turns.length > 0) return { turns, title: extractConversationTitle(pp) };
  }

  return null;
}

function isTextContentType(contentType: unknown): boolean {
  if (contentType === undefined) return true; // absent = assume text
  if (contentType === null) return false;     // explicit null = metadata/artifact, not text
  return contentType === 'text' || contentType === 'multimodal_text';
}

function turnsFromLinearConversation(nodes: unknown[]): ImportedTurn[] {
  const turns: ImportedTurn[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i] as any;
    const msg = n?.message;
    const role = msg?.author?.role as string | undefined;
    const parts = msg?.content?.parts;
    if (!role || !Array.isArray(parts)) continue;
    if (role === 'tool' || role === 'function') continue;
    if (!isTextContentType(msg?.content?.content_type)) continue;
    const text = decodeEntities(joinParts(parts).trim());
    if (!text || isKnownTranscriptArtifact(text)) continue;
    turns.push({ id: msg?.id ?? String(i), role: mapRole(role), text });
  }
  return turns;
}

function turnsFromMapping(mapping: Record<string, unknown>): ImportedTurn[] {
  const nodes = Object.values(mapping) as any[];
  const root = nodes.find((n) => !n?.parent || !(n.parent in mapping));
  if (!root) return [];

  const turns: ImportedTurn[] = [];
  const visited = new Set<string>();
  let current: any = root;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const msg = current.message;
    const role = msg?.author?.role as string | undefined;
    const parts = msg?.content?.parts;
    if (role && role !== 'tool' && role !== 'function' && Array.isArray(parts)) {
      if (isTextContentType(msg?.content?.content_type)) {
        const text = decodeEntities(joinParts(parts).trim());
        if (text && !isKnownTranscriptArtifact(text)) {
          turns.push({ id: msg?.id ?? current.id, role: mapRole(role), text });
        }
      }
    }
    const nextId = Array.isArray(current.children) ? current.children[0] : undefined;
    current = nextId ? (mapping[nextId] as any) : null;
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Tertiary path: data-message-author-role HTML attribute scraping
// ---------------------------------------------------------------------------

function extractFromHtmlFallback(html: string): ImportedTurn[] {
  const turns: ImportedTurn[] = [];
  const re =
    /data-message-author-role=["'](user|assistant|system)["'][^>]*>([\s\S]*?)(?=data-message-author-role=["']|<\/body>|$)/gi;

  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(html)) !== null && i < 200) {
    const text = decodeEntities(stripTags(m[2]))
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text && !isKnownTranscriptArtifact(text)) {
      turns.push({ id: String(i), role: mapRole(m[1]), text });
      i++;
    }
  }
  return turns;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function joinParts(parts: unknown[]): string {
  return parts
    .filter((p): p is string => typeof p === 'string')
    .join('\n\n');
}

function mapRole(role: string): ImportedTurn['role'] {
  switch (role) {
    case 'user':
    case 'human':
      return 'user';
    case 'assistant':
    case 'ai':
    case 'gpt':
    case 'bot':
      return 'assistant';
    case 'system':
      return 'system';
    default:
      return 'unknown';
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}
