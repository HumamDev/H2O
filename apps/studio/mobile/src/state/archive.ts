import {
  createEmptyArchiveStore,
  loadArchiveStore,
  normalizeArchiveStore,
  saveArchiveStore,
} from '@/storage/archive-store';
import type { MobileArchiveStore } from '@/types/archive';

// ---------------------------------------------------------------------------
// In-memory archive store
// Backed by `global` so Hot Module Replacement in dev cannot clear state.
// ---------------------------------------------------------------------------

type StoreShape = {
  archive: MobileArchiveStore;
  listeners: Set<() => void>;
  hydrated: boolean;
  hydrationPromise: Promise<void> | null;
};

const g = global as Record<string, unknown>;
if (!g.__h2o_archiveStore) {
  const init: StoreShape = {
    archive: createEmptyArchiveStore(),
    listeners: new Set<() => void>(),
    hydrated: false,
    hydrationPromise: null,
  };
  g.__h2o_archiveStore = init;
}
const _store = g.__h2o_archiveStore as StoreShape;

function _notify(): void {
  _store.listeners.forEach(fn => fn());
}

// Fire-and-forget persistence — UI can optimistically react to the in-memory state.
function _persist(): void {
  saveArchiveStore(_store.archive).catch(() => { /* silent — callers already have runtime state */ });
}

// ---------------------------------------------------------------------------
// Public store API (useSyncExternalStore contract)
// ---------------------------------------------------------------------------

export function subscribeArchiveStore(listener: () => void): () => void {
  _store.listeners.add(listener);
  return () => _store.listeners.delete(listener);
}

export function getArchiveStoreSnapshot(): MobileArchiveStore {
  return _store.archive;
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export async function initArchiveStore(): Promise<void> {
  if (_store.hydrated) return;
  if (_store.hydrationPromise) {
    await _store.hydrationPromise;
    return;
  }

  _store.hydrationPromise = (async () => {
    _store.archive = await loadArchiveStore();
    _store.hydrated = true;
    _store.hydrationPromise = null;
    _notify();
  })();

  await _store.hydrationPromise;
}

export async function ensureArchiveStoreHydrated(): Promise<void> {
  await initArchiveStore();
}

export async function reloadArchiveStore(): Promise<MobileArchiveStore> {
  const archive = await loadArchiveStore();
  _store.archive = archive;
  _store.hydrated = true;
  _store.hydrationPromise = null;
  _notify();
  return archive;
}

export function replaceArchiveStore(
  next: MobileArchiveStore,
  options: { persist?: boolean } = {},
): MobileArchiveStore {
  const normalized = normalizeArchiveStore(next);
  _store.archive = normalized;
  _store.hydrated = true;
  _store.hydrationPromise = null;
  if (options.persist !== false) _persist();
  _notify();
  return normalized;
}

export const setArchiveStore = replaceArchiveStore;

export function isArchiveStoreHydrated(): boolean {
  return _store.hydrated;
}
