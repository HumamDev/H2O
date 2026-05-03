import { mergeArchiveBundleIntoStore } from '@/importers/archive-bundle';
import {
  ensureArchiveStoreHydrated,
  getArchiveStoreSnapshot,
  replaceArchiveStore,
} from '@/state/archive';
import {
  ARCHIVE_BUNDLE_SCHEMA,
  type ArchiveBundleEnvelope,
  type ArchiveChat,
  type ArchiveMessage,
  type ArchiveSnapshot,
  type SnapshotMeta,
} from '@/types/archive';
import type { ImportedChat, ImportedTurn } from '@/types/import-chatgpt-link';
import { isKnownTranscriptArtifact } from '@/utils/transcript-artifacts';

const SYNTHETIC_TITLE_RE = /^(?:ChatGPT\s*-\s*)?(?:Shared chat \([^)]+\)|See what this chat'?s about|ChatGPT)$/i;
const SYNTHETIC_SNIPPET_RE = /^Imported from ChatGPT on /i;
const NOISE_RE = /^original custom instructions/i;

export interface ImportedChatArchivePromotionResult {
  chatId: string;
  snapshotId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cleanLine(raw: unknown): string {
  return String(raw || '')
    .replace(/\u3010[^\u3011]*\u3011/g, '')
    .replace(/^#{1,6} +/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(raw: unknown): string {
  return cleanLine(raw).replace(/^ChatGPT\s*-\s*/i, '').trim();
}

function normalizeExactTitle(raw: unknown): string {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function isUsefulTitle(raw: unknown): boolean {
  const value = normalizeTitle(raw);
  return value.length > 0 && !SYNTHETIC_TITLE_RE.test(value);
}

function isUsefulSnippet(raw: unknown): boolean {
  const value = cleanLine(raw);
  return value.length > 0 && !SYNTHETIC_SNIPPET_RE.test(value);
}

function textFromTurns(turns: ImportedTurn[], role: ImportedTurn['role']): string {
  for (const turn of turns) {
    if (turn.role !== role) continue;
    const value = cleanLine(turn.text.split('\n')[0]);
    if (value.length > 4 && !NOISE_RE.test(value) && !isKnownTranscriptArtifact(value)) return value;
  }
  return '';
}

function firstAssistantText(turns: ImportedTurn[]): string {
  for (const turn of turns) {
    if (turn.role !== 'assistant') continue;
    const value = turn.text.split('\n').map(cleanLine).find(line => line.length > 4) ?? '';
    if (value) return value;
  }
  return '';
}

function deriveTitle(chat: ImportedChat, existingTitle?: string): string {
  if (isUsefulTitle(chat.fetchedChatGPTTitle)) return normalizeExactTitle(chat.fetchedChatGPTTitle);
  if (isUsefulTitle(chat.fetchedTitle)) return normalizeTitle(chat.fetchedTitle);
  if (isUsefulTitle(existingTitle)) return normalizeTitle(existingTitle);
  if (isUsefulTitle(chat.title)) return normalizeTitle(chat.title);

  const turns = chat.transcript?.turns ?? [];
  const userTitle = textFromTurns(turns, 'user');
  if (userTitle) return userTitle;

  const assistantTitle = firstAssistantText(turns);
  if (assistantTitle) return assistantTitle;

  const fallback = normalizeTitle(chat.fetchedTitle || chat.title);
  if (fallback) return fallback;
  return chat.shareId ? `Shared chat ${chat.shareId.slice(0, 8)}` : 'Imported ChatGPT chat';
}

function deriveSnippet(chat: ImportedChat, title: string): string {
  if (isUsefulSnippet(chat.fetchedSnippet)) return cleanLine(chat.fetchedSnippet);
  if (isUsefulSnippet(chat.snippet)) return cleanLine(chat.snippet);

  const turns = chat.transcript?.turns ?? [];
  const userSnippet = textFromTurns(turns, 'user');
  if (userSnippet && userSnippet !== title) return userSnippet;

  const assistantSnippet = firstAssistantText(turns);
  if (assistantSnippet && assistantSnippet !== title) return assistantSnippet;

  return chat.sourceUrl;
}

function stableId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

export function importedChatArchiveId(chat: Pick<ImportedChat, 'id' | 'shareId'>): string {
  return `imported-${stableId(chat.shareId || chat.id)}`;
}

function mapTurnToArchiveMessage(turn: ImportedTurn, order: number): ArchiveMessage | null {
  const text = String(turn.text || '').trim();
  if (!text || isKnownTranscriptArtifact(text)) return null;
  return {
    role: turn.role === 'unknown' ? 'assistant' : turn.role,
    text,
    order,
    createdAt: null,
  };
}

function messagesForImportedChat(chat: ImportedChat, title: string, snippet: string): ArchiveMessage[] {
  const turns = chat.transcript?.turns ?? [];
  const messages = turns
    .map(mapTurnToArchiveMessage)
    .filter((message): message is ArchiveMessage => !!message);

  if (messages.length > 0) return messages.map((message, order) => ({ ...message, order }));

  const fallbackText = [
    snippet && snippet !== chat.sourceUrl ? snippet : title,
    `Source: ${chat.sourceUrl}`,
  ].filter(Boolean).join('\n\n');

  return [{
    role: 'system',
    text: fallbackText,
    order: 0,
    createdAt: null,
  }];
}

export function archiveBundleFromImportedChat(
  chat: ImportedChat,
  exportedAt: string = nowIso(),
  options: { existingTitle?: string } = {},
): ArchiveBundleEnvelope {
  const chatId = importedChatArchiveId(chat);
  const snapshotId = `${chatId}:mobile-import`;
  const title = deriveTitle(chat, options.existingTitle);
  const snippet = deriveSnippet(chat, title);
  const messages = messagesForImportedChat(chat, title, snippet);
  const createdAt = chat.transcriptFetchedAt || chat.lastFetchedAt || chat.importedAt || exportedAt;

  const meta: SnapshotMeta = {
    title,
    excerpt: snippet,
    source: 'mobile',
    sourceType: chat.sourceType,
    sourceUrl: chat.sourceUrl,
    shareId: chat.shareId || '',
    capturedAt: createdAt,
    importedAt: chat.importedAt,
    updatedAt: createdAt,
    fetchedTitle: chat.fetchedTitle || '',
    fetchedChatGPTTitle: chat.fetchedChatGPTTitle || '',
    fetchedSnippet: chat.fetchedSnippet || '',
  };

  const snapshot: ArchiveSnapshot = {
    snapshotId,
    chatId,
    createdAt,
    schemaVersion: 1,
    messageCount: messages.length,
    digest: '',
    meta,
    messages,
  };

  const archiveChat: ArchiveChat = {
    chatId,
    chatIndex: {
      lastSnapshotId: snapshotId,
      lastCapturedAt: createdAt,
      pinnedSnapshotIds: [],
      retentionPolicy: { keepLatest: 30 },
      lastDigest: '',
    },
    snapshots: [snapshot],
  };

  return {
    schema: ARCHIVE_BUNDLE_SCHEMA,
    exportedAt,
    scope: 'chat',
    chatCount: 1,
    chats: [archiveChat],
  };
}

export async function promoteImportedChatToArchive(
  chat: ImportedChat,
): Promise<ImportedChatArchivePromotionResult> {
  await ensureArchiveStoreHydrated();
  const exportedAt = nowIso();
  const currentStore = getArchiveStoreSnapshot();
  const chatId = importedChatArchiveId(chat);
  const existingChat = currentStore.chats.find(item => item.chatId === chatId);
  const existingSnapshot = existingChat?.snapshots.find(snapshot => snapshot.snapshotId === `${chatId}:mobile-import`);
  const existingTitle = typeof existingSnapshot?.meta?.title === 'string' ? existingSnapshot.meta.title : undefined;
  const bundle = archiveBundleFromImportedChat(chat, exportedAt, { existingTitle });
  const { store } = mergeArchiveBundleIntoStore(currentStore, bundle, { nowIso: exportedAt });
  replaceArchiveStore(store, { persist: true });

  const promoted = bundle.chats[0];
  return {
    chatId: promoted.chatId,
    snapshotId: promoted.snapshots[0]?.snapshotId || '',
  };
}
