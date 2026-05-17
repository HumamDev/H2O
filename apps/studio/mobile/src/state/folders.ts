import type { FolderSortMode } from '@/features/folders';

type StoreShape = {
  sortMode: FolderSortMode;
  listeners: Set<() => void>;
};

const g = global as Record<string, unknown>;
if (!g.__h2o_folders) {
  g.__h2o_folders = {
    sortMode: 'alphabetical',
    listeners: new Set<() => void>(),
  } as StoreShape;
}
const _store = g.__h2o_folders as StoreShape;

function _notify(): void {
  _store.listeners.forEach(fn => fn());
}

export function subscribeFolderSort(listener: () => void): () => void {
  _store.listeners.add(listener);
  return () => _store.listeners.delete(listener);
}

export function getFolderSortMode(): FolderSortMode {
  return _store.sortMode;
}

export function setFolderSortMode(sortMode: FolderSortMode): void {
  if (_store.sortMode === sortMode) return;
  _store.sortMode = sortMode;
  _notify();
}
