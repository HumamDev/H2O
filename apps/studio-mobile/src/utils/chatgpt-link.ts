import { upsertImportedChatByShareId } from '@/state/imported-chats';
import type { ImportedChat } from '@/types/import-chatgpt-link';

const ALLOWED_HOSTS = ['chatgpt.com', 'chat.openai.com'];

type ValidationResult = { ok: true; url: URL } | { ok: false; error: string };
type ImportOptions = Pick<ImportedChat, 'title' | 'snippet' | 'fetchedTitle' | 'fetchedSnippet'>;
type ImportResult = { ok: true; canonicalId: string; item: ImportedChat } | { ok: false; error: string };

export function validateChatGPTShareUrl(raw: string): ValidationResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'Please enter a valid URL.' };
  }
  if (!ALLOWED_HOSTS.includes(url.hostname)) {
    return { ok: false, error: 'URL must be from chatgpt.com or chat.openai.com.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'URL must use http or https.' };
  }
  if (!url.pathname.includes('/share/')) {
    return { ok: false, error: 'URL must be a ChatGPT shared link containing /share/.' };
  }
  return { ok: true, url };
}

/** Extracts the share token from a validated ChatGPT shared URL. */
export function extractShareToken(url: URL): string {
  return url.pathname.split('/share/')[1]?.split('/')[0] ?? 'unknown';
}

export function getIncomingChatGPTShareUrlParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function buildImportedChatWithOptions(url: URL, options: Partial<ImportOptions>): ImportedChat {
  const token = extractShareToken(url);
  const now = new Date().toISOString();
  return {
    id: `imported-${token}`,
    shareId: token,
    sourceUrl: url.toString(),
    title: options.title ?? `Shared chat (${token.slice(0, 8)})`,
    snippet: options.snippet ?? `Imported from ChatGPT on ${new Date().toLocaleDateString()}`,
    importedAt: now,
    sourceType: 'chatgpt-shared-link',
    fetchedTitle: options.fetchedTitle,
    fetchedSnippet: options.fetchedSnippet,
  };
}

export function createImportedChatFromShareUrl(
  raw: string,
  options: Partial<ImportOptions> = {},
): { ok: true; item: ImportedChat; url: URL } | { ok: false; error: string } {
  const result = validateChatGPTShareUrl(raw);
  if (!result.ok) return result;

  const item = buildImportedChatWithOptions(result.url, options);
  return { ok: true, item, url: result.url };
}

export function importChatGPTShareUrl(
  raw: string,
  options: Partial<ImportOptions> = {},
): ImportResult {
  const result = createImportedChatFromShareUrl(raw, options);
  if (!result.ok) return result;

  const { item } = result;
  const canonicalId = upsertImportedChatByShareId(item);
  return { ok: true, canonicalId, item };
}
