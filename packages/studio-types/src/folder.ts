/**
 * Folder — a named collection of Chats.
 */

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}
