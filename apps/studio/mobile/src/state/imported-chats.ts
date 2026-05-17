import type { ImportedChat } from '@/types/import-chatgpt-link';
import { loadImportedChats, saveImportedChats } from '@/storage/imported-chats';
import { promoteImportedChatToArchive } from '@/importers/imported-chat-archive';

// ---------------------------------------------------------------------------
// In-memory store
// Backed by `global` so Hot Module Replacement in dev cannot clear state.
// ---------------------------------------------------------------------------

type StoreShape = {
  chats: ImportedChat[];
  listeners: Set<() => void>;
  hydrated: boolean;
  hydrationPromise: Promise<void> | null;
};

const g = global as Record<string, unknown>;
if (!g.__h2o_importedChats) {
  const init: StoreShape = {
    chats: [],
    listeners: new Set<() => void>(),
    hydrated: false,
    hydrationPromise: null,
  };
  g.__h2o_importedChats = init;
}
const _store = g.__h2o_importedChats as StoreShape;

const SYNTHETIC_TITLE_RE = /^Shared chat \([^)]+\)$/;
const SYNTHETIC_SNIPPET_RE = /^Imported from ChatGPT on /;

function _notify(): void {
  _store.listeners.forEach(fn => fn());
}

// Fire-and-forget persistence — callers never need to await a flush.
function _persist(): void {
  saveImportedChats(_store.chats).catch(() => { /* silent — UI is already updated */ });
}

function markPromoted(id: string, archiveChatId: string): void {
  const idx = _store.chats.findIndex(c => c.id === id);
  if (idx === -1) return;

  _store.chats = [
    ..._store.chats.slice(0, idx),
    {
      ..._store.chats[idx],
      archivePromotedAt: new Date().toISOString(),
      archiveChatId,
    },
    ..._store.chats.slice(idx + 1),
  ];
  _persist();
  _notify();
}

function promoteStoredChat(chat: ImportedChat): void {
  promoteImportedChatToArchive(chat)
    .then(result => markPromoted(chat.id, result.chatId))
    .catch(() => { /* compatibility migration is best effort */ });
}

function promotePendingImportedChats(): void {
  for (const chat of _store.chats) {
    if (chat.archivePromotedAt) continue;
    promoteStoredChat(chat);
  }
}

// ---------------------------------------------------------------------------
// Public store API (useSyncExternalStore contract)
// ---------------------------------------------------------------------------

export function subscribe(listener: () => void): () => void {
  _store.listeners.add(listener);
  return () => _store.listeners.delete(listener);
}

export function getSnapshot(): ImportedChat[] {
  return _store.chats;
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

/**
 * Loads persisted chats from disk and populates the in-memory store.
 * Safe to call multiple times — only runs once per process lifetime.
 * Call this once at app bootstrap (e.g. root layout useEffect).
 */
export async function initImportedChatsStore(): Promise<void> {
  if (_store.hydrated) return;
  if (_store.hydrationPromise) {
    await _store.hydrationPromise;
    return;
  }

  _store.hydrationPromise = (async () => {
    const saved = await loadImportedChats();
    if (saved.length > 0) {
      _store.chats = saved;
      _notify();
      promotePendingImportedChats();
    }
    _store.hydrated = true;
    _store.hydrationPromise = null;
  })();

  await _store.hydrationPromise;
}

export async function ensureImportedChatsHydrated(): Promise<void> {
  await initImportedChatsStore();
}

function preferString(
  existing: string | undefined,
  incoming: string | undefined,
  isSynthetic: (value: string) => boolean,
): string | undefined {
  if (!incoming) return existing;
  if (!existing) return incoming;
  const existingSynthetic = isSynthetic(existing);
  const incomingSynthetic = isSynthetic(incoming);
  if (existingSynthetic && !incomingSynthetic) return incoming;
  if (!existingSynthetic && incomingSynthetic) return existing;
  if (existingSynthetic && incomingSynthetic) return existing;
  return incoming;
}

function mergeImportedChat(existing: ImportedChat, incoming: ImportedChat): ImportedChat {
  return {
    ...existing,
    sourceUrl: incoming.sourceUrl || existing.sourceUrl,
    title: preferString(existing.title, incoming.title, value => SYNTHETIC_TITLE_RE.test(value)) ?? existing.title,
    snippet: preferString(existing.snippet, incoming.snippet, value => SYNTHETIC_SNIPPET_RE.test(value)) ?? existing.snippet,
    fetchedTitle: incoming.fetchedTitle ?? existing.fetchedTitle,
    fetchedSnippet: incoming.fetchedSnippet ?? existing.fetchedSnippet,
  };
}

function chatsEqual(a: ImportedChat, b: ImportedChat): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Deduplicated insert
// ---------------------------------------------------------------------------

/**
 * Inserts `item` if no chat with the same `shareId` exists.
 * If a duplicate is found, navigates silently to the existing record (no mutation).
 * Returns the canonical id — either the existing record's id or the new item's id.
 */
export function upsertImportedChatByShareId(item: ImportedChat): string {
  if (item.shareId) {
    const existingIndex = _store.chats.findIndex(c => c.shareId === item.shareId);
    if (existingIndex !== -1) {
      const existing = _store.chats[existingIndex];
      const merged = mergeImportedChat(existing, item);
      if (!chatsEqual(existing, merged)) {
        _store.chats = [
          ..._store.chats.slice(0, existingIndex),
          merged,
          ..._store.chats.slice(existingIndex + 1),
        ];
        _persist();
        _notify();
        promoteStoredChat(merged);
      }
      // Duplicate — return existing id without creating a new row.
      return existing.id;
    }
  }
  _store.chats = [item, ..._store.chats];
  _persist();
  _notify();
  promoteStoredChat(item);
  return item.id;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function getImportedChatById(id: string): ImportedChat | undefined {
  return _store.chats.find(c => c.id === id);
}

export function updateImportedChat(id: string, updates: Partial<ImportedChat>): void {
  const idx = _store.chats.findIndex(c => c.id === id);
  if (idx === -1) return;
  const updated = { ..._store.chats[idx], ...updates };
  _store.chats = [
    ..._store.chats.slice(0, idx),
    updated,
    ..._store.chats.slice(idx + 1),
  ];
  _persist();
  _notify();
  promoteStoredChat(updated);
}

/**
 * @deprecated Use upsertImportedChatByShareId for new imports.
 * Kept for callers that create items with no shareId.
 */
export function addImportedChat(item: ImportedChat): void {
  _store.chats = [item, ..._store.chats];
  _persist();
  _notify();
  promoteStoredChat(item);
}
