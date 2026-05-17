import { normalizeCategoryRecord, readCategoryCatalogRecords } from '@/features/categories';
import { normalizeTagInput } from '@/features/tags';
import type {
  ArchiveChat,
  ArchiveJsonObject,
  ArchiveMessage,
  ArchiveSnapshot,
  MobileArchiveStore,
} from '@/types/archive';

export interface ArchiveLibraryRow {
  id: string;
  chatId: string;
  snapshotId: string;
  title: string;
  snippet: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  answerCount: number;
  pinned: boolean;
  archived: boolean;
  folderId: string;
  folderName: string;
  folderBindingSource?: 'auto' | 'user';
  originSource: 'mobile' | 'browser' | 'unknown';
  /** @deprecated Use originSource. Kept temporarily for UI compatibility. */
  source?: 'mobile' | 'browser' | 'unknown';
  originProjectRef: { id: string; name: string } | null;
  category: {
    primaryCategoryId: string;
    secondaryCategoryId: string | null;
    source: 'system' | 'user';
    algorithmVersion: string | null;
    classifiedAt: string | null;
    overriddenAt: string | null;
    confidence: number | null;
  } | null;
  labels: {
    workflowStatusLabelId?: string;
    priorityLabelId?: string;
    actionLabelIds: string[];
    contextLabelIds: string[];
    customLabelIds: string[];
  };
  tags: string[];
  keywords: string[];
}

function isObject(value: unknown): value is ArchiveJsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanPreviewText(raw: unknown): string {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function stringField(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function normalizeStringField(raw: unknown): string {
  return String(raw || '').trim();
}

function normalizeStringArray(raw: unknown): string[] {
  const src = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of src) {
    const value = normalizeStringField(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeOriginSource(raw: unknown): 'mobile' | 'browser' | 'unknown' {
  const value = normalizeStringField(raw).toLowerCase();
  if (value === 'mobile') return 'mobile';
  if (value === 'browser') return 'browser';
  return 'unknown';
}

function normalizeProjectRef(raw: unknown): { id: string; name: string } | null {
  const row = isObject(raw) ? raw : {};
  const id = normalizeStringField(row.id ?? row.projectId);
  if (!id) return null;
  const name = normalizeStringField(row.name ?? row.projectName) || id;
  return { id, name };
}

function normalizeLabelAssignments(raw: unknown): ArchiveLibraryRow['labels'] {
  const row = isObject(raw) ? raw : {};
  return {
    workflowStatusLabelId: normalizeStringField(row.workflowStatusLabelId),
    priorityLabelId: normalizeStringField(row.priorityLabelId),
    actionLabelIds: normalizeStringArray(row.actionLabelIds),
    contextLabelIds: normalizeStringArray(row.contextLabelIds),
    customLabelIds: normalizeStringArray(row.customLabelIds),
  };
}

function normalizeKeywords(raw: unknown): string[] {
  return normalizeStringArray(raw);
}

function normalizeTags(raw: unknown): string[] {
  const src = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of src) {
    const tag = normalizeTagInput(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function metaOf(snapshot: ArchiveSnapshot | null | undefined): ArchiveJsonObject {
  return isObject(snapshot?.meta) ? snapshot.meta : {};
}

function sortKey(snapshot: ArchiveSnapshot): string {
  const meta = metaOf(snapshot);
  return stringField(meta.updatedAt) || stringField(snapshot.createdAt);
}

export function deriveLatestArchiveSnapshot(chat: ArchiveChat): ArchiveSnapshot | null {
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  let latest: ArchiveSnapshot | null = null;
  for (const snapshot of snapshots) {
    if (!latest) {
      latest = snapshot;
      continue;
    }
    const nextKey = sortKey(snapshot);
    const currentKey = sortKey(latest);
    if (nextKey > currentKey) {
      latest = snapshot;
      continue;
    }
    if (nextKey === currentKey && String(snapshot.snapshotId) > String(latest.snapshotId)) {
      latest = snapshot;
    }
  }
  return latest;
}

function countAssistantMessages(messages: ArchiveMessage[]): number {
  return messages.filter(message => String(message.role || '').toLowerCase() === 'assistant').length;
}

function firstUsefulTranscriptPreview(messages: ArchiveMessage[]): string {
  const assistant = messages.find(message => (
    String(message.role || '').toLowerCase() === 'assistant'
    && cleanPreviewText(message.text)
  ));
  const first = assistant || messages.find(message => cleanPreviewText(message.text));
  return cleanPreviewText(first?.text).slice(0, 220);
}

function tagsFromMeta(meta: ArchiveJsonObject): string[] {
  return normalizeTags(meta.tags);
}

function keywordsFromMeta(meta: ArchiveJsonObject): string[] {
  return normalizeKeywords(meta.keywords);
}

function isSnapshotArchived(meta: ArchiveJsonObject): boolean {
  if (meta.archived === true) return true;
  return stringField(meta.state).toLowerCase() === 'archived';
}

function isChatPinned(chat: ArchiveChat, latest: ArchiveSnapshot): boolean {
  const pins = Array.isArray(chat.chatIndex?.pinnedSnapshotIds) ? chat.chatIndex.pinnedSnapshotIds : [];
  return pins.map(pin => String(pin || '').trim()).filter(Boolean).includes(latest.snapshotId);
}

function sourceFromMeta(meta: ArchiveJsonObject): 'mobile' | 'browser' | 'unknown' {
  return normalizeOriginSource(meta.originSource ?? meta.source);
}

function projectRefFromMeta(meta: ArchiveJsonObject): { id: string; name: string } | null {
  return normalizeProjectRef(meta.originProjectRef);
}

function categoryFromMeta(meta: ArchiveJsonObject, categoryCatalog: unknown = []): ArchiveLibraryRow['category'] {
  return normalizeCategoryRecord(meta.category, categoryCatalog);
}

function labelsFromMeta(meta: ArchiveJsonObject): ArchiveLibraryRow['labels'] {
  return normalizeLabelAssignments(meta.labels);
}

export function deriveArchiveLibraryRow(chat: ArchiveChat): ArchiveLibraryRow | null {
  const latest = deriveLatestArchiveSnapshot(chat);
  if (!latest) return null;

  const meta = metaOf(latest);
  const title = stringField(meta.title) || chat.chatId;
  const snippet = stringField(meta.excerpt) || firstUsefulTranscriptPreview(latest.messages);
  const createdAt = stringField(latest.createdAt) || stringField(meta.updatedAt);
  const updatedAt = stringField(meta.updatedAt) || createdAt;
  const messageCountRaw = Number(latest.messageCount);
  const messageCount = Number.isFinite(messageCountRaw) && messageCountRaw > 0
    ? Math.max(0, Math.floor(messageCountRaw))
    : latest.messages.length;
  const originSource = sourceFromMeta(meta);

  return {
    id: chat.chatId,
    chatId: chat.chatId,
    snapshotId: latest.snapshotId,
    title,
    snippet,
    createdAt,
    updatedAt,
    messageCount,
    answerCount: countAssistantMessages(latest.messages),
    pinned: isChatPinned(chat, latest),
    archived: isSnapshotArchived(meta),
    folderId: stringField(meta.folderId || meta.folder),
    folderName: stringField(meta.folderName),
    folderBindingSource: stringField(meta.folderBindingSource) === 'auto' ? 'auto' : 'user',
    originSource,
    source: originSource,
    originProjectRef: projectRefFromMeta(meta),
    category: categoryFromMeta(meta),
    labels: labelsFromMeta(meta),
    tags: tagsFromMeta(meta),
    keywords: keywordsFromMeta(meta),
  };
}

export function deriveArchiveLibraryRows(store: MobileArchiveStore): ArchiveLibraryRow[] {
  const categoryCatalog = readCategoryCatalogRecords(store);
  const rows = (Array.isArray(store.chats) ? store.chats : [])
    .map((chat) => {
      const row = deriveArchiveLibraryRow(chat);
      if (!row) return null;
      const latest = deriveLatestArchiveSnapshot(chat);
      const meta = metaOf(latest);
      return { ...row, category: categoryFromMeta(meta, categoryCatalog) };
    })
    .filter((row): row is ArchiveLibraryRow => !!row);

  rows.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const byUpdated = String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
    if (byUpdated) return byUpdated;
    return String(a.chatId).localeCompare(String(b.chatId));
  });

  return rows;
}
