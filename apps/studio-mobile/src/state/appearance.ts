import {
  documentDirectory,
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

export type AppearanceMode = 'system' | 'light' | 'dark' | 'cockpit';
export type TopBarPosition = 'standard' | 'reachable';

const FILE_PATH = `${documentDirectory}h2o_appearance_v2.json`;

type StoreShape = {
  mode: AppearanceMode;
  topBarPosition: TopBarPosition;
  modeListeners: Set<() => void>;
  posListeners: Set<() => void>;
  hydrated: boolean;
};

const g = global as Record<string, unknown>;
if (!g.__h2o_appearance2) {
  g.__h2o_appearance2 = {
    mode: 'cockpit' as AppearanceMode,
    topBarPosition: 'standard' as TopBarPosition,
    modeListeners: new Set<() => void>(),
    posListeners: new Set<() => void>(),
    hydrated: false,
  } as StoreShape;
}
const _store = g.__h2o_appearance2 as StoreShape;

function _notifyMode(): void {
  _store.modeListeners.forEach(fn => fn());
}
function _notifyPos(): void {
  _store.posListeners.forEach(fn => fn());
}

function _persist(): void {
  writeAsStringAsync(
    FILE_PATH,
    JSON.stringify({ mode: _store.mode, topBarPosition: _store.topBarPosition }),
    { encoding: EncodingType.UTF8 },
  ).catch(() => {});
}

export function subscribeAppearance(listener: () => void): () => void {
  _store.modeListeners.add(listener);
  return () => _store.modeListeners.delete(listener);
}

export function getAppearanceMode(): AppearanceMode {
  return _store.mode;
}

export function setAppearanceMode(mode: AppearanceMode): void {
  _store.mode = mode;
  _notifyMode();
  _persist();
}

export function subscribeTopBarPosition(listener: () => void): () => void {
  _store.posListeners.add(listener);
  return () => _store.posListeners.delete(listener);
}

export function getTopBarPosition(): TopBarPosition {
  return _store.topBarPosition;
}

export function setTopBarPosition(pos: TopBarPosition): void {
  _store.topBarPosition = pos;
  _notifyPos();
  _persist();
}

const VALID_MODES = new Set<AppearanceMode>(['system', 'light', 'dark', 'cockpit']);
const VALID_POSITIONS = new Set<TopBarPosition>(['standard', 'reachable']);

/** Load persisted settings from disk. Safe to call multiple times — only runs once. */
export async function initAppearanceStore(): Promise<void> {
  if (_store.hydrated) return;
  _store.hydrated = true;
  try {
    const json = await readAsStringAsync(FILE_PATH, { encoding: EncodingType.UTF8 });
    const parsed = JSON.parse(json) as { mode?: unknown; topBarPosition?: unknown };
    let changed = false;
    // Legacy: persisted 'atmospheric' devices are migrated silently to cockpit
    // — atmospheric was the prior premium-dark variant; cockpit supersedes it.
    const rawMode = parsed.mode === 'atmospheric' ? 'cockpit' : parsed.mode;
    if (rawMode && VALID_MODES.has(rawMode as AppearanceMode)) {
      _store.mode = rawMode as AppearanceMode;
      changed = true;
    }
    if (parsed.topBarPosition && VALID_POSITIONS.has(parsed.topBarPosition as TopBarPosition)) {
      _store.topBarPosition = parsed.topBarPosition as TopBarPosition;
    }
    if (changed) _notifyMode();
    if (parsed.topBarPosition) _notifyPos();
  } catch {
    // First launch or corrupt file — stay on defaults.
  }
}
