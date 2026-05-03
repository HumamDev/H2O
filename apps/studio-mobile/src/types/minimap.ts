export type MiniMapTurnRole = 'user' | 'assistant' | 'system' | 'unknown';

/** Reserved for future MiniMap view modes. Default is 'turn'. */
export type MiniMapMode = 'turn' | 'qa';

/** @deprecated — superseded by MiniMapTurnPair for the chat screen. */
export interface MiniMapTurn {
  id: string;
  index: number;
  role: MiniMapTurnRole;
}

/**
 * One MiniMap box = one QA turn pair.
 * questionIndex → FlatList index of the user message (double-tap target).
 * answerIndex   → FlatList index of the first assistant reply (single-tap target).
 *                 null when a user message has no assistant reply yet.
 */
export interface MiniMapTurnPair {
  id: string;
  pairIndex: number;
  questionIndex: number;
  answerIndex: number | null;
}
