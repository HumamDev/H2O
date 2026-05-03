import { getArchiveStoreSnapshot, replaceArchiveStore } from '@/state/archive';
import {
  CANONICAL_FOLDER_INDEX_KEY,
  createCanonicalFolderId,
  deriveCanonicalFolders,
  normalizeFolderId,
  normalizeFolderIconColor,
  normalizeFolderName,
  readCanonicalFolderRecords,
} from '@/features/folders';
import {
  classifySnapshotCategory,
  normalizeCategoryRecord,
  readCategoryCatalogRecords,
} from '@/features/categories';
import {
  findLabelRecord,
  normalizeLabelRecord,
  readLabelCatalogRecords,
  writeLabelCatalogRecords,
} from '@/features/labels';
import { deriveArchiveLibraryRows } from '@/features/library/archive-rows';
import { normalizeTagInput, normalizeTagList } from '@/features/tags';
import type { ArchiveJsonObject, ArchiveSnapshot, LabelRecord, MobileArchiveStore } from '@/types/archive';
import type { ProjectRef } from '@/types/library';

function cloneStore(store: MobileArchiveStore): MobileArchiveStore {
  return JSON.parse(JSON.stringify(store)) as MobileArchiveStore;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function ensureSnapshotMeta(snapshot: ArchiveSnapshot): ArchiveJsonObject {
  if (typeof snapshot.meta !== 'object' || snapshot.meta === null || Array.isArray(snapshot.meta)) {
    snapshot.meta = {};
  }
  return snapshot.meta;
}

function findLatestSnapshot(chatId: string, store: MobileArchiveStore): ArchiveSnapshot | null {
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return null;
  const latestId = String(chat.chatIndex?.lastSnapshotId ?? '').trim();
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  return snapshots.find(s => String(s.snapshotId) === latestId)
    ?? snapshots[snapshots.length - 1]
    ?? null;
}

function normalizeStringArray(raw: unknown): string[] {
  const src = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of src) {
    const value = String(item ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function ensureLabelAssignments(meta: ArchiveJsonObject): {
  workflowStatusLabelId?: string;
  priorityLabelId?: string;
  actionLabelIds: string[];
  contextLabelIds: string[];
  customLabelIds: string[];
} {
  const raw = typeof meta.labels === 'object' && meta.labels !== null && !Array.isArray(meta.labels)
    ? meta.labels as ArchiveJsonObject
    : {};
  const labels = {
    workflowStatusLabelId: String(raw.workflowStatusLabelId ?? '').trim(),
    priorityLabelId: String(raw.priorityLabelId ?? '').trim(),
    actionLabelIds: normalizeStringArray(raw.actionLabelIds),
    contextLabelIds: normalizeStringArray(raw.contextLabelIds),
    customLabelIds: normalizeStringArray(raw.customLabelIds),
  };
  meta.labels = labels;
  return labels;
}

function removeLabelIdFromAssignments(
  labels: ReturnType<typeof ensureLabelAssignments>,
  labelId: string,
): boolean {
  let changed = false;
  if (labels.workflowStatusLabelId === labelId) {
    labels.workflowStatusLabelId = '';
    changed = true;
  }
  if (labels.priorityLabelId === labelId) {
    labels.priorityLabelId = '';
    changed = true;
  }
  const keys = ['actionLabelIds', 'contextLabelIds', 'customLabelIds'] as const;
  for (const key of keys) {
    const next = labels[key].filter(id => id !== labelId);
    if (!arraysEqual(labels[key], next)) {
      labels[key] = next;
      changed = true;
    }
  }
  return changed;
}

function updateSnapshotTags(
  snapshot: ArchiveSnapshot,
  update: (tags: string[]) => string[],
): boolean {
  const meta = ensureSnapshotMeta(snapshot);
  const current = normalizeTagList(meta.tags);
  const next = normalizeTagList(update(current));
  if (arraysEqual(current, next)) return false;
  meta.tags = next;
  return true;
}

function replaceStoreIfChanged(store: MobileArchiveStore, changed: boolean): void {
  if (changed) replaceArchiveStore(store, { persist: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

function writeFolderRecords(store: MobileArchiveStore, records: ReturnType<typeof readCanonicalFolderRecords>): void {
  const bundleExtras = typeof store.bundleExtras === 'object' && store.bundleExtras !== null && !Array.isArray(store.bundleExtras)
    ? store.bundleExtras
    : {};
  bundleExtras[CANONICAL_FOLDER_INDEX_KEY] = records;
  store.bundleExtras = bundleExtras;
}

function upsertFolderRecord(
  store: MobileArchiveStore,
  folderId: string,
  folderName: string,
  usedAt?: string,
): void {
  const id = normalizeFolderId(folderId);
  const name = normalizeFolderName(folderName);
  if (!id || !name) return;

  const timestamp = nowIso();
  const records = readCanonicalFolderRecords(store);
  const existing = records.find(record => record.id === id);
  if (existing) {
    existing.name = name;
    existing.updatedAt = timestamp;
    if (usedAt) existing.lastUsedAt = usedAt;
  } else {
    records.push({
      id,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: usedAt,
    });
  }
  writeFolderRecords(store, records);
}

export function setArchiveFolderIconColor(folderId: string, folderName: string, iconColor?: string): void {
  const id = normalizeFolderId(folderId);
  const name = normalizeFolderName(folderName);
  if (!id || !name) return;

  const store = cloneStore(getArchiveStoreSnapshot());
  const timestamp = nowIso();
  const color = normalizeFolderIconColor(iconColor);
  const records = readCanonicalFolderRecords(store);
  const existing = records.find(record => record.id === id);
  if (existing) {
    existing.name = name;
    existing.updatedAt = timestamp;
    if (color) {
      existing.iconColor = color;
    } else {
      delete existing.iconColor;
    }
  } else {
    records.push({
      id,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: timestamp,
      ...(color ? { iconColor: color } : {}),
    });
  }
  writeFolderRecords(store, records);
  replaceArchiveStore(store, { persist: true });
}

export function pinArchiveChat(chatId: string): void {
  const store = cloneStore(getArchiveStoreSnapshot());
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return;
  const snapshotId = String(chat.chatIndex?.lastSnapshotId ?? '').trim();
  if (!snapshotId) return;
  const pins: string[] = Array.isArray(chat.chatIndex.pinnedSnapshotIds)
    ? [...(chat.chatIndex.pinnedSnapshotIds as string[])]
    : [];
  if (!pins.includes(snapshotId)) pins.push(snapshotId);
  chat.chatIndex.pinnedSnapshotIds = pins;
  replaceArchiveStore(store, { persist: true });
}

export function unpinArchiveChat(chatId: string): void {
  const store = cloneStore(getArchiveStoreSnapshot());
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return;
  const snapshotId = String(chat.chatIndex?.lastSnapshotId ?? '').trim();
  chat.chatIndex.pinnedSnapshotIds = Array.isArray(chat.chatIndex.pinnedSnapshotIds)
    ? (chat.chatIndex.pinnedSnapshotIds as string[]).filter(id => id !== snapshotId)
    : [];
  replaceArchiveStore(store, { persist: true });
}

export function renameArchiveChat(chatId: string, newTitle: string): void {
  const title = newTitle.trim();
  if (!title) return;
  const store = cloneStore(getArchiveStoreSnapshot());
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return;
  const latestId = String(chat.chatIndex?.lastSnapshotId ?? '').trim();
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  const latest = snapshots.find(s => String(s.snapshotId) === latestId)
    ?? snapshots[snapshots.length - 1];
  if (!latest) return;
  if (typeof latest.meta !== 'object' || latest.meta === null) latest.meta = {};
  latest.meta.title = title;
  replaceArchiveStore(store, { persist: true });
}

export function deleteArchiveChat(chatId: string): void {
  const store = cloneStore(getArchiveStoreSnapshot());
  store.chats = store.chats.filter(c => c.chatId !== chatId);
  replaceArchiveStore(store, { persist: true });
}

export function setArchiveChatTags(chatId: string, tags: string[]): void {
  const store = cloneStore(getArchiveStoreSnapshot());
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return;
  const latestId = String(chat.chatIndex?.lastSnapshotId ?? '').trim();
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  const latest = snapshots.find(s => String(s.snapshotId) === latestId)
    ?? snapshots[snapshots.length - 1];
  if (!latest) return;
  ensureSnapshotMeta(latest).tags = normalizeTagList(tags);
  replaceArchiveStore(store, { persist: true });
}

export function setArchiveChatCategory(chatId: string, primaryCategoryId: string): void {
  const id = String(primaryCategoryId || '').trim();
  if (!id) return;

  const store = cloneStore(getArchiveStoreSnapshot());
  const catalog = readCategoryCatalogRecords(store);
  const latest = findLatestSnapshot(chatId, store);
  if (!latest) return;
  const meta = ensureSnapshotMeta(latest);
  const currentCategory = normalizeCategoryRecord(meta.category, catalog);
  if (currentCategory?.primaryCategoryId === id) return;

  const category = normalizeCategoryRecord({
    primaryCategoryId: id,
    secondaryCategoryId: null,
    source: 'user',
    algorithmVersion: null,
    classifiedAt: null,
    overriddenAt: nowIso(),
    confidence: null,
  }, catalog);
  if (!category) return;

  meta.category = category;
  meta.updatedAt = nowIso();
  replaceArchiveStore(store, { persist: true });
}

export function reclassifyArchiveChatCategory(chatId: string): void {
  const store = cloneStore(getArchiveStoreSnapshot());
  const catalog = readCategoryCatalogRecords(store);
  const latest = findLatestSnapshot(chatId, store);
  if (!latest) return;

  const meta = ensureSnapshotMeta(latest);
  const classifierMeta = { ...meta };
  delete classifierMeta.category;
  const category = normalizeCategoryRecord(
    classifySnapshotCategory(
      { meta: classifierMeta, messages: latest.messages },
      { classifiedAt: nowIso() },
    ),
    catalog,
  );
  if (!category) return;

  meta.category = category;
  meta.updatedAt = nowIso();
  replaceArchiveStore(store, { persist: true });
}

export function seedArchiveLabelCatalog(): void {
  const store = cloneStore(getArchiveStoreSnapshot());
  writeLabelCatalogRecords(store, readLabelCatalogRecords(store));
  replaceArchiveStore(store, { persist: true });
}

export function upsertArchiveLabelRecord(record: Partial<LabelRecord>): void {
  const normalized = normalizeLabelRecord(record);
  if (!normalized) return;
  const store = cloneStore(getArchiveStoreSnapshot());
  const existing = readLabelCatalogRecords(store);
  const next = existing.filter(label => label.id !== normalized.id);
  next.push(normalized);
  writeLabelCatalogRecords(store, next);
  replaceArchiveStore(store, { persist: true });
}

export function assignArchiveChatLabel(chatId: string, labelId: string): void {
  const id = String(labelId || '').trim();
  if (!id) return;

  const store = cloneStore(getArchiveStoreSnapshot());
  const label = findLabelRecord(store, id);
  if (!label) return;

  const latest = findLatestSnapshot(chatId, store);
  if (!latest) return;
  const meta = ensureSnapshotMeta(latest);
  const labels = ensureLabelAssignments(meta);
  removeLabelIdFromAssignments(labels, id);

  if (label.type === 'workflow_status') {
    labels.workflowStatusLabelId = id;
  } else if (label.type === 'priority') {
    labels.priorityLabelId = id;
  } else if (label.type === 'action') {
    labels.actionLabelIds = [...labels.actionLabelIds, id];
  } else if (label.type === 'context') {
    labels.contextLabelIds = [...labels.contextLabelIds, id];
  } else {
    labels.customLabelIds = [...labels.customLabelIds, id];
  }

  meta.updatedAt = nowIso();
  replaceArchiveStore(store, { persist: true });
}

export function removeArchiveChatLabel(chatId: string, labelId: string): void {
  const id = String(labelId || '').trim();
  if (!id) return;

  const store = cloneStore(getArchiveStoreSnapshot());
  const latest = findLatestSnapshot(chatId, store);
  if (!latest) return;
  const meta = ensureSnapshotMeta(latest);
  const labels = ensureLabelAssignments(meta);
  if (!removeLabelIdFromAssignments(labels, id)) return;
  meta.updatedAt = nowIso();
  replaceArchiveStore(store, { persist: true });
}

export function setArchiveChatWorkflowStatusLabel(chatId: string, labelId: string): void {
  const id = String(labelId || '').trim();
  if (id) {
    const store = getArchiveStoreSnapshot();
    const label = findLabelRecord(store, id);
    if (!label || label.type !== 'workflow_status') return;
    assignArchiveChatLabel(chatId, id);
    return;
  }

  const store = cloneStore(getArchiveStoreSnapshot());
  const latest = findLatestSnapshot(chatId, store);
  if (!latest) return;
  const meta = ensureSnapshotMeta(latest);
  const labels = ensureLabelAssignments(meta);
  if (!labels.workflowStatusLabelId) return;
  labels.workflowStatusLabelId = '';
  meta.updatedAt = nowIso();
  replaceArchiveStore(store, { persist: true });
}

export function setArchiveChatPriorityLabel(chatId: string, labelId: string): void {
  const id = String(labelId || '').trim();
  if (id) {
    const store = getArchiveStoreSnapshot();
    const label = findLabelRecord(store, id);
    if (!label || label.type !== 'priority') return;
    assignArchiveChatLabel(chatId, id);
    return;
  }

  const store = cloneStore(getArchiveStoreSnapshot());
  const latest = findLatestSnapshot(chatId, store);
  if (!latest) return;
  const meta = ensureSnapshotMeta(latest);
  const labels = ensureLabelAssignments(meta);
  if (!labels.priorityLabelId) return;
  labels.priorityLabelId = '';
  meta.updatedAt = nowIso();
  replaceArchiveStore(store, { persist: true });
}

export function archiveArchiveChat(chatId: string): void {
  const store = cloneStore(getArchiveStoreSnapshot());
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return;
  const latestId = String(chat.chatIndex?.lastSnapshotId ?? '').trim();
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  const latest = snapshots.find(s => String(s.snapshotId) === latestId)
    ?? snapshots[snapshots.length - 1];
  if (!latest) return;
  ensureSnapshotMeta(latest).archived = true;
  replaceArchiveStore(store, { persist: true });
}

export function unarchiveArchiveChat(chatId: string): void {
  const store = cloneStore(getArchiveStoreSnapshot());
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return;
  const latestId = String(chat.chatIndex?.lastSnapshotId ?? '').trim();
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  const latest = snapshots.find(s => String(s.snapshotId) === latestId)
    ?? snapshots[snapshots.length - 1];
  if (!latest) return;
  const meta = ensureSnapshotMeta(latest);
  delete meta.archived;
  delete meta.state;
  replaceArchiveStore(store, { persist: true });
}

export interface CreateFolderOptions {
  kind?: 'local' | 'project_backed';
  projectRef?: ProjectRef | null;
}

export function createArchiveFolder(folderName: string, options: CreateFolderOptions = {}): void {
  const name = normalizeFolderName(folderName);
  if (!name) return;

  const store = cloneStore(getArchiveStoreSnapshot());
  const existingFolders = deriveCanonicalFolders(deriveArchiveLibraryRows(store), store);
  if (existingFolders.some(folder => folder.name === name)) return;

  const records = readCanonicalFolderRecords(store);

  const timestamp = nowIso();
  records.push({
    id: createCanonicalFolderId(name),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    kind: options.kind ?? 'local',
    ...(options.projectRef ? { projectRef: options.projectRef } : {}),
  });
  writeFolderRecords(store, records);
  replaceArchiveStore(store, { persist: true });
}

export function assignArchiveChatToFolder(chatId: string, folderId: string, folderName: string): void {
  const id = normalizeFolderId(folderId);
  const name = normalizeFolderName(folderName);
  if (!id || !name) return;

  const store = cloneStore(getArchiveStoreSnapshot());
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return;
  const latestId = String(chat.chatIndex?.lastSnapshotId ?? '').trim();
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  const latest = snapshots.find(s => String(s.snapshotId) === latestId)
    ?? snapshots[snapshots.length - 1];
  if (!latest) return;

  const meta = ensureSnapshotMeta(latest);
  meta.folderId = id;
  meta.folderName = name;
  meta.folderBindingSource = 'user';
  delete meta.folder;
  upsertFolderRecord(store, id, name, String(meta.updatedAt || latest.createdAt || nowIso()));
  replaceArchiveStore(store, { persist: true });
}

export function removeArchiveChatFromFolder(chatId: string): void {
  const store = cloneStore(getArchiveStoreSnapshot());
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return;
  const latestId = String(chat.chatIndex?.lastSnapshotId ?? '').trim();
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  const latest = snapshots.find(s => String(s.snapshotId) === latestId)
    ?? snapshots[snapshots.length - 1];
  if (!latest) return;

  const meta = ensureSnapshotMeta(latest);
  if (!meta.folderId && !meta.folderName && !meta.folder) return;
  delete meta.folderId;
  delete meta.folderName;
  delete meta.folder;
  delete meta.folderBindingSource;
  replaceArchiveStore(store, { persist: true });
}

export function renameArchiveTagGlobally(fromTag: string, toTag: string): number {
  const from = normalizeTagInput(fromTag);
  const to = normalizeTagInput(toTag);
  if (!from || !to || from === to) return 0;

  const store = cloneStore(getArchiveStoreSnapshot());
  let changedSnapshots = 0;

  for (const chat of store.chats) {
    for (const snapshot of Array.isArray(chat.snapshots) ? chat.snapshots : []) {
      const changed = updateSnapshotTags(snapshot, tags => tags.map(tag => (tag === from ? to : tag)));
      if (changed) changedSnapshots += 1;
    }
  }

  replaceStoreIfChanged(store, changedSnapshots > 0);
  return changedSnapshots;
}

export function deleteArchiveTagGlobally(tag: string): number {
  const target = normalizeTagInput(tag);
  if (!target) return 0;

  const store = cloneStore(getArchiveStoreSnapshot());
  let changedSnapshots = 0;

  for (const chat of store.chats) {
    for (const snapshot of Array.isArray(chat.snapshots) ? chat.snapshots : []) {
      const changed = updateSnapshotTags(snapshot, tags => tags.filter(item => item !== target));
      if (changed) changedSnapshots += 1;
    }
  }

  replaceStoreIfChanged(store, changedSnapshots > 0);
  return changedSnapshots;
}

export function editArchiveChatMessage(
  chatId: string,
  snapshotId: string,
  order: number,
  newText: string,
): void {
  const text = newText.trim();
  if (!text) return;
  const store = cloneStore(getArchiveStoreSnapshot());
  const chat = store.chats.find(c => c.chatId === chatId);
  if (!chat) return;
  const snapshot = (Array.isArray(chat.snapshots) ? chat.snapshots : [])
    .find(s => s.snapshotId === snapshotId);
  if (!snapshot) return;
  const msg = (Array.isArray(snapshot.messages) ? snapshot.messages : [])
    .find(m => m.order === order);
  if (!msg) return;
  msg.text = text;
  replaceArchiveStore(store, { persist: true });
}

export function mergeArchiveTagGlobally(fromTag: string, toTag: string): number {
  const from = normalizeTagInput(fromTag);
  const to = normalizeTagInput(toTag);
  if (!from || !to || from === to) return 0;

  const store = cloneStore(getArchiveStoreSnapshot());
  let changedSnapshots = 0;

  for (const chat of store.chats) {
    for (const snapshot of Array.isArray(chat.snapshots) ? chat.snapshots : []) {
      const changed = updateSnapshotTags(snapshot, tags => {
        let hadSource = false;
        const next: string[] = [];
        for (const tag of tags) {
          if (tag === from) {
            hadSource = true;
          } else {
            next.push(tag);
          }
        }
        if (hadSource) next.push(to);
        return next;
      });
      if (changed) changedSnapshots += 1;
    }
  }

  replaceStoreIfChanged(store, changedSnapshots > 0);
  return changedSnapshots;
}
