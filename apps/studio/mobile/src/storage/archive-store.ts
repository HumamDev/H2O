import {
  documentDirectory,
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import {
  MOBILE_ARCHIVE_STORE_SCHEMA,
  type ArchiveChat,
  type ArchiveJsonObject,
  type MobileArchiveStore,
} from '@/types/archive';
import { normalizeArchiveChat } from '@/importers/archive-bundle';
import { ensureDefaultCategoryCatalog, readCategoryCatalogRecords } from '@/features/categories';
import { ensureDefaultLabelCatalog } from '@/features/labels';

export const ARCHIVE_STORE_FILE_NAME = 'h2o_chat_archive_v1.json';

const FILE_PATH = `${documentDirectory}${ARCHIVE_STORE_FILE_NAME}`;

function nowIso(): string {
  return new Date().toISOString();
}

function isObject(value: unknown): value is ArchiveJsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function createEmptyArchiveStore(createdAt: string = nowIso()): MobileArchiveStore {
  return ensureDefaultCategoryCatalog(ensureDefaultLabelCatalog({
    schema: MOBILE_ARCHIVE_STORE_SCHEMA,
    updatedAt: createdAt,
    bundleExtras: {},
    chats: [],
  }));
}

export function normalizeArchiveStore(raw: unknown, normalizedAt: string = nowIso()): MobileArchiveStore {
  if (!isObject(raw)) return createEmptyArchiveStore(normalizedAt);

  const chats: ArchiveChat[] = [];
  const rawChats = Array.isArray(raw.chats) ? raw.chats : [];
  const categoryCatalog = readCategoryCatalogRecords({
    schema: MOBILE_ARCHIVE_STORE_SCHEMA,
    updatedAt: String(raw.updatedAt || normalizedAt),
    bundleExtras: isObject(raw.bundleExtras) ? { ...raw.bundleExtras } : {},
    chats: [],
  });
  for (const item of rawChats) {
    const chat = normalizeArchiveChat(item, categoryCatalog);
    if (chat) chats.push(chat);
  }

  return ensureDefaultCategoryCatalog(ensureDefaultLabelCatalog({
    ...raw,
    schema: MOBILE_ARCHIVE_STORE_SCHEMA,
    updatedAt: String(raw.updatedAt || normalizedAt),
    bundleExtras: isObject(raw.bundleExtras) ? { ...raw.bundleExtras } : {},
    chats,
  }));
}

export async function loadArchiveStore(): Promise<MobileArchiveStore> {
  try {
    const json = await readAsStringAsync(FILE_PATH, {
      encoding: EncodingType.UTF8,
    });
    return normalizeArchiveStore(JSON.parse(json));
  } catch {
    return createEmptyArchiveStore();
  }
}

export async function saveArchiveStore(store: MobileArchiveStore): Promise<void> {
  const normalized = normalizeArchiveStore(store);
  await writeAsStringAsync(FILE_PATH, JSON.stringify(normalized), {
    encoding: EncodingType.UTF8,
  });
}
