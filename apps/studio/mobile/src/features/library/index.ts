import type { Chat, Folder, LabelRecord } from '@/types/library';

function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  return fields.some(f => String(f || '').toLowerCase().includes(q));
}

function flattenLabelSearchTokens(chat: Chat, labelCatalog: LabelRecord[] = []): string[] {
  const labels = chat.labels || {
    workflowStatusLabelId: '',
    priorityLabelId: '',
    actionLabelIds: [],
    contextLabelIds: [],
    customLabelIds: [],
  };

  const ids = [
    labels.workflowStatusLabelId || '',
    labels.priorityLabelId || '',
    ...(labels.actionLabelIds || []),
    ...(labels.contextLabelIds || []),
    ...(labels.customLabelIds || []),
  ].map(id => String(id || '').trim()).filter(Boolean);
  const namesById = new Map(labelCatalog.map(label => [label.id, label.name]));
  return [
    ...ids,
    ...ids.map(id => namesById.get(id) || '').filter(Boolean),
  ];
}

export function filterChats(chats: Chat[], query: string, labelCatalog: LabelRecord[] = []): Chat[] {
  const q = query.trim().toLowerCase();
  if (!q) return chats;

  return chats.filter(chat => {
    const fields = [
      chat.title,
      chat.snippet,
      chat.chatId,
      chat.folderId,
      chat.folderName,
      chat.originSource,
      chat.category?.primaryCategoryId,
      chat.category?.secondaryCategoryId,
      ...(chat.tags || []),
      ...(chat.keywords || []),
      ...flattenLabelSearchTokens(chat, labelCatalog),
    ];

    return fields.some(f => String(f || '').toLowerCase().includes(q));
  });
}

export function filterFolders(folders: Folder[], query: string): Folder[] {
  if (!query.trim()) return folders;
  return folders.filter(f => matchesQuery(query, f.name));
}

export function filterChatsByTag<T extends Chat>(chats: T[], tag: string): T[] {
  const t = tag.trim().toLowerCase();
  if (!t) return chats;
  return chats.filter(c => (c.tags ?? []).some(ct => ct.trim().toLowerCase() === t));
}
