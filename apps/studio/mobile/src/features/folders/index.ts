import type { ArchiveLibraryRow } from '@/features/library/archive-rows';
import { projectColorOptions } from '@/theme';
import type { ArchiveJsonObject, MobileArchiveStore } from '@/types/archive';
import type { Folder, ProjectRef } from '@/types/library';

export const CANONICAL_FOLDER_INDEX_KEY = 'h2oMobileFolders';
export const UNFILED_FOLDER_ID = '__unfiled__';

export type FolderSortMode = 'alphabetical' | 'newest-created' | 'most-recent-use';

export interface FolderAssignment {
  id: string;
  name: string;
}

export interface CanonicalFolderRecord extends FolderAssignment {
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  iconColor?: string;
  kind?: 'local' | 'project_backed';
  projectRef?: ProjectRef | null;
}

function isObject(value: unknown): value is ArchiveJsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function normalizeFolderName(input: unknown): string {
  return String(input ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeFolderId(input: unknown): string {
  return String(input ?? '').trim();
}

export function normalizeFolderIconColor(input: unknown): string | undefined {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return undefined;
  const match = projectColorOptions.find(option => option.color.toLowerCase() === value.toLowerCase());
  return match?.color;
}

export function createCanonicalFolderId(name: string): string {
  const cleanName = normalizeFolderName(name);
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `folder:${slug || 'folder'}-${hashString(cleanName)}`;
}

function stringField(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function normalizeProjectRef(input: unknown): ProjectRef | null {
  if (!isObject(input)) return null;
  const id = stringField(input.id ?? input.projectId);
  if (!id) return null;
  const name = stringField(input.name ?? input.projectName) || id;
  return { id, name };
}

function normalizeFolderKind(input: unknown): 'local' | 'project_backed' {
  return stringField(input).toLowerCase() === 'project_backed' ? 'project_backed' : 'local';
}

function rowUseTime(row: Pick<ArchiveLibraryRow, 'updatedAt' | 'createdAt'>): string {
  return stringField(row.updatedAt) || stringField(row.createdAt);
}

function latestTime(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function readCanonicalFolderRecords(store: MobileArchiveStore): CanonicalFolderRecord[] {
  const rawRecords = Array.isArray(store.bundleExtras?.[CANONICAL_FOLDER_INDEX_KEY])
    ? store.bundleExtras[CANONICAL_FOLDER_INDEX_KEY]
    : [];
  const out: CanonicalFolderRecord[] = [];
  const seen = new Set<string>();

  for (const raw of rawRecords) {
    if (!isObject(raw)) continue;
    const name = normalizeFolderName(raw.name);
    const id = normalizeFolderId(raw.id) || (name ? createCanonicalFolderId(name) : '');
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const createdAt = stringField(raw.createdAt) || stringField(raw.updatedAt) || new Date(0).toISOString();
    out.push({
      id,
      name,
      createdAt,
      updatedAt: stringField(raw.updatedAt) || createdAt,
      lastUsedAt: stringField(raw.lastUsedAt) || undefined,
      iconColor: normalizeFolderIconColor(raw.iconColor),
      kind: normalizeFolderKind(raw.kind),
      projectRef: normalizeProjectRef(raw.projectRef),
    });
  }

  return out;
}

export function folderIdentityFromRow(row: Pick<ArchiveLibraryRow, 'folderId' | 'folderName'>): FolderAssignment | null {
  const name = normalizeFolderName(row.folderName);
  const id = normalizeFolderId(row.folderId) || (name ? createCanonicalFolderId(name) : '');
  if (!id) return null;
  return {
    id,
    name: name || id,
  };
}

export function deriveCanonicalFolders(
  rows: ArchiveLibraryRow[],
  store?: MobileArchiveStore,
  sortMode: FolderSortMode = 'alphabetical',
): Folder[] {
  const byId = new Map<string, Folder>();

  if (store) {
    for (const record of readCanonicalFolderRecords(store)) {
      byId.set(record.id, {
        id: record.id,
        name: record.name,
        chatCount: 0,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastUsedAt: record.lastUsedAt || record.updatedAt || record.createdAt,
        iconColor: record.iconColor,
        kind: record.kind || 'local',
        projectRef: record.projectRef || null,
      });
    }
  }

  for (const row of rows) {
    const identity = folderIdentityFromRow(row);
    if (!identity) continue;
    const usedAt = rowUseTime(row);
    const existing = byId.get(identity.id);
    if (existing) {
      existing.chatCount += 1;
      if (existing.name === identity.id && identity.name !== identity.id) existing.name = identity.name;
      existing.lastUsedAt = latestTime(existing.lastUsedAt, usedAt);
      if (!existing.createdAt) existing.createdAt = usedAt;
      existing.updatedAt = latestTime(existing.updatedAt, usedAt);
    } else {
      byId.set(identity.id, {
        id: identity.id,
        name: identity.name,
        chatCount: 1,
        createdAt: usedAt,
        updatedAt: usedAt,
        lastUsedAt: usedAt,
        kind: 'local',
        projectRef: null,
      });
    }
  }

  return sortCanonicalFolders([...byId.values()], sortMode);
}

export function sortCanonicalFolders(folders: Folder[], sortMode: FolderSortMode): Folder[] {
  return [...folders].sort((a, b) => {
    if (sortMode === 'newest-created') {
      const byCreated = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      if (byCreated) return byCreated;
    } else if (sortMode === 'most-recent-use') {
      const byUsed = String(b.lastUsedAt || b.createdAt || '').localeCompare(String(a.lastUsedAt || a.createdAt || ''));
      if (byUsed) return byUsed;
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function getChatsForFolder(rows: ArchiveLibraryRow[], folderId: string): ArchiveLibraryRow[] {
  const target = normalizeFolderId(folderId);
  if (!target) return [];
  return rows.filter(row => folderIdentityFromRow(row)?.id === target);
}

export function isUnfiledFolderId(folderId: string): boolean {
  return normalizeFolderId(folderId) === UNFILED_FOLDER_ID;
}

export function getUnfiledChats(rows: ArchiveLibraryRow[]): ArchiveLibraryRow[] {
  return rows.filter(row => !folderIdentityFromRow(row));
}

export function findFolderAssignmentByName(folders: Folder[], name: string): FolderAssignment | null {
  const cleanName = normalizeFolderName(name);
  if (!cleanName) return null;
  const existing = folders.find(folder => folder.name === cleanName);
  return existing
    ? { id: existing.id, name: existing.name }
    : { id: createCanonicalFolderId(cleanName), name: cleanName };
}
