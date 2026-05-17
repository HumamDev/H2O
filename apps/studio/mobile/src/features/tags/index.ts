import type {
  ArchiveChat,
  ArchiveJsonObject,
  ArchiveSnapshot,
  MobileArchiveStore,
} from '@/types/archive';

export interface CanonicalTagSummary {
  tag: string;
  count: number;
}

function isObject(value: unknown): value is ArchiveJsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringField(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function metaOf(snapshot: ArchiveSnapshot | null | undefined): ArchiveJsonObject {
  return isObject(snapshot?.meta) ? snapshot.meta : {};
}

function sortKey(snapshot: ArchiveSnapshot): string {
  const meta = metaOf(snapshot);
  return stringField(meta.updatedAt) || stringField(snapshot.createdAt);
}

function latestSnapshot(chat: ArchiveChat): ArchiveSnapshot | null {
  const snapshots = Array.isArray(chat.snapshots) ? chat.snapshots : [];
  let latest: ArchiveSnapshot | null = null;
  for (const snapshot of snapshots) {
    if (!latest) {
      latest = snapshot;
      continue;
    }
    const nextKey = sortKey(snapshot);
    const currentKey = sortKey(latest);
    if (nextKey > currentKey || (nextKey === currentKey && String(snapshot.snapshotId) > String(latest.snapshotId))) {
      latest = snapshot;
    }
  }
  return latest;
}

export function normalizeTagInput(input: unknown): string {
  return String(input ?? '').trim().toLowerCase();
}

export function normalizeTagList(tags: unknown): string[] {
  const src = Array.isArray(tags) ? tags : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of src) {
    const tag = normalizeTagInput(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export function parseTagInput(input: string): string[] {
  return normalizeTagList(input.split(','));
}

export function formatTagsForInput(tags: string[]): string {
  return tags.join(', ');
}

export function collectCanonicalTagSummaries(store: MobileArchiveStore): CanonicalTagSummary[] {
  const counts = new Map<string, number>();
  const chats = Array.isArray(store.chats) ? store.chats : [];

  for (const chat of chats) {
    const latest = latestSnapshot(chat);
    const tags = normalizeTagList(latest?.meta?.tags);
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
