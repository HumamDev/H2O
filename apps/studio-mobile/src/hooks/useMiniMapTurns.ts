import { useMemo } from 'react';

import type { ArchiveMessage } from '@/types/archive';
import type { MiniMapTurnPair } from '@/types/minimap';

/**
 * Derives QA turn pairs from a pre-sorted ArchiveMessage array.
 *
 * Rules:
 *   - Each user message starts a new pair.
 *   - The first assistant message after a user message is the answer.
 *   - Consecutive user messages each get their own pair (answerIndex: null)
 *     until an assistant message follows.
 *   - System / unknown messages at the list start are skipped;
 *     system messages between turns are also skipped.
 *
 * The resulting indices are FlatList positions, so scrollToIndex(pair.answerIndex)
 * navigates directly to the correct message.
 */
export function useMiniMapTurns(messages: ArchiveMessage[]): MiniMapTurnPair[] {
  return useMemo(() => {
    const pairs: MiniMapTurnPair[] = [];
    let pairIndex = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role !== 'user') continue;

      let answerIndex: number | null = null;

      // Scan forward for the first assistant reply, stopping at the next user message.
      for (let j = i + 1; j < messages.length; j++) {
        const next = messages[j];
        if (next.role === 'user') break;
        if (next.role === 'assistant') {
          answerIndex = j;
          break;
        }
        // system / unknown → keep scanning
      }

      pairs.push({
        id: `pair-${messages[i].order}`,
        pairIndex,
        questionIndex: i,
        answerIndex,
      });
      pairIndex++;
    }

    return pairs;
  }, [messages]);
}
