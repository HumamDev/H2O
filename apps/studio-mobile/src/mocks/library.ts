import type { Chat, Folder } from '@/types/library';

export const MOCK_FOLDERS: Folder[] = [
  { id: 'f1', name: 'Work Projects', chatCount: 3 },
  { id: 'f2', name: 'Research Notes', chatCount: 2 },
  { id: 'f3', name: 'Personal', chatCount: 0 },
];

function mockChat(input: {
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
  pinned: boolean;
  folderId?: string;
}): Chat {
  return {
    id: input.id,
    chatId: input.id,
    snapshotId: `${input.id}:mock`,
    title: input.title,
    snippet: input.snippet,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
    messageCount: 0,
    answerCount: 0,
    pinned: input.pinned,
    archived: false,
    folderId: input.folderId,
    originSource: 'unknown',
    source: 'unknown',
    originProjectRef: null,
    category: null,
    labels: {
      actionLabelIds: [],
      contextLabelIds: [],
      customLabelIds: [],
    },
    tags: [],
    keywords: [],
  };
}

export const MOCK_CHATS: Chat[] = [
  mockChat({
    id: 'c1',
    title: 'Refactor auth middleware',
    snippet: 'Discussed session token storage approach and compliance requirements.',
    updatedAt: '2026-04-16T09:30:00Z',
    pinned: true,
    folderId: 'f1',
  }),
  mockChat({
    id: 'c2',
    title: 'API design review',
    snippet: 'REST vs GraphQL trade-offs for the new reporting endpoint.',
    updatedAt: '2026-04-15T18:45:00Z',
    pinned: true,
    folderId: 'f1',
  }),
  mockChat({
    id: 'c3',
    title: 'Pagination windowing deep dive',
    snippet: 'Virtual scroll strategy and performance scheduler integration.',
    updatedAt: '2026-04-14T14:00:00Z',
    pinned: false,
    folderId: 'f2',
  }),
  mockChat({
    id: 'c4',
    title: 'Deploy checklist for v0.8',
    snippet: 'Migration safety, rollback plan, and feature flags.',
    updatedAt: '2026-04-13T11:20:00Z',
    pinned: false,
    folderId: 'f1',
  }),
  mockChat({
    id: 'c5',
    title: 'Highlight dots architecture',
    snippet: 'inlineDotMap truth source, applyMiniMapDots flow, stale closure fix.',
    updatedAt: '2026-04-12T08:55:00Z',
    pinned: false,
    folderId: 'f2',
  }),
  mockChat({
    id: 'c6',
    title: 'Weekend reading list',
    snippet: 'Papers on CRDT sync and distributed SQLite approaches.',
    updatedAt: '2026-04-10T20:10:00Z',
    pinned: false,
  }),
  mockChat({
    id: 'c7',
    title: 'Team offsite brainstorm',
    snippet: 'Q3 roadmap ideas, focus areas, and open questions from the retro.',
    updatedAt: '2026-04-08T16:30:00Z',
    pinned: false,
  }),
];
