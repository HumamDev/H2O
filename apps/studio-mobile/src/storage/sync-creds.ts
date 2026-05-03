import {
  documentDirectory,
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

export const WEBDAV_SYNC_SETTINGS_SCHEMA = 'h2o.mobile.webdav.settings.v1' as const;
export const WEBDAV_SYNC_SETTINGS_FILE_NAME = 'h2o_webdav_settings_v1.json';

const FILE_PATH = `${documentDirectory}${WEBDAV_SYNC_SETTINGS_FILE_NAME}`;

export interface WebDAVSyncSettingsInput {
  serverUrl: string;
  username: string;
  password: string;
  rootPath?: string;
}

export interface WebDAVSyncSettings extends WebDAVSyncSettingsInput {
  schema: typeof WEBDAV_SYNC_SETTINGS_SCHEMA;
  rootPath: string;
  updatedAt: string;
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastPullAt?: string;
  lastPushAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalIso(value: unknown): string | undefined {
  const text = str(value);
  return text || undefined;
}

export function createEmptyWebDAVSyncSettings(createdAt: string = nowIso()): WebDAVSyncSettings {
  return {
    schema: WEBDAV_SYNC_SETTINGS_SCHEMA,
    serverUrl: '',
    username: '',
    password: '',
    rootPath: 'H2O',
    updatedAt: createdAt,
  };
}

export function normalizeWebDAVSyncSettings(
  raw: unknown,
  normalizedAt: string = nowIso(),
): WebDAVSyncSettings {
  if (!isObject(raw)) return createEmptyWebDAVSyncSettings(normalizedAt);

  return {
    schema: WEBDAV_SYNC_SETTINGS_SCHEMA,
    serverUrl: str(raw.serverUrl || raw.url || raw.baseUrl),
    username: str(raw.username || raw.user),
    password: typeof raw.password === 'string' ? raw.password : '',
    rootPath: str(raw.rootPath || raw.root || raw.folder) || 'H2O',
    updatedAt: str(raw.updatedAt) || normalizedAt,
    lastTestAt: optionalIso(raw.lastTestAt),
    lastTestOk: typeof raw.lastTestOk === 'boolean' ? raw.lastTestOk : undefined,
    lastPullAt: optionalIso(raw.lastPullAt),
    lastPushAt: optionalIso(raw.lastPushAt),
  };
}

export async function loadWebDAVSyncSettings(): Promise<WebDAVSyncSettings> {
  try {
    const json = await readAsStringAsync(FILE_PATH, {
      encoding: EncodingType.UTF8,
    });
    return normalizeWebDAVSyncSettings(JSON.parse(json));
  } catch {
    return createEmptyWebDAVSyncSettings();
  }
}

export async function saveWebDAVSyncSettings(
  settings: Partial<WebDAVSyncSettings> & WebDAVSyncSettingsInput,
): Promise<WebDAVSyncSettings> {
  const normalized = normalizeWebDAVSyncSettings({
    ...settings,
    updatedAt: nowIso(),
  });
  await writeAsStringAsync(FILE_PATH, JSON.stringify(normalized), {
    encoding: EncodingType.UTF8,
  });
  return normalized;
}

