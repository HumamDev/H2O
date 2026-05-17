// expo-file-system v55 moved the legacy string-based API to a sub-path export.
// The new class-based API (File/Directory) works too, but the legacy path is
// simpler for straightforward JSON read/write and requires no extra setup.
import {
  documentDirectory,
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import type { ImportedChat } from '@/types/import-chatgpt-link';

// Versioned filename — bump suffix only when a breaking schema change requires
// discarding rather than migrating old data.
const FILE_PATH = `${documentDirectory}h2o_imported_chats_v1.json`;

/** Reads persisted imported chats from disk. Returns [] on any error. */
export async function loadImportedChats(): Promise<ImportedChat[]> {
  try {
    const json = await readAsStringAsync(FILE_PATH, {
      encoding: EncodingType.UTF8,
    });
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as ImportedChat[]) : [];
  } catch {
    // File missing (first launch) or corrupt — start fresh.
    return [];
  }
}

/** Writes the full imported-chats array to disk. */
export async function saveImportedChats(chats: ImportedChat[]): Promise<void> {
  await writeAsStringAsync(FILE_PATH, JSON.stringify(chats), {
    encoding: EncodingType.UTF8,
  });
}
