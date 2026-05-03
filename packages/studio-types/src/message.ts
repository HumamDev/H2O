/**
 * Message — a single turn as it is persisted in SQLite.
 * Flat projection of Turn, optimised for queries and FTS indexing.
 *
 * TODO: expand once transcript rendering requirements are settled
 */

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  textContent: string;
  createdAt: number;
  turnIndex: number;
}
