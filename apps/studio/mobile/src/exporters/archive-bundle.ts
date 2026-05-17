import {
  ARCHIVE_BUNDLE_SCHEMA,
  type ArchiveJsonObject,
  type ArchiveBundleEnvelope,
  type ArchiveBundleScope,
  type ArchiveChat,
  type ArchiveSnapshot,
  type MobileArchiveStore,
} from '@/types/archive';
import { deriveLatestSnapshotForChat, normalizeArchiveChatIndex } from '@/importers/archive-bundle';
import { readCategoryCatalogRecords } from '@/features/categories';
import { readLabelCatalogRecords } from '@/features/labels';

export interface ExportArchiveBundleOptions {
  scope?: ArchiveBundleScope;
  chatId?: string;
  exportedAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isObject(value: unknown): value is ArchiveJsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function cloneArchiveSnapshotForBundle(snapshot: ArchiveSnapshot): ArchiveSnapshot {
  return {
    ...snapshot,
    meta: { ...snapshot.meta },
    messages: snapshot.messages.map(message => ({ ...message })),
  };
}

export function cloneArchiveChatForBundle(chat: ArchiveChat): ArchiveChat {
  const snapshots = chat.snapshots.map(cloneArchiveSnapshotForBundle);
  const latest = deriveLatestSnapshotForChat({ ...chat, snapshots });
  const presentSnapshotIds = new Set(snapshots.map(snapshot => snapshot.snapshotId));
  const chatIndex = normalizeArchiveChatIndex(chat.chatIndex);
  return {
    ...chat,
    chatIndex: {
      ...chatIndex,
      lastSnapshotId: latest?.snapshotId || '',
      lastCapturedAt: latest?.createdAt || '',
      pinnedSnapshotIds: chatIndex.pinnedSnapshotIds.filter(id => presentSnapshotIds.has(id)),
      lastDigest: latest?.digest || '',
    },
    snapshots,
  };
}

export function exportArchiveBundle(
  store: MobileArchiveStore,
  options: ExportArchiveBundleOptions = {},
): ArchiveBundleEnvelope {
  const scope = options.scope || 'all';
  let chats = Array.isArray(store.chats) ? store.chats : [];

  if (scope === 'chat') {
    const chatId = String(options.chatId || '').trim();
    if (!chatId) throw new Error('missing chatId for chat-scoped archive export');
    chats = chats.filter(chat => chat.chatId === chatId);
    if (!chats.length) throw new Error(`archive chat not found: ${chatId}`);
  }

  const clonedChats = chats.map(cloneArchiveChatForBundle);

  const bundleExtras = isObject(store.bundleExtras) ? { ...store.bundleExtras } : {};
  const catalogs = isObject(bundleExtras.catalogs) ? { ...bundleExtras.catalogs } : {};
  catalogs.categories = readCategoryCatalogRecords(store);
  catalogs.labels = readLabelCatalogRecords(store);
  bundleExtras.catalogs = catalogs;

  return {
    ...bundleExtras,
    schema: ARCHIVE_BUNDLE_SCHEMA,
    exportedAt: options.exportedAt || nowIso(),
    scope,
    chatCount: clonedChats.length,
    chats: clonedChats,
  };
}
