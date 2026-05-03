import { useSyncExternalStore } from 'react';
import {
  getArchiveStoreSnapshot,
  isArchiveStoreHydrated,
  subscribeArchiveStore,
} from '@/state/archive';
import { deriveLatestArchiveSnapshot } from '@/features/library/archive-rows';
import type { ArchiveChat, ArchiveSnapshot } from '@/types/archive';

export type ArchiveChatReaderState =
  | { status: 'hydrating' }
  | { status: 'not-found'; chatId: string }
  | { status: 'no-snapshot'; chatId: string; chat: ArchiveChat }
  | { status: 'ready'; chatId: string; chat: ArchiveChat; snapshot: ArchiveSnapshot };

export function useArchiveChat(chatId: string): ArchiveChatReaderState {
  const store = useSyncExternalStore(subscribeArchiveStore, getArchiveStoreSnapshot);

  if (!isArchiveStoreHydrated()) return { status: 'hydrating' };

  const chat = (Array.isArray(store.chats) ? store.chats : [])
    .find(c => c.chatId === chatId);

  if (!chat) return { status: 'not-found', chatId };

  const snapshot = deriveLatestArchiveSnapshot(chat);
  if (!snapshot) return { status: 'no-snapshot', chatId, chat };

  return { status: 'ready', chatId, chat, snapshot };
}
