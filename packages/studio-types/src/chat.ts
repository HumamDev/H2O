/**
 * Chat — a stored conversation record in the library.
 * Wraps a ConversationSnapshot with user-facing metadata.
 */

export interface Chat {
  id: string;
  title: string;
  folderId: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** Denormalized: first 140 chars of the first user turn, for list previews. */
  preview: string;
}
