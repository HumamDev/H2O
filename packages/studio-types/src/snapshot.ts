/**
 * Canonical snapshot schema — the normalized representation of a ChatGPT conversation
 * as it is stored on-device and used across parser, renderer, and search.
 *
 * TODO: define shared snapshot schema
 * TODO: version the schema for safe migrations
 */

export interface ConversationSnapshot {
  id: string;
  title: string;
  createdAt: number;   // unix ms
  updatedAt: number;   // unix ms
  turns: Turn[];
}

export interface Turn {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: TurnContent[];
  createdAt: number;
}

export type TurnContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; url: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; toolCallId: string; output: unknown };
