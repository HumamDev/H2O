import { exportArchiveBundle } from '@/exporters/archive-bundle';
import { mergeArchiveBundleIntoStore, normalizeArchiveBundle } from '@/importers/archive-bundle';
import {
  ensureArchiveStoreHydrated,
  getArchiveStoreSnapshot,
  replaceArchiveStore,
} from '@/state/archive';
import {
  normalizeArchiveStore,
  saveArchiveStore,
} from '@/storage/archive-store';
import {
  loadWebDAVSyncSettings,
  saveWebDAVSyncSettings,
  type WebDAVSyncSettings,
  type WebDAVSyncSettingsInput,
} from '@/storage/sync-creds';
import type { ArchiveImportReport } from '@/types/archive';
import {
  getWebDAVJson,
  putWebDAVJson,
  testWebDAVConnection as testWebDAVConnectionRequest,
  WEBDAV_ARCHIVE_FILE_NAME,
  WebDAVHttpError,
} from '@/utils/webdav';

export interface WebDAVConnectionResult {
  ok: true;
  url: string;
  status: number;
  testedAt: string;
}

export interface WebDAVArchivePullResult {
  ok: true;
  url: string;
  status: number;
  pulledAt: string;
  report: ArchiveImportReport;
}

export interface WebDAVArchivePushResult {
  ok: true;
  url: string;
  status: number;
  pushedAt: string;
  chatCount: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function messageFromError(err: unknown, action: 'test' | 'pull' | 'push'): string {
  if (err instanceof WebDAVHttpError && err.status === 404) {
    if (action === 'pull') return `Remote ${WEBDAV_ARCHIVE_FILE_NAME} was not found.`;
    if (action === 'test') return 'WebDAV folder was not found.';
    return 'WebDAV folder was not found; push could not create h2o-archive.json.';
  }
  return err instanceof Error ? err.message : 'WebDAV sync failed.';
}

async function settingsForAction(input?: WebDAVSyncSettingsInput): Promise<WebDAVSyncSettings> {
  if (input) return saveWebDAVSyncSettings(input);
  return loadWebDAVSyncSettings();
}

export async function testWebDAVConnection(
  input?: WebDAVSyncSettingsInput,
): Promise<WebDAVConnectionResult> {
  const settings = await settingsForAction(input);
  const testedAt = nowIso();

  try {
    const result = await testWebDAVConnectionRequest(settings);
    await saveWebDAVSyncSettings({
      ...settings,
      lastTestAt: testedAt,
      lastTestOk: true,
    });
    return { ok: true, url: result.url, status: result.status, testedAt };
  } catch (err) {
    await saveWebDAVSyncSettings({
      ...settings,
      lastTestAt: testedAt,
      lastTestOk: false,
    });
    throw new Error(messageFromError(err, 'test'));
  }
}

export async function pullArchiveFromWebDAV(
  input?: WebDAVSyncSettingsInput,
): Promise<WebDAVArchivePullResult> {
  await ensureArchiveStoreHydrated();
  const settings = await settingsForAction(input);
  const pulledAt = nowIso();

  let remote;
  try {
    remote = await getWebDAVJson(settings, WEBDAV_ARCHIVE_FILE_NAME);
  } catch (err) {
    throw new Error(messageFromError(err, 'pull'));
  }

  const validation = normalizeArchiveBundle(remote.json);
  if (!validation.ok) {
    const details = validation.errors.map(e => e.message).join(' ');
    throw new Error(`Remote ${WEBDAV_ARCHIVE_FILE_NAME} is not a valid archive bundle: ${details}`);
  }

  const currentStore = getArchiveStoreSnapshot();
  const { store: mergedStore, report } = mergeArchiveBundleIntoStore(currentStore, validation.bundle);
  const normalizedStore = normalizeArchiveStore(mergedStore, pulledAt);

  await saveArchiveStore(normalizedStore);
  replaceArchiveStore(normalizedStore, { persist: false });

  await saveWebDAVSyncSettings({
    ...settings,
    lastPullAt: pulledAt,
  });

  return {
    ok: true,
    url: remote.url,
    status: remote.status,
    pulledAt,
    report,
  };
}

export async function pushArchiveToWebDAV(
  input?: WebDAVSyncSettingsInput,
): Promise<WebDAVArchivePushResult> {
  await ensureArchiveStoreHydrated();
  const settings = await settingsForAction(input);
  const pushedAt = nowIso();
  const store = getArchiveStoreSnapshot();
  const bundle = exportArchiveBundle(store, { exportedAt: pushedAt });
  const json = JSON.stringify(bundle, null, 2);
  const result = await putWebDAVJson(settings, WEBDAV_ARCHIVE_FILE_NAME, json).catch(err => {
    throw new Error(messageFromError(err, 'push'));
  });

  await saveWebDAVSyncSettings({
    ...settings,
    lastPushAt: pushedAt,
  });

  return {
    ok: true,
    url: result.url,
    status: result.status,
    pushedAt,
    chatCount: bundle.chats.length,
  };
}
