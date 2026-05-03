import {
  ARCHIVE_BUNDLE_SCHEMA,
  ARCHIVE_DEFAULT_RETENTION_KEEP_LATEST,
  MOBILE_ARCHIVE_STORE_SCHEMA,
  type ArchiveBundleEnvelope,
  type ArchiveChat,
  type ArchiveChatIndex,
  type ArchiveImportIssue,
  type ArchiveImportReport,
  type ArchiveJsonObject,
  type ArchiveMergeOptions,
  type ArchiveMessage,
  type ArchiveSnapshot,
  type ArchiveValidationResult,
  type MobileArchiveStore,
} from '@/types/archive';
import { isKnownTranscriptArtifact } from '@/utils/transcript-artifacts';
import {
  classifySnapshotCategory,
  mergeCategoryRecords,
  seedDefaultCategoryCatalog,
  normalizeCategoryRecord,
} from '@/features/categories';
import { seedDefaultLabelCatalog } from '@/features/labels';

function isObject(value: unknown): value is ArchiveJsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function toInteger(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function uniqStrings(value: unknown): string[] {
  const src = Array.isArray(value) ? value : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of src) {
    const next = String(item ?? '').trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function defaultChatIndex(): ArchiveChatIndex {
  return {
    lastSnapshotId: '',
    lastCapturedAt: '',
    pinnedSnapshotIds: [],
    retentionPolicy: { keepLatest: ARCHIVE_DEFAULT_RETENTION_KEEP_LATEST },
    lastDigest: '',
  };
}

function normalizeRetentionPolicy(value: unknown): ArchiveChatIndex['retentionPolicy'] {
  const raw = isObject(value) ? value : {};
  const keepLatestRaw = Number(raw.keepLatest);
  const keepLatest = Number.isFinite(keepLatestRaw)
    ? Math.max(1, Math.min(1000, Math.floor(keepLatestRaw)))
    : ARCHIVE_DEFAULT_RETENTION_KEEP_LATEST;
  return { ...raw, keepLatest };
}

export function normalizeArchiveChatIndex(raw: unknown): ArchiveChatIndex {
  if (!isObject(raw)) return defaultChatIndex();
  return {
    ...raw,
    lastSnapshotId: toStringValue(raw.lastSnapshotId).trim(),
    lastCapturedAt: toStringValue(raw.lastCapturedAt).trim(),
    pinnedSnapshotIds: uniqStrings(raw.pinnedSnapshotIds),
    retentionPolicy: normalizeRetentionPolicy(raw.retentionPolicy),
    lastDigest: toStringValue(raw.lastDigest).trim(),
  };
}

export function normalizeArchiveMessage(raw: unknown, orderFallback: number): ArchiveMessage | null {
  if (!isObject(raw)) return null;
  const text = toStringValue(raw.text ?? raw.content).trim();
  if (!text || isKnownTranscriptArtifact(text)) return null;
  const order = toInteger(raw.order);
  const createdAt = toInteger(raw.createdAt ?? raw.create_time ?? raw.timestamp);
  return {
    ...raw,
    role: toStringValue(raw.role || raw.author || raw.type || 'assistant').trim() || 'assistant',
    text,
    order: order ?? orderFallback,
    createdAt,
  };
}

function normalizeArchiveMessages(raw: unknown): ArchiveMessage[] {
  const src = Array.isArray(raw) ? raw : [];
  const rows: ArchiveMessage[] = [];
  const validOriginalOrders: number[] = [];
  let needsRepair = false;

  for (let i = 0; i < src.length; i += 1) {
    const original = isObject(src[i]) ? src[i] : null;
    const order = original ? toInteger(original.order) : null;
    if (order == null) needsRepair = true;
    else validOriginalOrders.push(order);

    const message = normalizeArchiveMessage(src[i], i);
    if (message) rows.push(message);
  }

  const uniqueOrders = new Set(validOriginalOrders);
  if (uniqueOrders.size !== validOriginalOrders.length) needsRepair = true;

  rows.sort((a, b) => {
    const byOrder = Number(a.order) - Number(b.order);
    if (byOrder) return byOrder;
    return String(a.text).localeCompare(String(b.text));
  });

  if (needsRepair) {
    return rows.map((row, index) => ({ ...row, order: index }));
  }
  return rows;
}

export function normalizeArchiveSnapshot(raw: unknown, chatId: string, categoryCatalog: unknown = []): ArchiveSnapshot | null {
  if (!isObject(raw)) return null;
  const snapshotId = toStringValue(raw.snapshotId).trim();
  if (!snapshotId) return null;

  const messages = normalizeArchiveMessages(raw.messages);
  if (!messages.length) return null;

  const schemaVersion = toInteger(raw.schemaVersion) ?? 1;
  const messageCount = toInteger(raw.messageCount) ?? messages.length;
  const meta = isObject(raw.meta) ? { ...raw.meta } : {};
  meta.category = normalizeCategoryRecord(meta.category, categoryCatalog)
    || normalizeCategoryRecord(
      classifySnapshotCategory(
        { meta, messages },
        { classifiedAt: toStringValue(raw.createdAt || meta.capturedAt || meta.updatedAt || nowIso()).trim() },
      ),
      categoryCatalog,
    );

  return {
    ...raw,
    snapshotId,
    chatId,
    createdAt: toStringValue(raw.createdAt || raw.capturedAt || '').trim(),
    schemaVersion,
    messageCount,
    digest: toStringValue(raw.digest).trim(),
    meta,
    messages,
  };
}

export function deriveLatestSnapshotForChat(chat: ArchiveChat): ArchiveSnapshot | null {
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  let latest: ArchiveSnapshot | null = null;
  for (const snapshot of snapshots) {
    if (!latest) {
      latest = snapshot;
      continue;
    }
    const snapMeta = isObject(snapshot.meta) ? snapshot.meta : {};
    const latestMeta = isObject(latest.meta) ? latest.meta : {};
    const snapKey = toStringValue(snapMeta.updatedAt || snapshot.createdAt || '');
    const latestKey = toStringValue(latestMeta.updatedAt || latest.createdAt || '');
    if (snapKey > latestKey) {
      latest = snapshot;
      continue;
    }
    if (snapKey === latestKey && String(snapshot.snapshotId) > String(latest.snapshotId)) {
      latest = snapshot;
    }
  }
  return latest;
}

function finalizeChatIndex(chat: ArchiveChat, baseIndex: ArchiveChatIndex): ArchiveChatIndex {
  const latest = deriveLatestSnapshotForChat(chat);
  const presentSnapshotIds = new Set(chat.snapshots.map(snapshot => snapshot.snapshotId));
  const pinnedSnapshotIds = uniqStrings(baseIndex.pinnedSnapshotIds).filter(id => presentSnapshotIds.has(id));
  return {
    ...baseIndex,
    lastSnapshotId: latest?.snapshotId || '',
    lastCapturedAt: latest?.createdAt || '',
    pinnedSnapshotIds,
    retentionPolicy: normalizeRetentionPolicy(baseIndex.retentionPolicy),
    lastDigest: latest?.digest || '',
  };
}

export function normalizeArchiveChat(raw: unknown, categoryCatalog: unknown = []): ArchiveChat | null {
  if (!isObject(raw)) return null;
  const chatId = toStringValue(raw.chatId).trim();
  if (!chatId) return null;

  const snapshots: ArchiveSnapshot[] = [];
  const rawSnapshots = Array.isArray(raw.snapshots) ? raw.snapshots : [];
  for (const item of rawSnapshots) {
    const snapshot = normalizeArchiveSnapshot(item, chatId, categoryCatalog);
    if (snapshot) snapshots.push(snapshot);
  }

  const chat: ArchiveChat = {
    ...raw,
    chatId,
    chatIndex: normalizeArchiveChatIndex(raw.chatIndex),
    snapshots,
  };
  if (Object.prototype.hasOwnProperty.call(raw, 'bootMode')) chat.bootMode = toStringValue(raw.bootMode);
  if (Object.prototype.hasOwnProperty.call(raw, 'migrated')) chat.migrated = raw.migrated === true;
  chat.chatIndex = finalizeChatIndex(chat, chat.chatIndex);
  return chat;
}

function bundleExtras(raw: ArchiveJsonObject): ArchiveJsonObject {
  const {
    schema: _schema,
    exportedAt: _exportedAt,
    scope: _scope,
    chatCount: _chatCount,
    chats: _chats,
    ...extras
  } = raw;
  return extras;
}

function mergeCatalogExtras(existingRaw: unknown, incomingRaw: unknown): ArchiveJsonObject {
  const existing = isObject(existingRaw) ? existingRaw : {};
  const incoming = isObject(incomingRaw) ? incomingRaw : {};
  return {
    ...existing,
    ...incoming,
    labels: seedDefaultLabelCatalog([
      ...(Array.isArray(existing.labels) ? existing.labels : []),
      ...(Array.isArray(incoming.labels) ? incoming.labels : []),
    ]),
    categories: seedDefaultCategoryCatalog([
      ...(Array.isArray(existing.categories) ? existing.categories : []),
      ...(Array.isArray(incoming.categories) ? incoming.categories : []),
    ]),
  };
}

function mergeBundleExtras(existingRaw: unknown, incomingRaw: unknown): ArchiveJsonObject {
  const existing = isObject(existingRaw) ? existingRaw : {};
  const incoming = isObject(incomingRaw) ? incomingRaw : {};
  return {
    ...existing,
    ...incoming,
    catalogs: mergeCatalogExtras(existing.catalogs, incoming.catalogs),
  };
}

export function normalizeArchiveBundle(raw: unknown): ArchiveValidationResult {
  if (!isObject(raw) || raw.schema !== ARCHIVE_BUNDLE_SCHEMA || !Array.isArray(raw.chats)) {
    return {
      ok: false,
      errors: [{
        code: 'invalid_bundle',
        message: 'Expected h2o.chatArchive.bundle.v1 with a chats array.',
      }],
    };
  }

  const warnings: ArchiveImportIssue[] = [];
  const chats: ArchiveChat[] = [];
  const categoryCatalog = seedDefaultCategoryCatalog(isObject(raw.catalogs) ? raw.catalogs.categories : []);

  for (const rawChat of raw.chats) {
    const chatId = isObject(rawChat) ? toStringValue(rawChat.chatId).trim() : '';
    if (!chatId) {
      warnings.push({ code: 'invalid_chat', message: 'Skipped archive chat without chatId.' });
      continue;
    }

    const rawSnapshots = isObject(rawChat) && Array.isArray(rawChat.snapshots) ? rawChat.snapshots : [];
    for (const rawSnapshot of rawSnapshots) {
      const snapshotId = isObject(rawSnapshot) ? toStringValue(rawSnapshot.snapshotId).trim() : '';
      if (!isObject(rawSnapshot) || !snapshotId) {
        warnings.push({ code: 'invalid_snapshot', chatId, message: 'Skipped snapshot without snapshotId.' });
        continue;
      }
      if (!Array.isArray(rawSnapshot.messages)) {
        warnings.push({ code: 'missing_messages', chatId, snapshotId, message: 'Snapshot has no messages array.' });
        continue;
      }
      if (!normalizeArchiveMessages(rawSnapshot.messages).length) {
        warnings.push({ code: 'empty_snapshot', chatId, snapshotId, message: 'Snapshot has no usable messages.' });
      }
    }

    const chat = normalizeArchiveChat(rawChat, categoryCatalog);
    if (!chat) {
      warnings.push({ code: 'invalid_chat', chatId, message: 'Skipped malformed archive chat.' });
      continue;
    }
    chats.push(chat);
  }

  const normalized: ArchiveBundleEnvelope = {
    ...bundleExtras(raw),
    schema: ARCHIVE_BUNDLE_SCHEMA,
    exportedAt: toStringValue(raw.exportedAt || nowIso()),
    scope: toStringValue(raw.scope || 'all'),
    chatCount: chats.length,
    chats,
  };

  return { ok: true, bundle: normalized, warnings };
}

export function validateArchiveBundle(raw: unknown): ArchiveValidationResult {
  return normalizeArchiveBundle(raw);
}

function emptyReport(mode: 'merge' | 'overwrite'): ArchiveImportReport {
  return {
    ok: true,
    mode,
    importedChats: 0,
    importedSnapshots: 0,
    replacedSnapshots: 0,
    skippedDuplicateSnapshots: 0,
    skippedEmptySnapshots: 0,
    skippedMalformedSnapshots: 0,
    identityMergedChats: 0,
    warnings: [],
    errors: [],
  };
}

function extractChatIdentity(chat: ArchiveChat): { chatgptId: string; shareId: string } {
  const latest = deriveLatestSnapshotForChat(chat);
  const meta = latest && isObject(latest.meta) ? latest.meta : {};
  return {
    chatgptId: toStringValue(meta.chatgptId).trim(),
    shareId: toStringValue(meta.shareId).trim(),
  };
}

function cloneChat(chat: ArchiveChat): ArchiveChat {
  return {
    ...chat,
    chatIndex: { ...chat.chatIndex, pinnedSnapshotIds: chat.chatIndex.pinnedSnapshotIds.slice() },
    snapshots: chat.snapshots.map(snapshot => ({
      ...snapshot,
      meta: { ...snapshot.meta },
      messages: snapshot.messages.map(message => ({ ...message })),
    })),
  };
}

function mergePinnedSnapshotIds(existing: ArchiveChatIndex, incoming: ArchiveChatIndex, mode: 'merge' | 'overwrite'): string[] {
  if (mode === 'overwrite') return uniqStrings(incoming.pinnedSnapshotIds);
  return uniqStrings([
    ...existing.pinnedSnapshotIds,
    ...incoming.pinnedSnapshotIds,
  ]);
}

function cloneSnapshot(snapshot: ArchiveSnapshot): ArchiveSnapshot {
  return {
    ...snapshot,
    meta: { ...snapshot.meta },
    messages: snapshot.messages.map(message => ({ ...message })),
  };
}

function mergeSnapshotsIntoList(
  target: ArchiveSnapshot[],
  incomingSnapshots: ArchiveSnapshot[],
  chatId: string,
  report: ArchiveImportReport,
  categoryCatalog: unknown,
): { snapshots: ArchiveSnapshot[]; changed: boolean } {
  const snapshots = target.map(cloneSnapshot);
  const bySnapshotId = new Map(snapshots.map((snapshot, index) => [snapshot.snapshotId, index]));
  const digestToSnapshotId = new Map<string, string>();
  let changed = false;

  for (const snapshot of snapshots) {
    if (snapshot.digest) digestToSnapshotId.set(snapshot.digest, snapshot.snapshotId);
  }

  for (const incomingSnapshot of incomingSnapshots) {
    if (!incomingSnapshot.messages.length) {
      report.skippedEmptySnapshots += 1;
      report.warnings.push({
        code: 'empty_snapshot',
        chatId,
        snapshotId: incomingSnapshot.snapshotId,
        message: 'Skipped empty archive snapshot.',
      });
      continue;
    }

    const existingSnapshotIndex = bySnapshotId.get(incomingSnapshot.snapshotId);
    if (existingSnapshotIndex != null) {
      const existingSnapshot = snapshots[existingSnapshotIndex];
      const nextSnapshot = cloneSnapshot(incomingSnapshot);
      const existingMeta = isObject(existingSnapshot.meta) ? existingSnapshot.meta : {};
      const incomingMeta = isObject(nextSnapshot.meta) ? nextSnapshot.meta : {};
      nextSnapshot.meta = {
        ...incomingMeta,
        category: mergeCategoryRecords(existingMeta.category, incomingMeta.category, categoryCatalog),
      };
      snapshots[existingSnapshotIndex] = nextSnapshot;
      if (incomingSnapshot.digest) digestToSnapshotId.set(incomingSnapshot.digest, incomingSnapshot.snapshotId);
      report.replacedSnapshots += 1;
      changed = true;
      continue;
    }

    const duplicateSnapshotId = incomingSnapshot.digest ? digestToSnapshotId.get(incomingSnapshot.digest) : '';
    if (duplicateSnapshotId && duplicateSnapshotId !== incomingSnapshot.snapshotId) {
      report.skippedDuplicateSnapshots += 1;
      report.warnings.push({
        code: 'duplicate_digest',
        chatId,
        snapshotId: incomingSnapshot.snapshotId,
        message: `Skipped duplicate snapshot digest already stored as ${duplicateSnapshotId}.`,
      });
      continue;
    }

    bySnapshotId.set(incomingSnapshot.snapshotId, snapshots.length);
    if (incomingSnapshot.digest) digestToSnapshotId.set(incomingSnapshot.digest, incomingSnapshot.snapshotId);
    snapshots.push(cloneSnapshot(incomingSnapshot));
    report.importedSnapshots += 1;
    changed = true;
  }

  return { snapshots, changed };
}

export function mergeArchiveBundleIntoStore(
  store: MobileArchiveStore,
  bundle: ArchiveBundleEnvelope,
  options: ArchiveMergeOptions = {},
): { store: MobileArchiveStore; report: ArchiveImportReport } {
  const mode = options.mode === 'overwrite' ? 'overwrite' : 'merge';
  const report = emptyReport(mode);
  let changed = false;
  const mergedBundleExtras = mergeBundleExtras(store.bundleExtras, bundleExtras(bundle));
  const mergedCatalogs = isObject(mergedBundleExtras.catalogs) ? mergedBundleExtras.catalogs : {};
  const categoryCatalog = seedDefaultCategoryCatalog(mergedCatalogs.categories);

  const nextChats = (Array.isArray(store.chats) ? store.chats : []).map(cloneChat);
  const chatIndexById = new Map(nextChats.map((chat, index) => [chat.chatId, index]));

  // Identity indexes for cross-platform dedup (chatgptId / shareId → store index)
  const chatgptIdToIndex = new Map<string, number>();
  const shareIdToIndex = new Map<string, number>();
  for (const [, storeIndex] of chatIndexById) {
    const { chatgptId, shareId } = extractChatIdentity(nextChats[storeIndex]);
    if (chatgptId) chatgptIdToIndex.set(chatgptId, storeIndex);
    if (shareId) shareIdToIndex.set(shareId, storeIndex);
  }

  for (const incomingRaw of bundle.chats) {
    const incoming = normalizeArchiveChat(incomingRaw, categoryCatalog);
    if (!incoming) {
      report.warnings.push({ code: 'invalid_chat', message: 'Skipped malformed archive chat.' });
      continue;
    }

    report.importedChats += 1;
    let existingIndex = chatIndexById.get(incoming.chatId);
    let isIdentityMatch = false;

    if (existingIndex == null) {
      const { chatgptId, shareId } = extractChatIdentity(incoming);
      if (chatgptId) existingIndex = chatgptIdToIndex.get(chatgptId);
      if (existingIndex == null && shareId) existingIndex = shareIdToIndex.get(shareId);
      if (existingIndex != null) {
        isIdentityMatch = true;
        report.identityMergedChats += 1;
        report.warnings.push({
          code: 'identity_merge',
          chatId: incoming.chatId,
          message: `Merged by identity into existing chat ${nextChats[existingIndex].chatId}.`,
        });
      }
    }

    const existing = existingIndex == null ? null : nextChats[existingIndex];

    if (!isIdentityMatch && (existingIndex == null || !existing || mode === 'overwrite')) {
      const next = cloneChat(incoming);
      const mergedSnapshots = mergeSnapshotsIntoList([], incoming.snapshots, incoming.chatId, report, categoryCatalog);
      next.snapshots = mergedSnapshots.snapshots;
      next.chatIndex = finalizeChatIndex(next, incoming.chatIndex);
      if (existingIndex == null) {
        chatIndexById.set(next.chatId, nextChats.length);
        nextChats.push(next);
      } else {
        nextChats[existingIndex] = next;
      }
      changed = true;
      continue;
    }

    // Merge path: chatId match in merge mode, or identity match (always merge, never replace)
    const targetChatId = isIdentityMatch ? existing!.chatId : incoming.chatId;
    const remappedSnapshots = isIdentityMatch
      ? incoming.snapshots.map(snapshot => ({ ...cloneSnapshot(snapshot), chatId: targetChatId }))
      : incoming.snapshots;

    const mergedSnapshots = mergeSnapshotsIntoList(existing!.snapshots, remappedSnapshots, targetChatId, report, categoryCatalog);
    changed = mergedSnapshots.changed || changed;

    const mergedChat: ArchiveChat = {
      ...existing!,
      ...incoming,
      chatId: targetChatId,
      snapshots: mergedSnapshots.snapshots,
      chatIndex: {
        ...existing!.chatIndex,
        ...incoming.chatIndex,
        pinnedSnapshotIds: mergePinnedSnapshotIds(existing!.chatIndex, incoming.chatIndex, mode),
      },
    };
    mergedChat.chatIndex = finalizeChatIndex(mergedChat, mergedChat.chatIndex);
    nextChats[existingIndex!] = mergedChat;
  }

  const nextStore: MobileArchiveStore = {
    ...store,
    schema: MOBILE_ARCHIVE_STORE_SCHEMA,
    updatedAt: changed ? (options.nowIso || nowIso()) : String(store.updatedAt || options.nowIso || nowIso()),
    bundleExtras: mergedBundleExtras,
    chats: nextChats,
  };

  return { store: nextStore, report };
}
